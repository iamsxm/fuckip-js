// ==UserScript==
// @name         独角鲸云 VPS 价格排序助手 (Sci-Fi Pro Edition)
// @namespace    https://dash.fuckip.me/
// @version      2.1
// @description  专业化独角鲸云 VPS 数据面板：支持双主题、价格/配置排序、地区筛选、售罄隐藏、侧边吸附与快速选择。
// @author       Flanker
// @match        https://dash.fuckip.me/deploy*
// @match        https://dash.fuckip.me/*
// @icon         https://dash.fuckip.me/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const API_BASE = 'https://api.fuckip.me/api/v1';
    const REFRESH_INTERVAL = 5 * 60 * 1000;
    const PAGE_SIZE = 100;
    const PANEL_ID = 'narwhal-sort-panel';
    const STATE_KEY = 'narwhal-sort-panel-state-v21';
    const SNAP_MARGIN = 12;
    const CLICKABLE_SELECTOR = 'button,a,label,[role="button"],.cursor-pointer,[class*="cursor-pointer"]';

    // ==================== 状态 ====================
    const state = {
        plans: [],
        sort: 'price-asc',
        region: 'all',
        keyword: '',
        hideSoldOut: false,
        theme: 'dark',
        collapsed: false,
        loading: false,
        lastSync: null,
    };

    // ==================== SVG 图标 ====================
    const ICONS = {
        brand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 14.4c1.2-4.8 5.4-8.2 10.1-8.2 1.9 0 3.7.6 5.2 1.5-1.2.2-2.1 1-2.5 2.1 1.1.5 1.9 1.7 1.9 3.1 0 2-1.6 3.6-3.6 3.6h-1.2l-2.7 3.1-1.6-3.1H8.9c-1.7 0-3-.8-3.7-2.1Z" fill="currentColor"/><path d="M9.5 10.9c.9-1.3 2.5-2.2 4.2-2.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".55"/></svg>',
        refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
        collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
        moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6.4 6.4 0 0 0 8.9 8.4A8.8 8.8 0 1 1 12 3Z"/></svg>',
        sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
        search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
        chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    };

    // ==================== 样式注入 ====================
    const STYLES = `
        :root {
            --ns-radius-lg: 24px;
            --ns-radius-md: 18px;
            --ns-radius-sm: 12px;
            --ns-font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            --ns-mono: 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace;
        }

        #${PANEL_ID} {
            --ns-bg: rgba(7, 11, 22, .88);
            --ns-panel: rgba(10, 16, 32, .9);
            --ns-panel-2: rgba(15, 23, 42, .72);
            --ns-card: rgba(15, 23, 42, .82);
            --ns-card-hover: rgba(30, 41, 59, .92);
            --ns-input: rgba(2, 6, 23, .52);
            --ns-line: rgba(148, 163, 184, .2);
            --ns-line-strong: rgba(56, 189, 248, .44);
            --ns-text: #f8fafc;
            --ns-text-soft: #cbd5e1;
            --ns-muted: #94a3b8;
            --ns-dim: #64748b;
            --ns-primary: #38bdf8;
            --ns-primary-strong: #0ea5e9;
            --ns-purple: #a78bfa;
            --ns-success: #34d399;
            --ns-warning: #fbbf24;
            --ns-danger: #fb7185;
            --ns-shadow: 0 24px 70px rgba(0, 0, 0, .48), inset 0 1px 0 rgba(255, 255, 255, .08);
            position: fixed;
            top: 72px;
            right: 18px;
            width: min(532px, calc(100vw - 32px));
            max-height: min(88vh, 860px);
            color: var(--ns-text);
            background:
                radial-gradient(circle at 14% -12%, rgba(56, 189, 248, .22), transparent 34%),
                radial-gradient(circle at 92% 8%, rgba(167, 139, 250, .18), transparent 34%),
                linear-gradient(145deg, var(--ns-bg), rgba(2, 6, 23, .88));
            border: 1px solid var(--ns-line);
            border-radius: var(--ns-radius-lg);
            box-shadow: var(--ns-shadow);
            backdrop-filter: blur(22px) saturate(150%);
            -webkit-backdrop-filter: blur(22px) saturate(150%);
            z-index: 10000;
            font-family: var(--ns-font);
            overflow: hidden;
            color-scheme: dark;
            transition: box-shadow .22s ease, transform .22s ease, opacity .22s ease;
        }

        #${PANEL_ID}[data-theme="light"] {
            --ns-bg: rgba(248, 250, 252, .94);
            --ns-panel: rgba(255, 255, 255, .96);
            --ns-panel-2: rgba(248, 250, 252, .9);
            --ns-card: rgba(255, 255, 255, .98);
            --ns-card-hover: rgba(240, 249, 255, .98);
            --ns-input: rgba(255, 255, 255, .96);
            --ns-line: rgba(15, 23, 42, .14);
            --ns-line-strong: rgba(2, 132, 199, .4);
            --ns-text: #0f172a;
            --ns-text-soft: #334155;
            --ns-muted: #475569;
            --ns-dim: #64748b;
            --ns-primary: #0369a1;
            --ns-primary-strong: #075985;
            --ns-purple: #6d28d9;
            --ns-success: #047857;
            --ns-warning: #b45309;
            --ns-danger: #be123c;
            --ns-shadow: 0 24px 70px rgba(15, 23, 42, .18), inset 0 1px 0 rgba(255, 255, 255, .74);
            background:
                radial-gradient(circle at 14% -12%, rgba(14, 165, 233, .16), transparent 34%),
                radial-gradient(circle at 92% 8%, rgba(124, 58, 237, .12), transparent 34%),
                linear-gradient(145deg, rgba(255, 255, 255, .95), rgba(241, 245, 249, .92));
            color-scheme: light;
        }

        #${PANEL_ID} * { box-sizing: border-box; }
        #${PANEL_ID} svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        #${PANEL_ID} .brand-mark svg { fill: currentColor; stroke: none; }
        #${PANEL_ID}.dragging { transition: none; }
        #${PANEL_ID}.collapsed {
            width: 56px;
            height: 56px;
            max-height: 56px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            cursor: grab;
            touch-action: none;
        }
        #${PANEL_ID}.collapsed:active { cursor: grabbing; }
        #${PANEL_ID}.collapsed .panel-shell { display: none; }
        #${PANEL_ID}.collapsed .panel-collapsed-icon { display: grid; }

        .panel-collapsed-icon {
            display: none;
            width: 42px;
            height: 42px;
            place-items: center;
            border-radius: 16px;
            color: #fff;
            background: linear-gradient(135deg, var(--ns-primary), var(--ns-purple));
            box-shadow: 0 12px 28px rgba(14, 165, 233, .32);
        }

        .panel-shell { position: relative; }
        .panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 18px 18px 14px;
            cursor: move;
            user-select: none;
            background: linear-gradient(180deg, rgba(255,255,255,.08), transparent);
            border-bottom: 1px solid var(--ns-line);
        }
        .header-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .brand-mark {
            width: 42px;
            height: 42px;
            display: grid;
            place-items: center;
            flex: 0 0 auto;
            border-radius: 16px;
            color: #fff;
            background: linear-gradient(135deg, var(--ns-primary), var(--ns-purple));
            box-shadow: 0 14px 34px rgba(14, 165, 233, .24);
        }
        .brand-mark svg { width: 24px; height: 24px; }
        .panel-title { color: var(--ns-text); font-size: 15px; font-weight: 800; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .panel-subtitle { margin-top: 4px; color: var(--ns-muted); font: 700 11px/1 var(--ns-mono); letter-spacing: .02em; }
        .title-wrap { min-width: 0; }
        .header-actions { display: flex; align-items: center; gap: 8px; }

        .icon-button {
            width: 44px;
            height: 44px;
            display: inline-grid;
            place-items: center;
            border: 1px solid var(--ns-line);
            border-radius: 15px;
            color: var(--ns-text-soft);
            background: var(--ns-panel-2);
            cursor: pointer;
            outline: none;
            transition: transform .18s ease, border-color .18s ease, color .18s ease, background .18s ease, box-shadow .18s ease;
        }
        .icon-button:hover { transform: translateY(-1px); color: var(--ns-primary); border-color: var(--ns-line-strong); box-shadow: 0 10px 22px rgba(14, 165, 233, .12); }
        .icon-button:active { transform: translateY(0) scale(.98); }
        .icon-button:focus-visible, .field select:focus-visible, .field input:focus-visible, .toggle-check:focus-within { outline: 3px solid rgba(14, 165, 233, .24); outline-offset: 2px; }
        .theme-icon-sun { display: none; }
        #${PANEL_ID}[data-theme="light"] .theme-icon-moon { display: none; }
        #${PANEL_ID}[data-theme="light"] .theme-icon-sun { display: block; }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            padding: 12px 16px 2px;
        }
        .summary-item {
            min-width: 0;
            padding: 10px 10px;
            border: 1px solid var(--ns-line);
            border-radius: 16px;
            background: var(--ns-panel-2);
        }
        .summary-label { display: block; margin-bottom: 6px; color: var(--ns-dim); font: 800 9px/1 var(--ns-mono); letter-spacing: .08em; text-transform: uppercase; }
        .summary-value { display: block; color: var(--ns-text); font: 900 15px/1 var(--ns-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .summary-value.good { color: var(--ns-success); }
        .summary-value.warn { color: var(--ns-warning); }

        .panel-toolbar {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding: 14px 16px 14px;
            border-bottom: 1px solid var(--ns-line);
        }
        .field { min-width: 0; }
        .field.wide { grid-column: 1 / -1; }
        .field label {
            display: block;
            margin: 0 0 7px 2px;
            color: var(--ns-muted);
            font: 800 10px/1 var(--ns-mono);
            text-transform: uppercase;
            letter-spacing: .08em;
        }
        .input-shell { position: relative; }
        .input-shell svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--ns-dim); pointer-events: none; }
        .field select,
        .field input[type="text"] {
            width: 100%;
            min-height: 44px;
            border: 1px solid var(--ns-line);
            border-radius: 15px;
            outline: none;
            color: var(--ns-text);
            background: var(--ns-input);
            padding: 0 13px;
            font-size: 13px;
            font-weight: 650;
            transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .field input[type="text"] { padding-left: 40px; }
        .field select:focus,
        .field input[type="text"]:focus { border-color: var(--ns-line-strong); box-shadow: 0 0 0 4px rgba(14, 165, 233, .12); }
        .field input::placeholder { color: var(--ns-dim); }
        .quick-row { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .toggle-check { min-height: 44px; display: inline-flex; align-items: center; gap: 9px; color: var(--ns-text-soft); font-size: 13px; font-weight: 700; cursor: pointer; user-select: none; }
        .toggle-check input { width: 16px; height: 16px; accent-color: var(--ns-primary); }
        .stats-pill { padding: 8px 11px; border: 1px solid rgba(52, 211, 153, .28); border-radius: 999px; color: var(--ns-success); background: rgba(52, 211, 153, .1); font: 900 11px/1 var(--ns-mono); }

        .panel-content {
            max-height: calc(min(88vh, 860px) - 258px);
            padding: 12px 14px 14px;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: rgba(14, 165, 233, .42) transparent;
        }
        .panel-content::-webkit-scrollbar { width: 8px; }
        .panel-content::-webkit-scrollbar-track { background: transparent; }
        .panel-content::-webkit-scrollbar-thumb { background: rgba(14, 165, 233, .34); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
        .region-divider { display: flex; align-items: center; gap: 10px; margin: 14px 4px 10px; color: var(--ns-primary); font: 900 12px/1 var(--ns-mono); letter-spacing: .04em; }
        .region-divider::after { content: ''; height: 1px; flex: 1; background: linear-gradient(90deg, rgba(14,165,233,.38), transparent); }

        .vps-card {
            position: relative;
            display: grid;
            gap: 12px;
            margin-bottom: 12px;
            padding: 15px 15px 14px;
            overflow: hidden;
            border: 1px solid var(--ns-line);
            border-radius: 20px;
            background: var(--ns-card);
            cursor: pointer;
            box-shadow: 0 10px 24px rgba(2, 6, 23, .16);
            transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease, opacity .18s ease;
        }
        #${PANEL_ID}[data-theme="light"] .vps-card { box-shadow: 0 12px 28px rgba(15, 23, 42, .08); }
        .vps-card::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: linear-gradient(180deg, var(--ns-primary), var(--ns-purple)); opacity: .9; }
        .vps-card:hover { transform: translateY(-2px); border-color: var(--ns-line-strong); background: var(--ns-card-hover); box-shadow: 0 18px 38px rgba(2, 6, 23, .22), 0 0 0 1px rgba(14,165,233,.08); }
        .vps-card:active { transform: translateY(0) scale(.995); }
        .vps-card.sold-out { opacity: .52; cursor: not-allowed; filter: saturate(.45); }
        .vps-card.sold-out:hover { transform: none; border-color: var(--ns-line); box-shadow: 0 10px 24px rgba(2, 6, 23, .12); }
        .vps-card.is-free::before { background: linear-gradient(180deg, var(--ns-success), var(--ns-primary)); }

        .card-top, .card-bottom { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .card-main { min-width: 0; }
        .card-name { color: var(--ns-text); font-size: 14px; font-weight: 850; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .card-desc { margin-top: 6px; color: var(--ns-text-soft); font: 650 12px/1.45 var(--ns-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .card-badges, .card-tags { display: inline-flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 7px; flex: 0 0 auto; }
        .region-badge, .stock-badge, .tag {
            display: inline-flex;
            align-items: center;
            min-height: 24px;
            padding: 0 9px;
            border-radius: 999px;
            border: 1px solid var(--ns-line);
            font: 850 10px/1 var(--ns-mono);
            white-space: nowrap;
        }
        .region-badge { color: var(--ns-primary); background: rgba(14, 165, 233, .1); border-color: rgba(14, 165, 233, .24); }
        .stock-badge.in-stock { color: var(--ns-success); border-color: rgba(52,211,153,.32); background: rgba(52,211,153,.1); }
        .stock-badge.limited { color: var(--ns-warning); border-color: rgba(251,191,36,.34); background: rgba(251,191,36,.12); }
        .stock-badge.out-of-stock { color: var(--ns-danger); border-color: rgba(251,113,133,.34); background: rgba(251,113,133,.12); }

        .card-specs { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
        .spec-item { min-width: 0; padding: 9px 8px; border: 1px solid var(--ns-line); border-radius: 14px; background: rgba(100, 116, 139, .12); }
        #${PANEL_ID}[data-theme="light"] .spec-item { background: #f1f5f9; border-color: rgba(15, 23, 42, .1); }
        .spec-label { display: block; margin-bottom: 5px; color: var(--ns-dim); font: 900 9px/1 var(--ns-mono); letter-spacing: .06em; }
        .spec-value { display: block; color: var(--ns-text); font: 900 11px/1 var(--ns-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .card-price { color: var(--ns-success); font: 950 19px/1 var(--ns-mono); letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
        .card-price.is-free { color: var(--ns-primary); }
        .card-price.is-expensive { color: var(--ns-danger); }
        .tag { color: var(--ns-muted); background: rgba(100, 116, 139, .1); }
        .tag.hot { color: var(--ns-danger); border-color: rgba(251,113,133,.32); background: rgba(251,113,133,.1); }
        .tag.cool { color: var(--ns-primary); border-color: rgba(14,165,233,.32); background: rgba(14,165,233,.1); }

        .panel-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; color: var(--ns-dim); border-top: 1px solid var(--ns-line); background: rgba(100, 116, 139, .08); font: 850 10px/1 var(--ns-mono); text-transform: uppercase; }
        .status-live { color: var(--ns-muted); }
        .status-live.info { color: var(--ns-primary); }
        .status-live.ok { color: var(--ns-success); }
        .status-live.error { color: var(--ns-danger); }
        .empty-state { margin: 8px 0; padding: 28px 20px; text-align: center; border: 1px dashed var(--ns-line); border-radius: 18px; color: var(--ns-muted); background: rgba(100, 116, 139, .08); font: 800 12px/1.6 var(--ns-mono); }
        .empty-state.error { color: var(--ns-danger); border-color: rgba(251,113,133,.36); background: rgba(251,113,133,.1); }
        .skeleton-card { height: 150px; border-radius: 20px; background: linear-gradient(90deg, rgba(148,163,184,.12), rgba(148,163,184,.24), rgba(148,163,184,.12)); background-size: 200% 100%; animation: ns-shimmer 1.1s ease-in-out infinite; margin-bottom: 12px; }
        .target-highlight { box-shadow: 0 0 0 3px rgba(14,165,233,.72), 0 0 28px rgba(14,165,233,.45) !important; }

        @keyframes ns-shimmer { to { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) { #${PANEL_ID} *, #${PANEL_ID} { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
        @media (max-width: 640px) {
            #${PANEL_ID} { top: 12px; right: 12px; width: calc(100vw - 24px); }
            .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .panel-toolbar { grid-template-columns: 1fr; }
            .card-specs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .card-top, .card-bottom { flex-direction: column; align-items: stretch; }
            .card-badges, .card-tags { justify-content: flex-start; }
        }
    `;

    injectStyles();

    // ==================== 工具函数 ====================

    /** 注入样式节点，防止重复安装脚本时生成多个 style 标签。 */
    function injectStyles() {
        document.getElementById('narwhal-sort-style')?.remove();
        const styleEl = document.createElement('style');
        styleEl.id = 'narwhal-sort-style';
        styleEl.textContent = STYLES;
        document.head.appendChild(styleEl);
    }

    /** 从站点 localStorage 中读取登录 Token，解析失败时安全返回 null。 */
    function getToken() {
        try {
            const authStr = localStorage.getItem('auth-storage');
            return authStr ? JSON.parse(authStr)?.state?.token || null : null;
        } catch (error) {
            return null;
        }
    }

    /** 防抖高频输入事件，避免每个字符都触发完整列表重绘。 */
    function debounce(callback, wait) {
        let timeoutId;
        return function debounced(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => callback.apply(this, args), wait);
        };
    }

    /** 对 API 文本进行 HTML 转义，避免字段内容直接注入 DOM。 */
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** 安全转换数字字段，兼容后端返回 null、空字符串或 undefined。 */
    function numberValue(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    /** 生成可用于 querySelector 的安全 CSS 字符串。 */
    function cssEscape(value) {
        if (window.CSS?.escape) return window.CSS.escape(String(value));
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    /** 将刷新间隔展示为短状态文本。 */
    function formatRefreshInterval(ms) {
        return `${Math.round(ms / 60000)}m`;
    }

    /** 统一价格展示，保留免费套餐的强辨识度。 */
    function formatPrice(price) {
        const normalized = numberValue(price);
        return normalized === 0 ? 'FREE' : `$${normalized.toFixed(2)}/mo`;
    }

    /** 根据价格生成价格文本样式。 */
    function getPriceClass(price) {
        const normalized = numberValue(price);
        if (normalized === 0) return 'is-free';
        return normalized >= 0.5 ? 'is-expensive' : '';
    }

    /** 计算剩余库存，后端无库存字段时给出保守可售兜底。 */
    function getAvailableStock(plan) {
        const maxQuantity = numberValue(plan.max_quantity);
        const soldQuantity = numberValue(plan.sold_quantity);
        if (!maxQuantity && !soldQuantity && !plan.sold_out) return 99;
        return Math.max(0, maxQuantity - soldQuantity);
    }

    /** 根据库存状态生成带文字的徽章，避免只靠颜色表达状态。 */
    function getStockBadge(plan) {
        const available = getAvailableStock(plan);
        if (plan.sold_out || available <= 0) return '<span class="stock-badge out-of-stock">SOLD OUT</span>';
        if (available <= 5) return `<span class="stock-badge limited">LEFT ${available}</span>`;
        return `<span class="stock-badge in-stock">STOCK ${available}</span>`;
    }

    /** 格式化内存容量，超过 1024MB 自动显示 GB。 */
    function formatRam(mb) {
        const value = numberValue(mb);
        return value >= 1024 ? `${Number((value / 1024).toFixed(1))}GB` : `${value}MB`;
    }

    /** 格式化流量容量，超过 1000GB 自动显示 TB。 */
    function formatTraffic(gb) {
        const value = numberValue(gb);
        return value >= 1000 ? `${Number((value / 1000).toFixed(1))}TB` : `${value}GB`;
    }

    /** 根据标签含义返回视觉强调样式。 */
    function getTagClass(tag) {
        const text = String(tag || '').toLowerCase();
        const hotWords = ['解锁', '快乐', '直连', 'cn2', 'premium', 'hot'];
        const coolWords = ['落地', '独立', 'ipv6', 'cool'];
        if (hotWords.some((word) => text.includes(word))) return 'hot';
        if (coolWords.some((word) => text.includes(word))) return 'cool';
        return '';
    }

    /** 更新底部运行状态，并通过 class 控制语义颜色。 */
    function setStatus(message, type = '') {
        const statusLabel = document.getElementById('ns-status-msg');
        if (!statusLabel) return;
        statusLabel.textContent = message;
        statusLabel.className = `status-live ${type}`.trim();
    }

    /** 持久化 UI 偏好、折叠状态和当前面板位置。 */
    function savePanelState(panel) {
        const payload = {
            sort: state.sort,
            region: state.region,
            hideSoldOut: state.hideSoldOut,
            theme: state.theme,
            collapsed: state.collapsed,
            left: panel?.style.left || '',
            top: panel?.style.top || '',
            right: panel?.style.right || '',
        };
        localStorage.setItem(STATE_KEY, JSON.stringify(payload));
    }

    /** 恢复用户上次使用的筛选条件、主题和面板位置。 */
    function restorePanelState(panel) {
        try {
            const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
            state.sort = saved.sort || state.sort;
            state.region = saved.region || state.region;
            state.hideSoldOut = Boolean(saved.hideSoldOut);
            state.theme = saved.theme === 'light' ? 'light' : 'dark';
            state.collapsed = Boolean(saved.collapsed);
            panel.dataset.theme = state.theme;
            if (saved.left && saved.top) {
                panel.style.left = saved.left;
                panel.style.top = saved.top;
                panel.style.right = saved.right || 'auto';
            }
            panel.classList.toggle('collapsed', state.collapsed);
        } catch (error) {
            localStorage.removeItem(STATE_KEY);
        }
    }

    // ==================== 面板创建 ====================

    /** 创建助手面板的 DOM 骨架，使用 SVG 图标保持跨平台一致性。 */
    function createPanel() {
        document.getElementById(PANEL_ID)?.remove();
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.dataset.theme = state.theme;
        panel.innerHTML = `
            <div class="panel-collapsed-icon" aria-label="展开价格助手">${ICONS.brand}</div>
            <div class="panel-shell">
                <div class="panel-header">
                    <div class="header-left">
                        <div class="brand-mark">${ICONS.brand}</div>
                        <div class="title-wrap">
                            <div class="panel-title">独角鲸云 VPS 价格排序助手</div>
                            <div class="panel-subtitle">Sci-Fi Pro · Pricing Console</div>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button class="icon-button" id="ns-theme" type="button" aria-label="切换白色或黑色主题" title="切换主题">
                            <span class="theme-icon-moon">${ICONS.moon}</span>
                            <span class="theme-icon-sun">${ICONS.sun}</span>
                        </button>
                        <button class="icon-button" id="ns-refresh" type="button" aria-label="刷新套餐数据" title="刷新数据">${ICONS.refresh}</button>
                        <button class="icon-button" id="ns-collapse" type="button" aria-label="最小化价格助手" title="最小化">${ICONS.collapse}</button>
                    </div>
                </div>
                <div class="summary-grid" aria-label="套餐数据摘要">
                    ${renderSummaryItem('TOTAL', '--', 'ns-total')}
                    ${renderSummaryItem('IN STOCK', '--', 'ns-instock', 'good')}
                    ${renderSummaryItem('FREE', '--', 'ns-free', 'good')}
                    ${renderSummaryItem('MIN PRICE', '--', 'ns-minprice', 'warn')}
                </div>
                <div class="panel-toolbar">
                    <div class="field">
                        <label for="ns-sort">排序</label>
                        <select id="ns-sort" aria-label="排序方式">
                            <option value="price-asc">价格从低到高</option>
                            <option value="price-desc">价格从高到低</option>
                            <option value="ram-desc">内存优先</option>
                            <option value="traffic-desc">流量优先</option>
                            <option value="region">按地区分组</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="ns-region">地区</label>
                        <select id="ns-region" aria-label="地区筛选"><option value="all">全部地区</option></select>
                    </div>
                    <div class="field wide">
                        <label for="ns-search">搜索</label>
                        <div class="input-shell">${ICONS.search}<input type="text" id="ns-search" autocomplete="off" aria-label="搜索 VPS 套餐" placeholder="输入机型、套餐、地区或标签..."></div>
                    </div>
                    <div class="quick-row">
                        <label class="toggle-check"><input type="checkbox" id="ns-hide-sold"> 隐藏售罄套餐</label>
                        <span class="stats-pill" id="ns-stats">0/0</span>
                    </div>
                </div>
                <div class="panel-content" id="ns-list" aria-live="polite">
                    <div class="empty-state">正在等待登录状态...</div>
                </div>
                <div class="panel-footer">
                    <span id="ns-last-update">SYNC --:--:--</span>
                    <span class="status-live" id="ns-status-msg">AUTO ${formatRefreshInterval(REFRESH_INTERVAL)}</span>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        restorePanelState(panel);
        syncControlsFromState();
        return panel;
    }

    /** 生成摘要指标项，保持面板顶部信息密度一致。 */
    function renderSummaryItem(label, value, id, className = '') {
        return `<div class="summary-item"><span class="summary-label">${label}</span><span class="summary-value ${className}" id="${id}">${value}</span></div>`;
    }

    /** 将已恢复的状态同步到表单控件。 */
    function syncControlsFromState() {
        const sortSelect = document.getElementById('ns-sort');
        const hideSold = document.getElementById('ns-hide-sold');
        if (sortSelect) sortSelect.value = state.sort;
        if (hideSold) hideSold.checked = state.hideSoldOut;
    }

    // ==================== 数据加载与渲染 ====================

    /** 分页拉取全部套餐数据，并刷新筛选器、摘要与卡片列表。 */
    async function loadPlans() {
        if (state.loading) return;
        const token = getToken();
        const listEl = document.getElementById('ns-list');
        if (!token) {
            listEl.innerHTML = '<div class="empty-state error">未检测到登录凭证，请登录后重试。</div>';
            setStatus('AUTH REQUIRED', 'error');
            return;
        }

        state.loading = true;
        listEl.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
        setStatus('FETCHING DATA...', 'info');

        try {
            const plans = [];
            let page = 1;
            while (true) {
                const response = await fetch(`${API_BASE}/plans?page=${page}&page_size=${PAGE_SIZE}`, {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                const pagePlans = payload?.data?.plans || [];
                const total = numberValue(payload?.data?.total);
                plans.push(...pagePlans);
                if (!pagePlans.length || (total && plans.length >= total)) break;
                page += 1;
            }

            state.plans = plans;
            state.lastSync = new Date();
            updateRegionFilter();
            renderPlans();
            updateLastSync();
            setStatus(`AUTO ${formatRefreshInterval(REFRESH_INTERVAL)}`);
        } catch (error) {
            listEl.innerHTML = `<div class="empty-state error">数据获取失败：${escapeHtml(error.message)}</div>`;
            setStatus('FETCH ERROR', 'error');
        } finally {
            state.loading = false;
        }
    }

    /** 根据套餐数据重建地区筛选下拉框。 */
    function updateRegionFilter() {
        const regionSelect = document.getElementById('ns-region');
        if (!regionSelect) return;

        const counts = new Map();
        state.plans.forEach((plan) => {
            const region = plan.machine_region || '未知地区';
            counts.set(region, (counts.get(region) || 0) + 1);
        });

        const options = ['<option value="all">全部地区</option>'];
        [...counts.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).forEach((region) => {
            options.push(`<option value="${escapeHtml(region)}">${escapeHtml(region)} (${counts.get(region)})</option>`);
        });
        regionSelect.innerHTML = options.join('');
        state.region = state.region === 'all' || counts.has(state.region) ? state.region : 'all';
        regionSelect.value = state.region;
    }

    /** 按当前筛选条件和排序方式生成要展示的套餐列表。 */
    function getFilteredPlans() {
        const keyword = state.keyword.toLowerCase();
        const filtered = state.plans.filter((plan) => {
            const regionMatched = state.region === 'all' || plan.machine_region === state.region;
            const stockMatched = !state.hideSoldOut || !plan.sold_out;
            const keywordMatched = !keyword || [plan.machine_name, plan.name, plan.machine_description, plan.machine_region, ...(plan.machine_tags || [])]
                .some((item) => String(item || '').toLowerCase().includes(keyword));
            return regionMatched && stockMatched && keywordMatched;
        });

        const byPriceAsc = (a, b) => numberValue(a.price_monthly) - numberValue(b.price_monthly);
        const sorters = {
            'price-asc': byPriceAsc,
            'price-desc': (a, b) => numberValue(b.price_monthly) - numberValue(a.price_monthly),
            'ram-desc': (a, b) => numberValue(b.ram_mb) - numberValue(a.ram_mb) || byPriceAsc(a, b),
            'traffic-desc': (a, b) => numberValue(b.monthly_traffic_gb) - numberValue(a.monthly_traffic_gb) || byPriceAsc(a, b),
            region: (a, b) => String(a.machine_region || '').localeCompare(String(b.machine_region || ''), 'zh-Hans-CN') || byPriceAsc(a, b),
        };
        return filtered.sort(sorters[state.sort] || byPriceAsc);
    }

    /** 刷新摘要指标与套餐卡片列表。 */
    function renderPlans() {
        const listEl = document.getElementById('ns-list');
        const plans = getFilteredPlans();
        const inStock = plans.filter((plan) => !plan.sold_out).length;
        const freeCount = plans.filter((plan) => numberValue(plan.price_monthly) === 0).length;
        const minPrice = plans.length ? Math.min(...plans.map((plan) => numberValue(plan.price_monthly))) : 0;

        setText('ns-stats', `${inStock}/${plans.length}`);
        setText('ns-total', String(plans.length));
        setText('ns-instock', String(inStock));
        setText('ns-free', String(freeCount));
        setText('ns-minprice', plans.length ? formatPrice(minPrice).replace('/mo', '') : '--');

        if (!plans.length) {
            listEl.innerHTML = '<div class="empty-state">没有匹配的 VPS 套餐。</div>';
            return;
        }

        let lastRegion = '';
        listEl.innerHTML = plans.map((plan) => {
            const region = plan.machine_region || '未知地区';
            const divider = state.sort === 'region' && region !== lastRegion ? `<div class="region-divider">${escapeHtml(region)}</div>` : '';
            lastRegion = region;
            return divider + renderPlanCard(plan);
        }).join('');
    }

    /** 安全更新文本节点内容。 */
    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    /** 渲染单个套餐卡片，突出名称、库存、价格和核心规格。 */
    function renderPlanCard(plan) {
        const planId = plan.id || plan.machine_id || plan.plan_id || '';
        const price = numberValue(plan.price_monthly);
        const tags = (plan.machine_tags || [])
            .map((tag) => `<span class="tag ${getTagClass(tag)}">${escapeHtml(tag)}</span>`)
            .join('');
        const cardClass = ['vps-card', plan.sold_out ? 'sold-out' : '', price === 0 ? 'is-free' : ''].filter(Boolean).join(' ');
        const title = plan.machine_name || plan.name || '未命名套餐';
        const description = `${plan.name || '套餐'}${plan.machine_description ? ` · ${plan.machine_description}` : ''}`;

        return `
            <div class="${cardClass}" data-plan-id="${escapeHtml(planId)}" title="点击选择此套餐" role="button" tabindex="0">
                <div class="card-top">
                    <div class="card-main">
                        <div class="card-name" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                        <div class="card-desc" title="${escapeHtml(description)}">${escapeHtml(description)}</div>
                    </div>
                    <div class="card-badges">
                        ${getStockBadge(plan)}
                        <span class="region-badge">${escapeHtml(plan.machine_region || '未知')}</span>
                    </div>
                </div>
                <div class="card-specs">
                    ${renderSpec('CPU', `${numberValue(plan.cpu)}C`)}
                    ${renderSpec('RAM', formatRam(plan.ram_mb))}
                    ${renderSpec('DISK', `${numberValue(plan.disk_gb)}G`)}
                    ${renderSpec('NET', `${numberValue(plan.bandwidth_mbps)}M`)}
                    ${renderSpec('TRF', formatTraffic(plan.monthly_traffic_gb))}
                    ${renderSpec('SYS', String(plan.machine_vm_type || '-').toUpperCase())}
                </div>
                <div class="card-bottom">
                    <span class="card-price ${getPriceClass(price)}">${formatPrice(price)}</span>
                    ${tags ? `<div class="card-tags">${tags}</div>` : '<div class="card-tags"></div>'}
                </div>
            </div>
        `;
    }

    /** 渲染规格块，保持六项指标布局一致。 */
    function renderSpec(label, value) {
        return `<span class="spec-item"><span class="spec-label">${escapeHtml(label)}</span><span class="spec-value">${escapeHtml(value)}</span></span>`;
    }

    /** 更新底部最近同步时间。 */
    function updateLastSync() {
        if (!state.lastSync) return;
        setText('ns-last-update', `SYNC ${state.lastSync.toLocaleTimeString('zh-CN', { hour12: false })}`);
    }

    // ==================== 快速选择逻辑 ====================

    /** 模拟完整鼠标点击，兼容 React/Vue 常见事件绑定。 */
    function dispatchFullClick(element) {
        ['mousedown', 'mouseup', 'click'].forEach((eventName) => {
            element.dispatchEvent(new MouseEvent(eventName, { view: window, bubbles: true, cancelable: true }));
        });
    }

    /** 给原页面目标元素添加短暂高亮反馈。 */
    function flashTarget(element) {
        element.classList.add('target-highlight');
        setTimeout(() => element.classList.remove('target-highlight'), 1100);
    }

    /** 根据文本查找原页面可点击元素，并排除助手自身。 */
    function findClickableByText(keywords, exact = false) {
        const normalizedKeywords = (Array.isArray(keywords) ? keywords : [keywords]).filter(Boolean).map((keyword) => String(keyword).trim()).filter(Boolean);
        if (!normalizedKeywords.length) return null;

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const matches = [];
        let node;
        while ((node = walker.nextNode())) {
            const text = node.nodeValue.trim();
            const parent = node.parentElement;
            if (!text || !parent || parent.closest(`#${PANEL_ID}`)) continue;
            const matched = exact
                ? normalizedKeywords.some((keyword) => text.toUpperCase() === keyword.toUpperCase())
                : normalizedKeywords.some((keyword) => text.includes(keyword) || keyword.includes(text));
            if (matched) matches.push(parent);
        }

        const source = matches.at(-1);
        return source ? source.closest(CLICKABLE_SELECTOR) || source : null;
    }

    /** 点击原页面中与文本匹配的元素。 */
    async function clickByText(keywords, exact = false) {
        const target = findClickableByText(keywords, exact);
        if (!target) return false;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dispatchFullClick(target);
        flashTarget(target);
        return true;
    }

    /** 根据 planId 精准点击隐藏 input 对应的 label 或容器。 */
    function clickPlanInput(planId) {
        const input = document.querySelector(`input[value="${cssEscape(planId)}"]`);
        if (!input) return false;
        const target = input.closest('label') || input.closest(CLICKABLE_SELECTOR) || input.parentElement;
        if (!target) return false;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dispatchFullClick(target);
        flashTarget(target);
        return true;
    }

    /** 从助手卡片跳转或同步选择原部署页面中的同套餐。 */
    async function simulateNativeClick(planId) {
        const plan = state.plans.find((item) => [item.id, item.machine_id, item.plan_id].some((id) => String(id) === String(planId)));
        if (!plan) return;

        if (!window.location.pathname.includes('/deploy')) {
            window.location.href = `/deploy?id=${encodeURIComponent(planId)}`;
            return;
        }

        setStatus('SEQUENCE START...', 'info');
        if (await clickByText(plan.machine_region, true)) await sleep(250);
        if (await clickByText(plan.machine_name, false)) await sleep(420);

        setStatus('SELECTING PLAN...', 'info');
        const clicked = clickPlanInput(planId)
            || await clickByText(plan.name, true)
            || await clickByText([plan.name, plan.machine_description], false);

        if (clicked) {
            setStatus('ACCESS GRANTED', 'ok');
        } else {
            setStatus('DOM SYNC FAIL', 'error');
            setTimeout(() => { window.location.href = `/deploy?id=${encodeURIComponent(planId)}`; }, 1000);
        }

        setTimeout(() => setStatus(`AUTO ${formatRefreshInterval(REFRESH_INTERVAL)}`), 3000);
    }

    /** Promise 版延迟，用于等待原页面级联选择完成。 */
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // ==================== 事件绑定 ====================

    /** 绑定筛选、主题、刷新、卡片点击与拖拽事件。 */
    function bindEvents(panel) {
        document.getElementById('ns-sort').addEventListener('change', (event) => {
            state.sort = event.target.value;
            renderPlans();
            savePanelState(panel);
        });

        document.getElementById('ns-region').addEventListener('change', (event) => {
            state.region = event.target.value;
            renderPlans();
            savePanelState(panel);
        });

        document.getElementById('ns-hide-sold').addEventListener('change', (event) => {
            state.hideSoldOut = event.target.checked;
            renderPlans();
            savePanelState(panel);
        });

        document.getElementById('ns-search').addEventListener('input', debounce((event) => {
            state.keyword = event.target.value.trim();
            renderPlans();
        }, 180));

        document.getElementById('ns-theme').addEventListener('click', (event) => {
            event.preventDefault();
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            panel.dataset.theme = state.theme;
            savePanelState(panel);
        });

        document.getElementById('ns-refresh').addEventListener('click', (event) => {
            event.preventDefault();
            loadPlans();
        });

        document.getElementById('ns-collapse').addEventListener('click', (event) => {
            event.preventDefault();
            state.collapsed = true;
            panel.classList.add('collapsed');
            savePanelState(panel);
        });

        document.getElementById('ns-list').addEventListener('click', (event) => {
            const card = event.target.closest('.vps-card:not(.sold-out)');
            if (!card) return;
            const planId = card.getAttribute('data-plan-id');
            if (planId) simulateNativeClick(planId);
        });

        document.getElementById('ns-list').addEventListener('keydown', (event) => {
            if (!['Enter', ' '].includes(event.key)) return;
            const card = event.target.closest('.vps-card:not(.sold-out)');
            if (!card) return;
            event.preventDefault();
            simulateNativeClick(card.getAttribute('data-plan-id'));
        });

        bindDrag(panel);
    }

    /** 绑定展开态标题栏拖拽与折叠态图标拖拽吸附。 */
    function bindDrag(panel) {
        const header = panel.querySelector('.panel-header');
        const collapsedIcon = panel.querySelector('.panel-collapsed-icon');
        let dragging = false;
        let moved = false;
        let startX = 0;
        let startY = 0;
        let panelX = 0;
        let panelY = 0;

        const startDrag = (event) => {
            if (!panel.classList.contains('collapsed') && event.target.closest('.icon-button')) return;
            dragging = true;
            moved = false;
            startX = event.clientX;
            startY = event.clientY;
            const rect = panel.getBoundingClientRect();
            panelX = rect.left;
            panelY = rect.top;
            panel.style.left = `${panelX}px`;
            panel.style.top = `${panelY}px`;
            panel.style.right = 'auto';
            panel.classList.add('dragging');
            event.preventDefault();
        };

        header.addEventListener('mousedown', startDrag);
        collapsedIcon.addEventListener('mousedown', startDrag);

        document.addEventListener('mousemove', (event) => {
            if (!dragging) return;
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            moved = moved || Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
            const nextLeft = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, panelX + deltaX));
            const nextTop = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, panelY + deltaY));
            panel.style.left = `${nextLeft}px`;
            panel.style.top = `${nextTop}px`;
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            panel.classList.remove('dragging');
            if (panel.classList.contains('collapsed')) {
                if (moved) {
                    snapCollapsedPanel(panel);
                } else {
                    expandPanelFromCollapsedIcon(panel);
                }
            }
            savePanelState(panel);
        });
    }

    /** 从折叠图标展开面板时，按图标中心点定位并夹取到浏览器可视区域内。 */
    function expandPanelFromCollapsedIcon(panel) {
        const iconRect = panel.getBoundingClientRect();
        const iconCenterX = iconRect.left + iconRect.width / 2;
        const iconCenterY = iconRect.top + iconRect.height / 2;

        state.collapsed = false;
        panel.classList.remove('collapsed');

        const expandedWidth = panel.offsetWidth;
        const expandedHeight = panel.offsetHeight;
        const nextLeft = Math.max(SNAP_MARGIN, Math.min(window.innerWidth - expandedWidth - SNAP_MARGIN, iconCenterX - expandedWidth / 2));
        const nextTop = Math.max(SNAP_MARGIN, Math.min(window.innerHeight - expandedHeight - SNAP_MARGIN, iconCenterY - 28));

        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
        panel.style.right = 'auto';
    }

    /** 折叠图标松手后吸附到最近侧边，同时限制在可视区域内。 */
    function snapCollapsedPanel(panel) {
        const rect = panel.getBoundingClientRect();
        const snapLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
        const nextLeft = snapLeft ? SNAP_MARGIN : window.innerWidth - rect.width - SNAP_MARGIN;
        const nextTop = Math.max(SNAP_MARGIN, Math.min(window.innerHeight - rect.height - SNAP_MARGIN, rect.top));
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
        panel.style.right = 'auto';
    }

    // ==================== 启动 ====================

    /** 初始化入口：先创建面板，再等待 Token 拉取数据。 */
    function init() {
        const panel = createPanel();
        bindEvents(panel);

        const timer = setInterval(() => {
            if (!getToken()) return;
            clearInterval(timer);
            loadPlans();
            setInterval(loadPlans, REFRESH_INTERVAL);
        }, 1000);

        setTimeout(() => {
            clearInterval(timer);
            if (!state.plans.length) loadPlans();
        }, 15000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
