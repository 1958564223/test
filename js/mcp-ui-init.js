/* ====================================================================
 * 外卖点单 · UI 初始化
 *
 * 依赖:
 *   McpMcdClient / McpLuckinClient / McpBridge (从 mcp-tool-bridge.js)
 *
 * 职责:
 *   1. 初始化设置面板（API 设置 → 外卖点单分区）
 *      - 麦当劳 / 瑞幸 开关 + Token 输入 + 测试连接按钮
 *   2. 工具栏按钮（🍔 / ☕）— 触发对应品牌激活 / 停用
 *   3. miniApp 浮层 (跟网易云粉白同款)
 *   4. 卡片渲染（监听 McpBridge.onCard 把卡片消息追加到聊天流）
 *   5. 监听用户消息中的"点麦当劳/取消点麦当劳"等触发词
 *
 * 暴露: window.McpUI
 * ==================================================================== */

(function (global) {
    'use strict';

    if (!global.McpBridge) {
        console.warn('[McpUI] McpBridge 未加载，跳过初始化');
        return;
    }

    // ============ Emoji 映射 ============

    function emojiFor(brand, name) {
        return global.McpBridge && global.McpBridge.itemEmoji ? global.McpBridge.itemEmoji(brand, name) : (brand === 'luckin' ? '☕' : '🍔');
    }

    function safeText(s) {
        if (s == null) return '';
        if (typeof s === 'string') return s;
        return String(s);
    }
    function escapeHtml(s) {
        return safeText(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ============ 设置面板 ============

    function initSettings() {
        const mcdTokenInput = document.getElementById('mcd-mcp-token-input');
        const mcdToggle = document.getElementById('mcd-mcp-toggle');
        const mcdTestBtn = document.getElementById('mcd-mcp-test-btn');
        const mcdStatus = document.getElementById('mcd-mcp-status');

        const luckinTokenInput = document.getElementById('luckin-mcp-token-input');
        const luckinToggle = document.getElementById('luckin-mcp-toggle');
        const luckinTestBtn = document.getElementById('luckin-mcp-test-btn');
        const luckinStatus = document.getElementById('luckin-mcp-status');

        if (!mcdTokenInput || !luckinTokenInput) {
            // 设置分区 DOM 还没注入（可能被 SPA 路由忽略），跳过
            return;
        }

        // ===== 麦当劳
        mcdTokenInput.value = global.McpMcdClient.getToken();
        updateMcdToggleUi();
        updateMcdStatusUi();

        mcdTokenInput.addEventListener('change', function () {
            global.McpMcdClient.setToken(mcdTokenInput.value);
        });
        mcdToggle.addEventListener('click', function () {
            const newState = !global.McpMcdClient.isEnabled();
            global.McpMcdClient.setEnabled(newState);
            updateMcdToggleUi();
            updateMcdStatusUi();
        });
        mcdToggle.addEventListener('keydown', function (e) {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                mcdToggle.click();
            }
        });
        mcdTestBtn.addEventListener('click', async function () {
            mcdTestBtn.disabled = true;
            mcdTestBtn.textContent = '测试中…';
            mcdStatus.textContent = '测试中';
            mcdStatus.className = 'mcp-status pending';
            mcdStatus.style.display = 'inline-block';
            try {
                const tk = mcdTokenInput.value.trim();
                if (!tk) { throw new Error('请先填 Token'); }
                global.McpMcdClient.setToken(tk);
                global.McpMcdClient.setEnabled(true);
                updateMcdToggleUi();
                const r = await global.McpMcdClient.testConnection();
                mcdStatus.textContent = r.ok ? '已连接' : '失败';
                mcdStatus.className = 'mcp-status ' + (r.ok ? 'ok' : 'err');
                mcdStatus.title = r.message;
                if (r.tools && r.tools.length) {
                    mcdStatus.title = r.tools.length + ' 个工具: ' + r.tools.map(function (t) { return t.name; }).slice(0, 5).join(', ') + (r.tools.length > 5 ? '…' : '');
                }
            } catch (e) {
                mcdStatus.textContent = '失败';
                mcdStatus.className = 'mcp-status err';
                mcdStatus.title = (e && e.message) || String(e);
            } finally {
                mcdTestBtn.disabled = false;
                mcdTestBtn.textContent = '测试连接';
            }
        });

        function updateMcdToggleUi() {
            const on = global.McpMcdClient.isEnabled();
            mcdToggle.classList.toggle('on', on);
            mcdToggle.setAttribute('aria-checked', on ? 'true' : 'false');
        }
        function updateMcdStatusUi() {
            if (global.McpMcdClient.isEnabled() && mcdTokenInput.value.trim()) {
                mcdTestBtn.disabled = false;
            } else {
                mcdTestBtn.disabled = !mcdTokenInput.value.trim();
            }
        }
        mcdTokenInput.addEventListener('input', updateMcdStatusUi);

        // ===== 瑞幸
        luckinTokenInput.value = global.McpLuckinClient.getToken();
        updateLuckinToggleUi();
        updateLuckinStatusUi();

        luckinTokenInput.addEventListener('change', function () {
            global.McpLuckinClient.setToken(luckinTokenInput.value);
        });
        luckinToggle.addEventListener('click', function () {
            const newState = !global.McpLuckinClient.isEnabled();
            global.McpLuckinClient.setEnabled(newState);
            updateLuckinToggleUi();
            updateLuckinStatusUi();
        });
        luckinToggle.addEventListener('keydown', function (e) {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                luckinToggle.click();
            }
        });
        luckinTestBtn.addEventListener('click', async function () {
            luckinTestBtn.disabled = true;
            luckinTestBtn.textContent = '测试中…';
            luckinStatus.textContent = '测试中';
            luckinStatus.className = 'mcp-status pending';
            luckinStatus.style.display = 'inline-block';
            try {
                const tk = luckinTokenInput.value.trim();
                if (!tk) { throw new Error('请先填 Token'); }
                global.McpLuckinClient.setToken(tk);
                global.McpLuckinClient.setEnabled(true);
                updateLuckinToggleUi();
                const r = await global.McpLuckinClient.testConnection();
                luckinStatus.textContent = r.ok ? '已连接' : '失败';
                luckinStatus.className = 'mcp-status ' + (r.ok ? 'ok' : 'err');
                luckinStatus.title = r.message;
                if (r.tools && r.tools.length) {
                    luckinStatus.title = r.tools.length + ' 个工具: ' + r.tools.map(function (t) { return t.name; }).slice(0, 5).join(', ') + (r.tools.length > 5 ? '…' : '');
                }
            } catch (e) {
                luckinStatus.textContent = '失败';
                luckinStatus.className = 'mcp-status err';
                luckinStatus.title = (e && e.message) || String(e);
            } finally {
                luckinTestBtn.disabled = false;
                luckinTestBtn.textContent = '测试连接';
            }
        });

        function updateLuckinToggleUi() {
            const on = global.McpLuckinClient.isEnabled();
            luckinToggle.classList.toggle('on', on);
            luckinToggle.setAttribute('aria-checked', on ? 'true' : 'false');
        }
        function updateLuckinStatusUi() {
            if (global.McpLuckinClient.isEnabled() && luckinTokenInput.value.trim()) {
                luckinTestBtn.disabled = false;
            } else {
                luckinTestBtn.disabled = !luckinTokenInput.value.trim();
            }
        }
        luckinTokenInput.addEventListener('input', updateLuckinStatusUi);
    }

    // ============ 工具栏按钮 ============

    function initToolbar() {
        let mcdBtn = document.getElementById('mcp-toolbar-mcd');
        let luckinBtn = document.getElementById('mcp-toolbar-luckin');
        if (mcdBtn) mcdBtn.title = '🍔 打开麦当劳点单面板';
        if (luckinBtn) luckinBtn.title = '☕ 打开瑞幸点单面板';
        if (!mcdBtn || !luckinBtn) {
            // 330 工具栏 = #chat-input-actions-top（旧版/新版布局都有这个名字）
            // 注：不要塞到 #input-actions-wrapper——那是发送按钮区，不是工具栏
            const wrapper = document.getElementById('chat-input-actions-top');
            if (!wrapper) {
                console.log('[McpUI] 未找到 #chat-input-actions-top，跳过工具栏初始化');
                return;
            }
            mcdBtn = document.createElement('button');
            mcdBtn.id = 'mcp-toolbar-mcd';
            mcdBtn.className = 'chat-action-icon-btn action-button';
            mcdBtn.title = '点麦当劳 🍔（点击开启/关闭 AI 外卖模式）';
            mcdBtn.innerHTML =
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '  <circle cx="12" cy="12" r="11" fill="url(#mcd-bg-mcd)"/>' +
                '  <defs>' +
                '    <linearGradient id="mcd-bg-mcd" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">' +
                '      <stop stop-color="#DA291C"/>' +
                '      <stop offset="1" stop-color="#FFC72C"/>' +
                '    </linearGradient>' +
                '  </defs>' +
                '  <text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">🍔</text>' +
                '</svg>';
            mcdBtn.style.cssText = 'flex-shrink:0;';

            luckinBtn = document.createElement('button');
            luckinBtn.id = 'mcp-toolbar-luckin';
            luckinBtn.className = 'chat-action-icon-btn action-button';
            luckinBtn.title = '点瑞幸 ☕（点击开启/关闭 AI 外卖模式）';
            luckinBtn.innerHTML =
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '  <circle cx="12" cy="12" r="11" fill="url(#mcd-bg-lk)"/>' +
                '  <defs>' +
                '    <linearGradient id="mcd-bg-lk" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">' +
                '      <stop stop-color="#0066CC"/>' +
                '      <stop offset="1" stop-color="#00A2E8"/>' +
                '    </linearGradient>' +
                '  </defs>' +
                '  <text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">☕</text>' +
                '</svg>';
            luckinBtn.style.cssText = 'flex-shrink:0;';

            // 插到 #chat-input-actions-top 末尾（不动其他按钮）
            wrapper.appendChild(mcdBtn);
            wrapper.appendChild(luckinBtn);
        }

        // 点击切换：再点一次 = 关闭
        mcdBtn.addEventListener('click', function () {
            ensureMiniAppDom();
            const overlay = document.getElementById('mpa-overlay');
            // 当前对这个 brand 是开着的就关，否则开
            const curBrand = (overlay && overlay.dataset.brand) || null;
            const visible = overlay && overlay.classList.contains('visible');
            if (visible && curBrand === 'mcd') {
                closeMiniApp();
            } else {
                openMiniApp('mcd');
            }
        });

        luckinBtn.addEventListener('click', function () {
            ensureMiniAppDom();
            const overlay = document.getElementById('mpa-overlay');
            const curBrand = (overlay && overlay.dataset.brand) || null;
            const visible = overlay && overlay.classList.contains('visible');
            if (visible && curBrand === 'luckin') {
                closeMiniApp();
            } else {
                openMiniApp('luckin');
            }
        });

        function refreshToolbarActive() {
            const cur = global.McpBridge.getActiveBrand();
            mcdBtn.classList.toggle('active', cur === 'mcd');
            luckinBtn.classList.toggle('active', cur === 'luckin');
        }
        refreshToolbarActive();
    }

    function showToast(msg, level) {
        level = level || 'info';
        // 用一个轻量 toast div 浮在屏幕中下，3 秒自动消失
        let toast = document.getElementById('mcp-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'mcp-toast';
            toast.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:10px 16px;border-radius:14px;font-size:13px;line-height:1.4;z-index:9999;opacity:0;transition:opacity .2s;pointer-events:none;max-width:80%;text-align:center;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        if (level === 'success') toast.style.background = 'linear-gradient(135deg,#FFB6C1,#FFC9D7)';
        else if (level === 'warn') toast.style.background = 'linear-gradient(135deg,#FF9F0E,#FFB340)';
        else toast.style.background = 'rgba(0,0,0,.85)';
        setTimeout(function () { toast.style.opacity = '0'; }, 3200);
    }

    // ============ miniApp 浮层 ============

    function openMiniApp(brand) {
        const overlay = document.getElementById('mpa-overlay');
        if (!overlay) return;
        brand = brand || 'mcd';
        overlay.classList.add('visible');
        overlay.classList.remove('brand-luckin');
        if (brand === 'luckin') overlay.classList.add('brand-luckin');
        overlay.dataset.brand = brand;
        renderMiniApp(brand);
        // 打开后立刻让开关反映真实激活状态
        refreshMpaToggleUi();
    }
    function closeMiniApp() {
        const overlay = document.getElementById('mpa-overlay');
        if (overlay) overlay.classList.remove('visible');
    }

    function renderMiniApp(brand) {
        const titleText = document.getElementById('mpa-title-text');
        const titleIcon = document.getElementById('mpa-title-icon');
        const list = document.getElementById('mpa-progress-list');
        const empty = document.getElementById('mpa-progress-empty');
        if (titleText) titleText.textContent = brand === 'luckin' ? '瑞幸咖啡' : '麦当劳';
        if (titleIcon) titleIcon.textContent = brand === 'luckin' ? '☕' : '🍔';
        if (list && empty && !list.children.length) empty.style.display = '';
    }

    // 进度行格式（事件总线接住后画进 miniApp）
    function appendProgressRow(progress) {
        const overlay = document.getElementById('mpa-overlay');
        const list = document.getElementById('mpa-progress-list');
        const empty = document.getElementById('mpa-progress-empty');
        if (!list) return;
        if (empty) empty.style.display = 'none';
        const row = document.createElement('div');
        row.className = 'mpa-progress-row phase-' + (progress.phase || 'tool_start');
        let emoji = '⚙️';
        if (progress.phase === 'session_start') emoji = '🚀';
        else if (progress.phase === 'tool_start') emoji = '⏳';
        else if (progress.phase === 'tool_ok') emoji = '✅';
        else if (progress.phase === 'tool_err') emoji = '❌';
        else if (progress.phase === 'session_done') emoji = '🏁';
        const summaryText = progress.summary || '';
        const toolName = progress.toolName || '';
        const time = new Date(progress.ts || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        row.innerHTML =
            '<span class="mpa-progress-emoji">' + emoji + '</span>' +
            '<span class="mpa-progress-body">' +
                (toolName ? '<span class="mpa-progress-tool">' + escapeHtml(toolName) + '</span> ' : '') +
                '<span class="mpa-progress-summary">' + escapeHtml(summaryText) + '</span>' +
            '</span>' +
            '<span class="mpa-progress-time">' + time + '</span>';
        list.appendChild(row);
        // 自动滚到底
        const view = document.getElementById('mpa-view');
        if (view) view.scrollTop = view.scrollHeight;
        // 给 miniApp 用户感知：浮层没打开时让他自动出来
        if (overlay && !overlay.classList.contains('visible')) {
            // 这里**不**自动开——尊重用户之前关掉的选择
        }
    }

    function initProgressListener() {
        if (!global.McpBridge || !global.McpBridge.onProgress) return;
        global.McpBridge.onProgress(function (progress) {
            appendProgressRow(progress);
        });
    }

    // ============ 卡片渲染（写到聊天流） ============

    function initCardRender() {
        if (!global.McpBridge || !global.McpBridge.onCard) return;
        global.McpBridge.onCard(function (card) {
            appendCardMessage(card);
        });
    }

    function appendCardMessage(card) {
        const container = document.querySelector('#chat-messages, .chat-messages, #message-list, #messages-container, [data-role="messages"]');
        if (!container) {
            // 找不到聊天容器，先暂存到本地存储等下次进入聊天时回放
            console.log('[McpUI] 聊天容器未就绪，暂存卡片到历史');
            return;
        }
        const node = renderCardMessage(card);
        container.appendChild(node);
        // 自动滚到底
        container.scrollTop = container.scrollHeight;
    }

    function inferCardKind(toolName) {
        const n = (toolName || '').toLowerCase();
        if (/create.*order|submit.*order|place.*order/.test(n)) return 'order';
        if (/query.*nearby.*store|store/.test(n)) return 'store';
        if (/query.*address|address|delivery/.test(n)) return 'address';
        if (/query.*meal|list.*menu|search.*product|list.*product|query.*product/.test(n)) return 'menu';
        if (/coupon|voucher/.test(n)) return 'coupon';
        if (/activity|campaign|calendar/.test(n)) return 'activity';
        return 'generic';
    }

    function renderCardMessage(card) {
        const div = document.createElement('div');
        div.className = 'mcp-message-card';
        if (card.brand === 'luckin') div.classList.add('brand-luckin');

        const brandName = card.brand === 'luckin' ? '瑞幸 MCP' : '麦当劳 MCP';
        const brandIcon = card.brand === 'luckin' ? '☕' : '🍔';
        const kind = inferCardKind(card.toolName);
        const head =
            '<div class="mcp-msg-head">' +
                '<span class="mcp-msg-icon">' + brandIcon + '</span>' +
                '<span>' + brandName + '</span>' +
                '<span class="mcp-msg-tool">' + escapeHtml(card.toolName || '') + '</span>' +
            '</div>';

        if (!card.result.success) {
            div.classList.add('mcp-error');
            div.innerHTML =
                head +
                '<div class="mcp-msg-title">调用失败</div>' +
                '<pre>' + escapeHtml(card.result.error || '未知错误').slice(0, 600) + '</pre>';
            return div;
        }

        const data = card.result.data;
        let body = '';

        if (kind === 'menu' && data) {
            // 尝试渲染菜单列表
            const meals = data.meals || data.menu || data.products || data.list || (Array.isArray(data) ? data : null);
            if (meals && typeof meals === 'object') {
                body = '<div class="mcp-msg-title">菜单预览</div>' +
                    Object.keys(meals).slice(0, 12).map(function (code) {
                        const m = meals[code];
                        if (!m || typeof m !== 'object') return '';
                        const name = m.name || code;
                        const price = m.currentPrice || m.price || '';
                        return '<div class="mcp-menu-row">' +
                                '<span class="mcp-menu-row-emoji">' + emojiFor(card.brand, name) + '</span>' +
                                '<span class="mcp-menu-row-name">' + escapeHtml(name) + '</span>' +
                                '<span class="mcp-menu-row-price">' + (price ? '¥' + escapeHtml(price) : '') + '</span>' +
                            '</div>';
                    }).join('');
                const moreCount = Object.keys(meals).length - 12;
                if (moreCount > 0) body += '<div class="mcp-msg-title-sub" style="font-size:11px;color:#b06e30;margin-top:6px;">+ ' + moreCount + ' 项</div>';
            } else if (Array.isArray(data) && data.length) {
                body = '<div class="mcp-msg-title">菜单预览</div>' +
                    data.slice(0, 12).map(function (it) {
                        if (!it) return '';
                        const name = it.name || it.productName || '?';
                        const price = it.price || it.currentPrice || '';
                        const code = it.code || it.productCode || it.productId || '';
                        return '<div class="mcp-menu-row">' +
                                '<span class="mcp-menu-row-emoji">' + emojiFor(card.brand, name) + '</span>' +
                                '<span class="mcp-menu-row-name">' + escapeHtml(name) + '<span style="color:#b06e30;font-size:10px;margin-left:4px;">#' + escapeHtml(code) + '</span></span>' +
                                '<span class="mcp-menu-row-price">' + (price ? '¥' + escapeHtml(String(price)) : '') + '</span>' +
                            '</div>';
                    }).join('');
            } else {
                body = '<div class="mcp-msg-title">菜单</div>' + renderJson(data);
            }
        } else if (kind === 'order' && data) {
            // 订单概要
            const orderId = data.orderId || data.data && data.data.orderId || '';
            const items = data.items || data.orderItems || (data.data && data.data.items) || [];
            const total = data.totalAmount || data.amount || (data.data && data.data.totalAmount) || '';
            body = '<div class="mcp-msg-title">下单成功</div>' +
                (orderId ? '<div class="mcp-order-id"><span class="mcp-order-id-tag">订单号</span>' + escapeHtml(String(orderId)) + '</div>' : '') +
                '<div class="mcp-order-summary">' +
                    (Array.isArray(items) ? items.map(function (it) {
                        const name = (it && (it.name || it.productName)) || '商品';
                        const qty = (it && (it.quantity || it.qty)) || 1;
                        const price = (it && (it.price || it.currentPrice)) || '';
                        return '<div class="mcp-order-row">' +
                                '<span class="mcp-order-qty">×' + escapeHtml(String(qty)) + '</span>' +
                                '<span class="mcp-order-name" style="flex:1">' + escapeHtml(name) + '</span>' +
                                '<span class="mcp-order-price">' + (price ? '¥' + escapeHtml(String(price)) : '') + '</span>' +
                            '</div>';
                    }).join('') : '') +
                    (total ? '<div class="mcp-order-total"><span>合计</span><span class="mcp-order-total-price">¥' + escapeHtml(String(total)) + '</span></div>' : '') +
                '</div>';
        } else if (kind === 'store' && data) {
            const stores = Array.isArray(data) ? data : (data.stores || data.list || []);
            body = '<div class="mcp-msg-title">门店</div>' +
                (Array.isArray(stores) ? stores.slice(0, 5).map(function (s) {
                    if (!s) return '';
                    const name = s.storeName || s.name || '门店';
                    const code = s.storeCode || s.deptId || '';
                    const addr = s.address || s.fullAddress || '';
                    return '<div class="mpa-list-row" style="margin:6px 0;background:rgba(255,255,255,.5);border-radius:10px;padding:8px;border:1px solid rgba(255,182,193,.2)">' +
                            '<div class="mpa-list-row-icon">📍</div>' +
                            '<div class="mpa-list-row-body">' +
                                '<div class="mpa-list-row-name">' + escapeHtml(String(name)) + '</div>' +
                                '<div class="mpa-list-row-sub">#' + escapeHtml(String(code)) + (addr ? ' · ' + escapeHtml(String(addr)) : '') + '</div>' +
                            '</div>' +
                        '</div>';
                }).join('') : renderJson(data));
        } else {
            body = '<div class="mcp-msg-title">' + escapeHtml(card.toolName || '结果') + '</div>' + renderJson(data);
        }

        div.innerHTML = head + body;
        return div;
    }

    function renderJson(data) {
        let text;
        try {
            text = JSON.stringify(data, null, 2);
        } catch (e) {
            text = String(data);
        }
        if (text.length > 1200) text = text.slice(0, 1200) + '\n... (已截断)';
        return '<pre class="mcp-json-pre">' + escapeHtml(text) + '</pre>' +
            '<button class="mcp-json-toggle" onclick="this.parentElement.querySelector(\'.mcp-json-pre\').style.maxHeight = (this.parentElement.querySelector(\'.mcp-json-pre\').style.maxHeight === \'none\' ? \'240px\' : \'none\'); this.textContent = this.textContent === \'展开全部\' ? \'收起\' : \'展开全部\';">展开全部</button>';
    }

    // ============ 初始化 ============

    function init() {
        initSettings();
        initToolbar();
        initCardRender();
        initMiniAppClose();
        initProgressListener();
    }

    function initMiniAppClose() {
        document.addEventListener('click', function (e) {
            const t = e.target;
            if (!t) return;
            if (t.id === 'mpa-close-btn' || t.id === 'mpa-overlay') {
                if (t.id === 'mpa-overlay' && e.target !== t) return;
                closeMiniApp();
            }
        });
    }

    // ============ miniApp 浮层 DOM 注入 ============

    function ensureMiniAppDom() {
        if (document.getElementById('mpa-overlay')) return;
        // 浮层本体（默认不显示）
        const overlay = document.createElement('div');
        overlay.id = 'mpa-overlay';
        overlay.className = 'mpa-overlay';
        overlay.dataset.brand = 'mcd';
        overlay.innerHTML =
            '<div class="mpa-window">' +
                // 顶部标题栏（品牌色 + × 关闭 = 仅收浮层，不退模式）
                '<div class="mpa-header">' +
                    '<span class="mpa-title">' +
                        '<span class="mpa-title-icon" id="mpa-title-icon">🍔</span>' +
                        '<span id="mpa-title-text">麦当劳</span>' +
                    '</span>' +
                    '<span class="mpa-close" id="mpa-close-btn" title="收起浮层（不退出模式）">×</span>' +
                '</div>' +
                // iOS 风格开关行（这就是用户说的"页面上的滑动开关"）
                '<div class="mpa-toggle-row">' +
                    '<div class="mpa-toggle-row-label">' +
                        '<div class="mpa-toggle-row-title" id="mpa-toggle-title"><span>🍔</span><span>AI 麦当劳点单</span></div>' +
                        '<div class="mpa-toggle-row-status" id="mpa-toggle-status">已关</div>' +
                    '</div>' +
                    '<div class="mpa-toggle" id="mpa-toggle" role="switch" aria-checked="false" tabindex="0">' +
                        '<div class="mpa-toggle-knob"></div>' +
                    '</div>' +
                '</div>' +
                // 进度区
                '<div class="mpa-view" id="mpa-view">' +
                    '<div id="mpa-progress-list"></div>' +
                    '<div id="mpa-progress-empty" class="mpa-state">' +
                        '  <span class="mpa-state-emoji">💬</span>' +
                        '  <div class="mpa-state-msg">滑一下开关开启，或直接在聊天里说"点麦当劳"</div>' +
                        '  <div class="mpa-state-msg" style="margin-top:6px;font-size:12px;color:#b06e30">开启后，AI 在聊天里调 MCP 工具时，进度会在这里实时滚动</div>' +
                    '</div>' +
                '</div>' +
                '<div class="mpa-toast" id="mpa-toast"></div>' +
                '<div class="mpa-actions" id="mpa-actions-row">' +
                    '<button class="mpa-btn mpa-btn-ghost" id="mpa-clear-btn">清空日志</button>' +
                    '<button class="mpa-btn mpa-btn-primary" id="mpa-exit-btn">退出点单</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        // iOS toggle 开关 = 真正切换激活/退出模式
        const toggle = document.getElementById('mpa-toggle');
        if (toggle) {
            toggle.addEventListener('click', function () {
                const overlay = document.getElementById('mpa-overlay');
                const brand = (overlay && overlay.dataset.brand) || 'mcd';
                const isOn = !global.McpBridge.getActiveBrand();
                if (isOn) {
                    if (brand === 'luckin' && !global.McpBridge.isLuckinConfigured()) {
                        showToast('请先到 设置 → 外卖点单 填瑞幸 Token', 'warn');
                        return;
                    }
                    if (brand === 'mcd' && !global.McpBridge.isMcdConfigured()) {
                        showToast('请先到 设置 → 外卖点单 填麦当劳 Token', 'warn');
                        return;
                    }
                    global.McpBridge.activate(brand);
                    showToast('已开' + (brand === 'luckin' ? '瑞幸' : '麦当劳') + ' · 跟 AI 说"帮我点…"即可', 'success');
                } else {
                    global.McpBridge.deactivate();
                    showToast('已退出' + (brand === 'luckin' ? '瑞幸' : '麦当劳') + '点单', 'info');
                }
                refreshMpaToggleUi();
                refreshToolbarActive();
            });
            toggle.addEventListener('keydown', function (e) {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggle.click();
                }
            });
        }

        // 顶部 × = 仅收起浮层，不退模式
        const closeBtn = document.getElementById('mpa-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeMiniApp);

        // 「退出点单」按钮 = 同时退模式 + 收浮层
        const exitBtn = document.getElementById('mpa-exit-btn');
        if (exitBtn) exitBtn.addEventListener('click', function () {
            global.McpBridge.deactivate();
            closeMiniApp();
            showToast('已退出外卖模式', 'info');
            refreshToolbarActive();
        });

        // 「清空日志」
        const clearBtn = document.getElementById('mpa-clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', function () {
            const list = document.getElementById('mpa-progress-list');
            if (list) list.innerHTML = '';
            const empty = document.getElementById('mpa-progress-empty');
            if (empty) empty.style.display = '';
            mpaProgressCount = 0;
        });

        refreshMpaToggleUi();
    }

    function refreshMpaToggleUi() {
        const overlay = document.getElementById('mpa-overlay');
        if (!overlay) return;
        const toggle = document.getElementById('mpa-toggle');
        const status = document.getElementById('mpa-toggle-status');
        const title = document.getElementById('mpa-toggle-title');
        const brand = overlay.dataset.brand || 'mcd';
        const active = global.McpBridge.getActiveBrand() === brand;
        if (toggle) {
            toggle.classList.toggle('on', active);
            toggle.setAttribute('aria-checked', active ? 'true' : 'false');
        }
        if (status) {
            status.textContent = active ? '已开启 · 跑得动 MCP 工具' : '已关';
            status.classList.toggle('on', active);
        }
        if (title) {
            title.innerHTML = '<span>' + (brand === 'luckin' ? '☕' : '🍔') + '</span><span>AI ' + (brand === 'luckin' ? '瑞幸' : '麦当劳') + '点单</span>';
        }
    }

    let mpaProgressCount = 0;

    function collapseToBadge() {
        const overlay = document.getElementById('mpa-overlay');
        const badge = document.getElementById('mpa-badge');
        if (overlay) overlay.classList.remove('visible');
        if (badge) badge.classList.add('visible');
    }

    function openMiniAppFromBadge() {
        const overlay = document.getElementById('mpa-overlay');
        const badge = document.getElementById('mpa-badge');
        if (overlay) overlay.classList.add('visible');
        if (badge) badge.classList.remove('visible');
    }

    // 在 DOM ready 后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            // ensureMiniAppDom() — v0.0.78 默认不挂 miniApp 浮层（按键激活只显示 toast + 聊天卡片）
            // 留 ensureMiniAppDom 函数作为后续扩展用
            init();
        });
    } else {
        init();
    }

    global.McpUI = {
        openMiniApp: openMiniApp,
        closeMiniApp: closeMiniApp,
        showToast: showToast,
        refreshToolbarActive: function () { /* placeholder */ },
        renderCard: renderCardMessage,
    };
})(typeof window !== 'undefined' ? window : globalThis);
