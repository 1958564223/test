/* ====================================================================
 * 瑞幸 MCP 客户端 (Model Context Protocol over HTTP+SSE, JSON-RPC 2.0)
 * 官方服务器: https://gwmcp.lkcoffee.com/order/user/mcp
 * Token 申请: https://open.lkcoffee.com (Token 有效期约 1 个月)
 *
 * 走 Netlify Function 透传代理: /.netlify/functions/mcp-luckin
 *
 * 瑞幸工具集（open.lkcoffee.com 文档，约 8 个）:
 *   门店: queryShopList(deptName?, longitude*, latitude*)
 *   商品: searchProductForMcp(deptId*, query*) / switchProduct(...)
 *         queryProductDetailInfo(deptId*, productId*)
 *   订单: previewOrder(deptId*, productList*)
 *         createOrder(deptId*, productList*, longitude*, latitude*, couponCodeList?)
 *         queryOrderDetailInfo(orderId*) / cancelOrder(orderId*)
 * 信封: { code:0, msg:'success', data:..., success:true }
 * 特点: 瑞幸没有"堂食/外卖"分支，按经纬度下单（取消费用取决于门店）
 *
 * 与糯米机 utils/luckinMcpClient.ts 等价（vanilla JS 版）
 * 暴露为 window.McpLuckinClient
 * ==================================================================== */

(function (global) {
    'use strict';

    const PROXY_URL = '/.netlify/functions/mcp-luckin';
    const TOKEN_KEY = 'ephone.luckin.mcpToken';
    const ENABLED_KEY = 'ephone.luckin.mcpEnabled';

    let requestIdCounter = 0;
    let sessionId = null;
    let initialized = false;
    let cachedTools = [];
    let initPromise = null;

    function buildRequest(method, params, isNotification) {
        const req = { jsonrpc: '2.0', method, params };
        if (!isNotification) req.id = ++requestIdCounter;
        return req;
    }

    function parseSse(text) {
        const dataLines = [];
        for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) dataLines.push(line.slice(6));
            else if (line.startsWith('data:')) dataLines.push(line.slice(5));
        }
        for (let i = dataLines.length - 1; i >= 0; i--) {
            try { return JSON.parse(dataLines[i]); } catch (e) { /* try prev */ }
        }
        return null;
    }

    function parseResp(text, contentType) {
        if (contentType && contentType.indexOf('text/event-stream') >= 0 || /^\s*(event:|data:)/.test(text)) {
            const parsed = parseSse(text);
            if (parsed) return parsed;
        }
        try { return JSON.parse(text); } catch (e) {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
            throw new Error('MCP: 无法解析响应: ' + text.slice(0, 300));
        }
    }

    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    function setToken(t) {
        try { localStorage.setItem(TOKEN_KEY, (t || '').trim()); } catch (e) {}
    }
    function isEnabled() {
        try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch (e) { return false; }
    }
    function setEnabled(v) {
        try { localStorage.setItem(ENABLED_KEY, v ? '1' : '0'); } catch (e) {}
    }
    function isConfigured() { return isEnabled() && getToken().length > 0; }

    function exportLocal() {
        const out = {};
        try {
            const tk = localStorage.getItem(TOKEN_KEY); if (tk) out[TOKEN_KEY] = tk;
            const en = localStorage.getItem(ENABLED_KEY); if (en) out[ENABLED_KEY] = en;
        } catch (e) {}
        return Object.keys(out).length ? out : undefined;
    }
    function importLocal(data) {
        if (!data || typeof data !== 'object') return;
        try {
            if (typeof data[TOKEN_KEY] === 'string') localStorage.setItem(TOKEN_KEY, data[TOKEN_KEY]);
            if (typeof data[ENABLED_KEY] === 'string') localStorage.setItem(ENABLED_KEY, data[ENABLED_KEY]);
        } catch (e) {}
    }

    async function post(body, expectResponse) {
        const token = getToken();
        if (!token) throw new Error('未设置瑞幸 MCP Token，请到设置 → 外卖点单 填写');

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': 'Bearer ' + token,
        };
        if (sessionId) headers['Mcp-Session-Id'] = sessionId;

        const resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        const newSid = resp.headers.get('Mcp-Session-Id') || resp.headers.get('mcp-session-id');
        if (newSid) sessionId = newSid;

        if (resp.status === 401 || resp.status === 403) {
            throw new Error('MCP 鉴权失败 (' + resp.status + '): Token 可能过期（瑞幸 Token 约 1 个月有效），请到 open.lkcoffee.com 重新生成。');
        }
        if (resp.status === 202) return { response: null };
        if (!resp.ok) {
            const txt = await resp.text().catch(function () { return ''; });
            throw new Error('MCP HTTP ' + resp.status + ': ' + txt.slice(0, 200));
        }
        if (!expectResponse) return { response: null };

        const ct = resp.headers.get('content-type') || '';
        const text = await resp.text();
        return { response: parseResp(text, ct) };
    }

    async function doInitialize() {
        const initReq = buildRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'EPhone-AI-Takeout', version: '1.0.0' },
        });
        const { response } = await post(initReq);
        if (response && response.error) throw new Error('Initialize 失败: ' + response.error.message);

        const notif = buildRequest('notifications/initialized', {}, true);
        await post(notif, false).catch(function () {});

        try {
            const { response: toolsResp } = await post(buildRequest('tools/list'));
            if (toolsResp && toolsResp.result && Array.isArray(toolsResp.result.tools)) {
                cachedTools = toolsResp.result.tools.map(function (t) {
                    return {
                        name: t.name,
                        description: t.description || '',
                        inputSchema: t.inputSchema || t.input_schema || { type: 'object', properties: {} },
                    };
                });
                console.log('[LUCKIN-MCP] 工具清单:', cachedTools.map(function (t) { return t.name; }).join(', '));
            }
        } catch (e) {
            console.warn('[LUCKIN-MCP] tools/list 失败:', e);
        }
        initialized = true;
    }

    function ensureInitialized() {
        if (initialized) return Promise.resolve();
        if (!initPromise) {
            initPromise = doInitialize().catch(function (e) {
                initPromise = null;
                throw e;
            });
        }
        return initPromise;
    }

    function normalizeToolName(toolName) {
        const raw = (toolName || '').trim();
        if (!raw) return raw;
        let s = raw;
        const lastDot = s.lastIndexOf('.');
        if (lastDot >= 0 && lastDot < s.length - 1) s = s.slice(lastDot + 1);
        s = s
            .replace(/^luckin[_-]?tools?[_-]/i, '')
            .replace(/^lk[_-]?coffee[_-]/i, '')
            .replace(/^coffee[_-]?tools?[_-]/i, '')
            .trim();
        return s || raw;
    }

    function tryDeepParse(v) {
        if (typeof v === 'string') {
            const s = v.trim();
            if (s.startsWith('{') || s.startsWith('[')) {
                try { return tryDeepParse(JSON.parse(s)); } catch (e) { return v; }
            }
            return v;
        }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            if ('data' in v && ('code' in v || 'success' in v || 'msg' in v)) {
                const inner = v.data;
                if (inner != null) {
                    if (typeof inner === 'object') return tryDeepParse(inner);
                    if (typeof inner === 'string') {
                        const s = inner.trim();
                        if (s.startsWith('{') || s.startsWith('[')) {
                            try { return tryDeepParse(JSON.parse(s)); } catch (e) { return s; }
                        }
                        return s;
                    }
                    return inner;
                }
            }
            const keys = Object.keys(v);
            const wrapKeys = ['data', 'result', 'response', 'body'];
            if (keys.length === 1 && wrapKeys.indexOf(keys[0]) >= 0 && typeof v[keys[0]] === 'string') {
                const inner = tryDeepParse(v[keys[0]]);
                if (inner && typeof inner === 'object') return inner;
            }
            const out = {};
            for (const k of keys) {
                const cv = v[k];
                if (typeof cv === 'string') {
                    const s = cv.trim();
                    if (s.startsWith('{') || s.startsWith('[')) {
                        try { out[k] = JSON.parse(s); continue; } catch (e) {}
                    }
                }
                out[k] = cv;
            }
            return out;
        }
        return v;
    }

    function tryExtractJsonFromMixed(text) {
        if (!text) return undefined;
        function safeParse(s) {
            try { return JSON.parse(s); } catch (e) { /* repair */ }
            try {
                let inStr = false, esc = false, out = '';
                for (let i = 0; i < s.length; i++) {
                    const ch = s[i];
                    if (esc) { out += ch; esc = false; continue; }
                    if (ch === '\\') { out += ch; esc = true; continue; }
                    if (ch === '"') { inStr = !inStr; out += ch; continue; }
                    if (inStr && ch === '\n') { out += '\\n'; continue; }
                    if (inStr && ch === '\r') { out += '\\r'; continue; }
                    if (inStr && ch === '\t') { out += '\\t'; continue; }
                    out += ch;
                }
                return JSON.parse(out);
            } catch (e) { return undefined; }
        }
        const direct = safeParse(text);
        if (direct !== undefined) return direct;
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenceMatch) {
            const fenced = safeParse(fenceMatch[1].trim());
            if (fenced !== undefined) return fenced;
        }
        const candidates = [];
        function tryBalanced(start, open, close) {
            let depth = 0, inStr = false, esc = false;
            for (let i = start; i < text.length; i++) {
                const ch = text[i];
                if (esc) { esc = false; continue; }
                if (ch === '\\') { esc = true; continue; }
                if (ch === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (ch === open) depth++;
                else if (ch === close) {
                    depth--;
                    if (depth === 0) {
                        const slice = text.slice(start, i + 1);
                        const parsed = safeParse(slice);
                        if (parsed && typeof parsed === 'object') candidates.push({ parsed: parsed, len: slice.length });
                        return;
                    }
                }
            }
        }
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '{') tryBalanced(i, '{', '}');
            else if (text[i] === '[') tryBalanced(i, '[', ']');
        }
        if (candidates.length) {
            function scoreCandidate(obj, len) {
                let score = Math.min(len, 4000) / 4000;
                if (!obj || typeof obj !== 'object') return score;
                if (Array.isArray(obj)) return score + (obj.length > 0 ? 2 : 0);
                const keys = Object.keys(obj);
                const envHits = ['success', 'code', 'msg', 'data'].filter(function (k) { return k in obj; }).length;
                if (envHits >= 3) score += 2;
                const data = obj.data;
                if (Array.isArray(data)) score += data.length > 0 ? 8 : -2;
                else if (data && typeof data === 'object') score += Object.keys(data).length > 0 ? 8 : -2;
                else if (data == null) score -= 3;
                return score;
            }
            candidates.sort(function (a, b) { return scoreCandidate(b.parsed, b.len) - scoreCandidate(a.parsed, a.len); });
            return candidates[0].parsed;
        }
        return undefined;
    }

    // 数字类字段（quantity / deptId / productId / orderId）从字符串归一化成数字
    function normalizeArgs(toolName, args) {
        const out = Object.assign({}, args || {});
        const numericFields = ['quantity', 'qty', 'deptId', 'productId', 'orderId'];
        for (const k of Object.keys(out)) {
            const v = out[k];
            if (typeof v === 'string' && numericFields.indexOf(k) >= 0 && /^-?\d+(\.\d+)?$/.test(v.trim())) {
                out[k] = parseFloat(v.trim());
            }
        }
        // productList 内每项的 quantity
        if (Array.isArray(out.productList)) {
            out.productList = out.productList.map(function (it) {
                if (!it || typeof it !== 'object') return it;
                const ni = Object.assign({}, it);
                if (ni.quantity != null && typeof ni.quantity === 'string' && /^\d+$/.test(ni.quantity.trim())) {
                    ni.quantity = parseInt(ni.quantity.trim(), 10);
                }
                return ni;
            });
        }
        return out;
    }

    async function callTool(toolName, args) {
        args = args || {};
        try {
            const normalizedToolName = normalizeToolName(toolName);
            const normalizedArgs = normalizeArgs(normalizedToolName, args);

            await ensureInitialized();
            const body = buildRequest('tools/call', { name: normalizedToolName, arguments: normalizedArgs });
            const { response } = await post(body);
            if (!response) return { success: false, error: '无响应' };
            if (response.error) {
                return { success: false, error: 'MCP 错误 [' + response.error.code + ']: ' + response.error.message };
            }
            const result = response.result;
            if (result && result.content && Array.isArray(result.content)) {
                const textParts = result.content.filter(function (c) { return c && c.type === 'text'; }).map(function (c) { return c.text || ''; });
                const fullText = textParts.join('\n').trim();
                if (result.isError) return { success: false, error: fullText || '远端工具执行失败', rawText: fullText };

                let parsed = undefined;
                let parseRoute = 'none';
                try {
                    parsed = JSON.parse(fullText);
                    parseRoute = 'direct';
                } catch (e) {
                    parsed = tryExtractJsonFromMixed(fullText);
                    if (parsed !== undefined) parseRoute = 'extracted';
                }
                if (parsed !== undefined) {
                    const finalData = tryDeepParse(parsed);
                    // 瑞幸信封判别: {code:0, msg:'success', data:...}
                    if (finalData && typeof finalData === 'object' && 'code' in finalData && finalData.code !== 0) {
                        return {
                            success: false,
                            error: '瑞幸业务错误 [code=' + finalData.code + ']: ' + (finalData.msg || '未知错误') + '\n\n发过去的参数: ' + JSON.stringify(normalizedArgs),
                            rawText: fullText,
                        };
                    }
                    console.log('[LUCKIN-MCP] ' + normalizedToolName + ' 解析 ' + parseRoute);
                    return { success: true, data: finalData, rawText: fullText };
                }
                return { success: true, data: fullText, rawText: fullText };
            }
            return { success: true, data: result };
        } catch (e) {
            return { success: false, error: (e && e.message) || String(e) };
        }
    }

    async function listTools(forceRefresh) {
        if (forceRefresh) {
            initialized = false;
            sessionId = null;
            cachedTools = [];
            initPromise = null;
        }
        await ensureInitialized();
        return cachedTools;
    }

    async function testConnection() {
        try {
            initialized = false;
            sessionId = null;
            cachedTools = [];
            initPromise = null;
            const tools = await listTools(false);
            if (!tools.length) return { ok: true, message: '连上了，但工具清单为空（可能对方还没发布工具）', tools: tools };
            return { ok: true, message: '连上了，得到 ' + tools.length + ' 个工具', tools: tools };
        } catch (e) {
            return { ok: false, message: (e && e.message) || String(e) };
        }
    }

    function resetSession() {
        initialized = false;
        sessionId = null;
        cachedTools = [];
        initPromise = null;
    }

    global.McpLuckinClient = {
        PROXY_URL: PROXY_URL,
        getToken: getToken,
        setToken: setToken,
        isEnabled: isEnabled,
        setEnabled: setEnabled,
        isConfigured: isConfigured,
        exportLocal: exportLocal,
        importLocal: importLocal,
        listTools: listTools,
        callTool: callTool,
        testConnection: testConnection,
        resetSession: resetSession,
        normalizeToolName: normalizeToolName,
    };
})(typeof window !== 'undefined' ? window : globalThis);
