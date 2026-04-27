// ==UserScript==
// @name         Incudal 实例价格排序助手
// @namespace    https://incudal.com/
// @version      1.0
// @description  Incudal 创建实例页价格排序助手：拉取官方套餐与方案，支持月均价格排序、地区筛选、隐藏售罄、主题切换和快速选择。
// @author       Flanker
// @match        https://incudal.com/instances/create
// @icon         https://incudal.com/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const API_BASE = 'https://incudal.com/api';
    const PANEL_ID = 'incudal-price-helper';
    const STATE_KEY = 'incudal-price-helper-state-v1';
    const REFRESH_INTERVAL = 3 * 60 * 1000;
    const SNAP_MARGIN = 12;
    const CLICKABLE_SELECTOR = 'button,a,label,[role="button"],.cursor-pointer,[class*="cursor-pointer"],[class*="cursor"]';

    // ==================== 状态 ====================
    const state = {
        packages: [],
        regions: [],
        combos: [],
        sort: 'monthly-asc',
        region: 'all',
        keyword: '',
        hideSoldOut: false,
        theme: 'light',
        collapsed: false,
        loading: false,
        lastSync: null,
    };

    const ICONS = {
        brand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15.2 9.4 5.8c.5-.9 1.8-.9 2.3 0l5.4 9.4c.5.9-.1 2-1.2 2H5.2c-1.1 0-1.7-1.1-1.2-2Z" fill="currentColor"/><path d="M13.8 6.7 20 17.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".55"/></svg>',
        refresh: '<svg viewBox="0 0 24 24"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
        collapse: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
        moon: '<svg viewBox="0 0 24 24"><path d="M12 3a6.4 6.4 0 0 0 8.9 8.4A8.8 8.8 0 1 1 12 3Z"/></svg>',
        sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
        search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
    };

    // ==================== 样式 ====================
    const STYLES = `
        #${PANEL_ID} {
            --ih-bg: rgba(248, 250, 252, .95);
            --ih-panel: rgba(255, 255, 255, .96);
            --ih-card: rgba(255, 255, 255, .98);
            --ih-card-hover: rgba(240, 249, 255, .98);
            --ih-input: rgba(255, 255, 255, .96);
            --ih-line: rgba(15, 23, 42, .14);
            --ih-line-strong: rgba(37, 99, 235, .38);
            --ih-text: #0f172a;
            --ih-soft: #334155;
            --ih-muted: #64748b;
            --ih-primary: #2563eb;
            --ih-purple: #7c3aed;
            --ih-success: #047857;
            --ih-warning: #b45309;
            --ih-danger: #be123c;
            --ih-shadow: 0 24px 70px rgba(15, 23, 42, .18), inset 0 1px 0 rgba(255,255,255,.72);
            position: fixed;
            top: 72px;
            right: 18px;
            width: min(560px, calc(100vw - 32px));
            max-height: min(88vh, 860px);
            color: var(--ih-text);
            background:
                radial-gradient(circle at 14% -12%, rgba(37,99,235,.16), transparent 34%),
                radial-gradient(circle at 92% 8%, rgba(124,58,237,.12), transparent 34%),
                linear-gradient(145deg, var(--ih-bg), rgba(241,245,249,.92));
            border: 1px solid var(--ih-line);
            border-radius: 24px;
            box-shadow: var(--ih-shadow);
            backdrop-filter: blur(22px) saturate(150%);
            -webkit-backdrop-filter: blur(22px) saturate(150%);
            z-index: 10000;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            overflow: hidden;
            color-scheme: light;
        }
        #${PANEL_ID}[data-theme="dark"] {
            --ih-bg: rgba(7, 11, 22, .9);
            --ih-panel: rgba(10, 16, 32, .9);
            --ih-card: rgba(15, 23, 42, .84);
            --ih-card-hover: rgba(30, 41, 59, .94);
            --ih-input: rgba(2, 6, 23, .55);
            --ih-line: rgba(148, 163, 184, .2);
            --ih-line-strong: rgba(96, 165, 250, .42);
            --ih-text: #f8fafc;
            --ih-soft: #cbd5e1;
            --ih-muted: #94a3b8;
            --ih-primary: #60a5fa;
            --ih-purple: #a78bfa;
            --ih-success: #34d399;
            --ih-warning: #fbbf24;
            --ih-danger: #fb7185;
            --ih-shadow: 0 24px 70px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.08);
            color-scheme: dark;
            background:
                radial-gradient(circle at 14% -12%, rgba(96,165,250,.22), transparent 34%),
                radial-gradient(circle at 92% 8%, rgba(167,139,250,.18), transparent 34%),
                linear-gradient(145deg, var(--ih-bg), rgba(2,6,23,.88));
        }
        #${PANEL_ID} * { box-sizing: border-box; }
        #${PANEL_ID} svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        #${PANEL_ID} .brand-mark svg, #${PANEL_ID} .collapsed-icon svg { fill: currentColor; stroke: none; }
        #${PANEL_ID}.collapsed { width: 56px; height: 56px; max-height: 56px; display: grid; place-items: center; border-radius: 999px; cursor: grab; touch-action: none; }
        #${PANEL_ID}.dragging { transition: none; }
        #${PANEL_ID}.collapsed .panel-shell { display: none; }
        #${PANEL_ID}.collapsed .collapsed-icon { display: grid; }
        .collapsed-icon { display: none; width: 42px; height: 42px; place-items: center; border-radius: 16px; color: #fff; background: linear-gradient(135deg, var(--ih-primary), var(--ih-purple)); }
        .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 18px 18px 14px; cursor: move; user-select: none; border-bottom: 1px solid var(--ih-line); }
        .header-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .brand-mark { width: 42px; height: 42px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 16px; color: #fff; background: linear-gradient(135deg, var(--ih-primary), var(--ih-purple)); box-shadow: 0 14px 34px rgba(37,99,235,.22); }
        .brand-mark svg { width: 24px; height: 24px; }
        .panel-title { color: var(--ih-text); font-size: 15px; font-weight: 850; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .panel-subtitle { margin-top: 4px; color: var(--ih-muted); font: 800 11px/1 'Fira Code', Consolas, monospace; }
        .header-actions { display: flex; align-items: center; gap: 8px; }
        .icon-button { width: 44px; height: 44px; display: inline-grid; place-items: center; border: 1px solid var(--ih-line); border-radius: 15px; color: var(--ih-soft); background: var(--ih-panel); cursor: pointer; outline: none; transition: transform .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease; }
        .icon-button:hover { transform: translateY(-1px); color: var(--ih-primary); border-color: var(--ih-line-strong); box-shadow: 0 10px 22px rgba(37,99,235,.12); }
        .icon-button:focus-visible, .field select:focus-visible, .field input:focus-visible, .toggle-check:focus-within { outline: 3px solid rgba(37,99,235,.22); outline-offset: 2px; }
        .theme-icon-sun { display: none; }
        #${PANEL_ID}[data-theme="light"] .theme-icon-moon { display: none; }
        #${PANEL_ID}[data-theme="light"] .theme-icon-sun { display: block; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; padding: 12px 16px 2px; }
        .summary-item { min-width: 0; padding: 10px; border: 1px solid var(--ih-line); border-radius: 16px; background: rgba(100,116,139,.08); }
        .summary-label { display: block; margin-bottom: 6px; color: var(--ih-muted); font: 900 9px/1 'Fira Code', Consolas, monospace; letter-spacing: .08em; }
        .summary-value { display: block; color: var(--ih-text); font: 950 15px/1 'Fira Code', Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .summary-value.good { color: var(--ih-success); }
        .summary-value.warn { color: var(--ih-warning); }
        .toolbar { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--ih-line); }
        .field { min-width: 0; }
        .field.wide { grid-column: 1 / -1; }
        .field label { display: block; margin: 0 0 7px 2px; color: var(--ih-muted); font: 900 10px/1 'Fira Code', Consolas, monospace; text-transform: uppercase; letter-spacing: .08em; }
        .input-shell { position: relative; }
        .input-shell svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--ih-muted); pointer-events: none; }
        .field select, .field input[type="text"] { width: 100%; min-height: 44px; border: 1px solid var(--ih-line); border-radius: 15px; outline: none; color: var(--ih-text); background: var(--ih-input); padding: 0 13px; font-size: 13px; font-weight: 650; }
        .field input[type="text"] { padding-left: 40px; }
        .quick-row { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .toggle-check { min-height: 44px; display: inline-flex; align-items: center; gap: 9px; color: var(--ih-soft); font-size: 13px; font-weight: 750; cursor: pointer; user-select: none; }
        .toggle-check input { width: 16px; height: 16px; accent-color: var(--ih-primary); }
        .stats-pill { padding: 8px 11px; border: 1px solid rgba(52,211,153,.28); border-radius: 999px; color: var(--ih-success); background: rgba(52,211,153,.1); font: 950 11px/1 'Fira Code', Consolas, monospace; }
        .content { max-height: calc(min(88vh, 860px) - 258px); padding: 12px 14px 14px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(37,99,235,.42) transparent; }
        .combo-card { position: relative; display: grid; gap: 12px; margin-bottom: 12px; padding: 15px; overflow: hidden; border: 1px solid var(--ih-line); border-radius: 20px; background: var(--ih-card); cursor: pointer; box-shadow: 0 12px 28px rgba(15,23,42,.08); transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease, opacity .18s ease; }
        .combo-card::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: linear-gradient(180deg, var(--ih-primary), var(--ih-purple)); opacity: .9; }
        .combo-card:hover { transform: translateY(-2px); border-color: var(--ih-line-strong); background: var(--ih-card-hover); box-shadow: 0 18px 38px rgba(15,23,42,.14), 0 0 0 1px rgba(37,99,235,.08); }
        .combo-card.sold-out { opacity: .52; cursor: not-allowed; filter: saturate(.45); }
        .combo-top, .combo-bottom { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .combo-main { min-width: 0; }
        .combo-title { color: var(--ih-text); font-size: 14px; font-weight: 900; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .combo-desc { margin-top: 6px; color: var(--ih-soft); font: 700 12px/1.45 'Fira Code', Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .badges, .tags { display: inline-flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 7px; flex: 0 0 auto; }
        .badge, .tag { display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 999px; border: 1px solid var(--ih-line); font: 900 10px/1 'Fira Code', Consolas, monospace; white-space: nowrap; }
        .badge.region { color: var(--ih-primary); background: rgba(37,99,235,.1); border-color: rgba(37,99,235,.24); }
        .badge.ok { color: var(--ih-success); background: rgba(52,211,153,.1); border-color: rgba(52,211,153,.28); }
        .badge.out { color: var(--ih-danger); background: rgba(251,113,133,.1); border-color: rgba(251,113,133,.3); }
        .spec-grid { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 8px; }
        .spec { min-width: 0; padding: 9px 8px; border: 1px solid var(--ih-line); border-radius: 14px; background: rgba(100,116,139,.1); }
        .spec-label { display: block; margin-bottom: 5px; color: var(--ih-muted); font: 900 9px/1 'Fira Code', Consolas, monospace; letter-spacing: .06em; }
        .spec-value { display: block; color: var(--ih-text); font: 950 11px/1 'Fira Code', Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .price { color: var(--ih-success); font: 950 19px/1 'Fira Code', Consolas, monospace; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
        .tag { color: var(--ih-muted); background: rgba(100,116,139,.1); }
        .footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; color: var(--ih-muted); border-top: 1px solid var(--ih-line); background: rgba(100,116,139,.08); font: 900 10px/1 'Fira Code', Consolas, monospace; text-transform: uppercase; }
        .status.info { color: var(--ih-primary); }
        .status.ok { color: var(--ih-success); }
        .status.error { color: var(--ih-danger); }
        .empty { margin: 8px 0; padding: 28px 20px; text-align: center; border: 1px dashed var(--ih-line); border-radius: 18px; color: var(--ih-muted); background: rgba(100,116,139,.08); font: 850 12px/1.6 'Fira Code', Consolas, monospace; }
        .empty.error { color: var(--ih-danger); border-color: rgba(251,113,133,.36); background: rgba(251,113,133,.1); }
        .skeleton { height: 150px; border-radius: 20px; background: linear-gradient(90deg, rgba(148,163,184,.12), rgba(148,163,184,.24), rgba(148,163,184,.12)); background-size: 200% 100%; animation: ih-shimmer 1.1s ease-in-out infinite; margin-bottom: 12px; }
        .incudal-helper-highlight { box-shadow: 0 0 0 3px rgba(37,99,235,.72), 0 0 28px rgba(37,99,235,.45) !important; }
        @keyframes ih-shimmer { to { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) { #${PANEL_ID}, #${PANEL_ID} * { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
        @media (max-width: 640px) {
            #${PANEL_ID} { top: 12px; right: 12px; width: calc(100vw - 24px); }
            .summary-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
            .toolbar { grid-template-columns: 1fr; }
            .spec-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
            .combo-top, .combo-bottom { flex-direction: column; align-items: stretch; }
            .badges, .tags { justify-content: flex-start; }
        }
    `;

    injectStyles();

    // ==================== 工具函数 ====================

    /** 注入样式，重复安装或热更新时先移除旧 style。 */
    function injectStyles() {
        document.getElementById(`${PANEL_ID}-style`)?.remove();
        const style = document.createElement('style');
        style.id = `${PANEL_ID}-style`;
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    /** 从 Incudal 本地存储读取 JWT，接口请求需要放到 Authorization。 */
    function getToken() {
        return localStorage.getItem('token') || '';
    }

    /** HTML 转义，避免接口字段直接拼接产生 DOM 注入。 */
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** 安全数字转换，处理 null、字符串和 undefined。 */
    function num(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    /** 防抖搜索输入，降低列表重绘频率。 */
    function debounce(fn, wait) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    /** 转换字节为 GB/TB 等易读单位。 */
    function formatBytes(bytes) {
        const value = num(bytes);
        if (!value) return '不限';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = value;
        let index = 0;
        while (size >= 1024 && index < units.length - 1) {
            size /= 1024;
            index += 1;
        }
        return `${Number(size.toFixed(size >= 10 ? 0 : 1))}${units[index]}`;
    }

    /** Incudal 金额以分为单位，统一展示人民币。 */
    function formatMoney(cents) {
        return `¥${(num(cents) / 100).toFixed(2)}`;
    }

    /** 账期转换为中文标签。 */
    function formatCycle(cycle) {
        const value = num(cycle, 1);
        if (value === 1) return '月付';
        if (value === 3) return '季付';
        if (value === 6) return '半年付';
        if (value === 12) return '年付';
        return `${value}月付`;
    }

    /** 内存/磁盘以 MB 为单位，自动显示 MB/GB。 */
    function formatMb(mb) {
        const value = num(mb);
        return value >= 1024 ? `${Number((value / 1024).toFixed(1))}GB` : `${value}MB`;
    }

    /** 根据套餐实例类型显示 LXC/KVM。 */
    function formatType(type) {
        return type === 'vm' ? 'KVM' : 'LXC';
    }

    /** 将网络模式转换为更短的视觉标签。 */
    function formatNetwork(mode) {
        if (mode === 'nat_ipv6') return 'NAT+IPv6';
        if (mode === 'nat') return 'NAT';
        return String(mode || '-').toUpperCase();
    }

    /** 更新状态栏。 */
    function setStatus(text, type = '') {
        const el = document.getElementById('ih-status');
        if (!el) return;
        el.textContent = text;
        el.className = `status ${type}`.trim();
    }

    /** 设置元素文本。 */
    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    /** 持久化筛选、主题、折叠和位置。 */
    function saveState(panel) {
        localStorage.setItem(STATE_KEY, JSON.stringify({
            sort: state.sort,
            region: state.region,
            hideSoldOut: state.hideSoldOut,
            theme: state.theme,
            collapsed: state.collapsed,
            left: panel?.style.left || '',
            top: panel?.style.top || '',
            right: panel?.style.right || '',
        }));
    }

    /** 恢复本脚本 UI 状态。 */
    function restoreState(panel) {
        try {
            const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
            state.sort = saved.sort || state.sort;
            state.region = saved.region || state.region;
            state.hideSoldOut = Boolean(saved.hideSoldOut);
            state.theme = saved.theme === 'dark' ? 'dark' : 'light';
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

    /** 统一接口请求，自动携带本地 token。 */
    async function apiGet(path) {
        const token = getToken();
        const response = await fetch(`${API_BASE}${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: 'include',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    // ==================== 面板 ====================

    /** 创建浮动面板 DOM。 */
    function createPanel() {
        document.getElementById(PANEL_ID)?.remove();
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.dataset.theme = state.theme;
        panel.innerHTML = `
            <div class="collapsed-icon" aria-label="展开 Incudal 价格助手">${ICONS.brand}</div>
            <div class="panel-shell">
                <div class="panel-header">
                    <div class="header-left">
                        <div class="brand-mark">${ICONS.brand}</div>
                        <div>
                            <div class="panel-title">Incudal 实例价格排序助手</div>
                            <div class="panel-subtitle">Create Instance · Pricing Console</div>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button class="icon-button" id="ih-theme" type="button" aria-label="切换主题"><span class="theme-icon-moon">${ICONS.moon}</span><span class="theme-icon-sun">${ICONS.sun}</span></button>
                        <button class="icon-button" id="ih-refresh" type="button" aria-label="刷新数据">${ICONS.refresh}</button>
                        <button class="icon-button" id="ih-collapse" type="button" aria-label="最小化">${ICONS.collapse}</button>
                    </div>
                </div>
                <div class="summary-grid">
                    ${summaryItem('COMBOS', '--', 'ih-total')}
                    ${summaryItem('IN STOCK', '--', 'ih-stock', 'good')}
                    ${summaryItem('MIN/MO', '--', 'ih-min', 'warn')}
                    ${summaryItem('REGIONS', '--', 'ih-regions')}
                </div>
                <div class="toolbar">
                    <div class="field">
                        <label for="ih-sort">排序</label>
                        <select id="ih-sort">
                            <option value="monthly-asc">月均价格从低到高</option>
                            <option value="monthly-desc">月均价格从高到低</option>
                            <option value="memory-desc">内存优先</option>
                            <option value="traffic-desc">流量优先</option>
                            <option value="disk-desc">硬盘优先</option>
                            <option value="region">按地区分组</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="ih-region">地区</label>
                        <select id="ih-region"><option value="all">全部地区</option></select>
                    </div>
                    <div class="field wide">
                        <label for="ih-search">搜索</label>
                        <div class="input-shell">${ICONS.search}<input id="ih-search" type="text" autocomplete="off" placeholder="输入地区、节点、方案、CPU 或网络..."></div>
                    </div>
                    <div class="quick-row">
                        <label class="toggle-check"><input id="ih-hide-sold" type="checkbox"> 隐藏售罄套餐</label>
                        <span class="stats-pill" id="ih-stats">0/0</span>
                    </div>
                </div>
                <div class="content" id="ih-list" aria-live="polite">
                    <div class="empty">正在等待页面登录状态...</div>
                </div>
                <div class="footer">
                    <span id="ih-last">SYNC --:--:--</span>
                    <span class="status" id="ih-status">AUTO 3m</span>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        restoreState(panel);
        syncControls();
        return panel;
    }

    /** 渲染摘要项。 */
    function summaryItem(label, value, id, className = '') {
        return `<div class="summary-item"><span class="summary-label">${label}</span><span class="summary-value ${className}" id="${id}">${value}</span></div>`;
    }

    /** 将状态同步到控件。 */
    function syncControls() {
        const sort = document.getElementById('ih-sort');
        const hideSold = document.getElementById('ih-hide-sold');
        if (sort) sort.value = state.sort;
        if (hideSold) hideSold.checked = state.hideSoldOut;
    }

    // ==================== 数据 ====================

    /** 拉取官方套餐、地区和每个套餐的付费方案，并合成可排序组合。 */
    async function loadData() {
        if (state.loading) return;
        const list = document.getElementById('ih-list');
        if (!getToken()) {
            list.innerHTML = '<div class="empty error">未检测到 Incudal 登录 Token，请先登录后刷新。</div>';
            setStatus('AUTH REQUIRED', 'error');
            return;
        }

        state.loading = true;
        list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
        setStatus('FETCHING...', 'info');

        try {
            const [packagesData, regionsData] = await Promise.all([
                apiGet('/packages?source=official'),
                apiGet('/packages/regions?source=official'),
            ]);
            state.packages = packagesData.packages || [];
            state.regions = regionsData.regions || [];

            const planGroups = await Promise.all(state.packages.map(async (pkg) => {
                try {
                    const data = await apiGet(`/packages/${pkg.id}/plans?activeOnly=true`);
                    return (data.plans || []).map((plan) => makeCombo(pkg, plan));
                } catch (error) {
                    return [];
                }
            }));

            state.combos = planGroups.flat();
            state.lastSync = new Date();
            updateRegionFilter();
            renderCombos();
            setText('ih-last', `SYNC ${state.lastSync.toLocaleTimeString('zh-CN', { hour12: false })}`);
            setStatus('AUTO 3m', 'ok');
        } catch (error) {
            list.innerHTML = `<div class="empty error">数据获取失败：${escapeHtml(error.message)}</div>`;
            setStatus('FETCH ERROR', 'error');
        } finally {
            state.loading = false;
        }
    }

    /** 合并套餐和方案字段，形成一个可展示、可排序的卡片数据。 */
    function makeCombo(pkg, plan) {
        const region = state.regions.find((item) => (item.packageIds || []).includes(pkg.id));
        return {
            packageId: pkg.id,
            planId: plan.id,
            packageName: pkg.name,
            packageDescription: pkg.description,
            planName: plan.name,
            planDescription: plan.description,
            regionCode: region?.code || 'unknown',
            regionName: translateRegion(region?.name || region?.code || '未知地区'),
            soldOut: Boolean(pkg.soldOut),
            type: pkg.instance_type,
            network: pkg.network_mode,
            nested: Boolean(pkg.nested),
            cpu: plan.cpu,
            memory: plan.memory,
            disk: plan.disk,
            traffic: plan.trafficLimit,
            speed: plan.trafficLimitSpeed,
            ports: plan.portLimit ?? pkg.port_limit,
            snapshots: plan.snapshotLimit ?? pkg.snapshot_limit,
            sites: plan.siteLimit ?? pkg.site_limit,
            price: plan.price,
            monthlyPrice: plan.monthlyPrice ?? (num(plan.price) / Math.max(1, num(plan.billingCycle, 1))),
            cycle: plan.billingCycle,
            sla: plan.slaGuarantee,
        };
    }

    /** 将接口英文地区名转换为页面常见中文。 */
    function translateRegion(name) {
        const map = {
            'United States': '美国',
            Germany: '德国',
            Poland: '波兰',
            Japan: '日本',
            'Hong Kong SAR China': '中国香港',
            France: '法国',
            Netherlands: '荷兰',
            Sweden: '瑞典',
            Canada: '加拿大',
        };
        return map[name] || name || '未知地区';
    }

    /** 刷新地区筛选器。 */
    function updateRegionFilter() {
        const select = document.getElementById('ih-region');
        const counts = new Map();
        state.combos.forEach((combo) => counts.set(combo.regionCode, {
            name: combo.regionName,
            count: (counts.get(combo.regionCode)?.count || 0) + 1,
        }));
        const options = ['<option value="all">全部地区</option>'];
        [...counts.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'zh-Hans-CN')).forEach(([code, item]) => {
            options.push(`<option value="${escapeHtml(code)}">${escapeHtml(item.name)} (${item.count})</option>`);
        });
        select.innerHTML = options.join('');
        state.region = state.region === 'all' || counts.has(state.region) ? state.region : 'all';
        select.value = state.region;
    }

    /** 按筛选条件和排序方式得到当前列表。 */
    function getFilteredCombos() {
        const keyword = state.keyword.toLowerCase();
        const filtered = state.combos.filter((combo) => {
            const regionMatched = state.region === 'all' || combo.regionCode === state.region;
            const stockMatched = !state.hideSoldOut || !combo.soldOut;
            const keywordMatched = !keyword || [
                combo.packageName, combo.packageDescription, combo.planName, combo.planDescription,
                combo.regionName, combo.regionCode, combo.type, combo.network,
            ].some((item) => String(item || '').toLowerCase().includes(keyword));
            return regionMatched && stockMatched && keywordMatched;
        });

        const byMonthlyAsc = (a, b) => num(a.monthlyPrice) - num(b.monthlyPrice);
        const sorters = {
            'monthly-asc': byMonthlyAsc,
            'monthly-desc': (a, b) => num(b.monthlyPrice) - num(a.monthlyPrice),
            'memory-desc': (a, b) => num(b.memory) - num(a.memory) || byMonthlyAsc(a, b),
            'traffic-desc': (a, b) => num(b.traffic) - num(a.traffic) || byMonthlyAsc(a, b),
            'disk-desc': (a, b) => num(b.disk) - num(a.disk) || byMonthlyAsc(a, b),
            region: (a, b) => a.regionName.localeCompare(b.regionName, 'zh-Hans-CN') || byMonthlyAsc(a, b),
        };
        return filtered.sort(sorters[state.sort] || byMonthlyAsc);
    }

    /** 渲染排序后的套餐方案组合。 */
    function renderCombos() {
        const list = document.getElementById('ih-list');
        const combos = getFilteredCombos();
        const stock = combos.filter((combo) => !combo.soldOut).length;
        const min = combos.length ? Math.min(...combos.map((combo) => num(combo.monthlyPrice))) : 0;
        const regionCount = new Set(combos.map((combo) => combo.regionCode)).size;

        setText('ih-stats', `${stock}/${combos.length}`);
        setText('ih-total', String(combos.length));
        setText('ih-stock', String(stock));
        setText('ih-min', combos.length ? formatMoney(min) : '--');
        setText('ih-regions', String(regionCount));

        if (!combos.length) {
            list.innerHTML = '<div class="empty">没有匹配的套餐方案。</div>';
            return;
        }

        let lastRegion = '';
        list.innerHTML = combos.map((combo) => {
            const divider = state.sort === 'region' && combo.regionCode !== lastRegion
                ? `<div class="empty" style="padding:10px 12px;text-align:left;">${escapeHtml(combo.regionName)}</div>`
                : '';
            lastRegion = combo.regionCode;
            return divider + renderComboCard(combo);
        }).join('');
    }

    /** 渲染单个套餐方案卡片。 */
    function renderComboCard(combo) {
        const className = `combo-card ${combo.soldOut ? 'sold-out' : ''}`;
        return `
            <div class="${className}" data-package-id="${combo.packageId}" data-plan-id="${combo.planId}" role="button" tabindex="0" title="点击选择该套餐和方案">
                <div class="combo-top">
                    <div class="combo-main">
                        <div class="combo-title">${escapeHtml(combo.packageName)} · ${escapeHtml(combo.planName)}</div>
                        <div class="combo-desc">${escapeHtml(combo.packageDescription || combo.planDescription || '-')}</div>
                    </div>
                    <div class="badges">
                        <span class="badge ${combo.soldOut ? 'out' : 'ok'}">${combo.soldOut ? 'SOLD OUT' : 'AVAILABLE'}</span>
                        <span class="badge region">${escapeHtml(combo.regionName)}</span>
                    </div>
                </div>
                <div class="spec-grid">
                    ${spec('CPU', `${num(combo.cpu)}%`)}
                    ${spec('RAM', formatMb(combo.memory))}
                    ${spec('DISK', formatMb(combo.disk))}
                    ${spec('TRF', formatBytes(combo.traffic))}
                    ${spec('PORT', combo.ports ?? '-')}
                    ${spec('NET', formatNetwork(combo.network))}
                </div>
                <div class="combo-bottom">
                    <span class="price">${formatMoney(combo.monthlyPrice)}/mo</span>
                    <div class="tags">
                        <span class="tag">${formatMoney(combo.price)} ${formatCycle(combo.cycle)}</span>
                        <span class="tag">${formatType(combo.type)}</span>
                        <span class="tag">${combo.nested ? '可嵌套' : '不可嵌套'}</span>
                        <span class="tag">SLA ${combo.sla ?? '-'}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    /** 渲染规格单元。 */
    function spec(label, value) {
        return `<span class="spec"><span class="spec-label">${escapeHtml(label)}</span><span class="spec-value">${escapeHtml(value)}</span></span>`;
    }

    // ==================== 选择同步 ====================

    /** 完整派发鼠标点击事件，兼容前端框架事件系统。 */
    function fullClick(element) {
        ['mousedown', 'mouseup', 'click'].forEach((name) => {
            element.dispatchEvent(new MouseEvent(name, { view: window, bubbles: true, cancelable: true }));
        });
    }

    /** 给页面原元素添加短暂高亮，帮助用户确认同步目标。 */
    function flash(element) {
        element.classList.add('incudal-helper-highlight');
        setTimeout(() => element.classList.remove('incudal-helper-highlight'), 1100);
    }

    /** 按精确文本在原页面中查找最接近的可点击卡片。 */
    function findClickableText(text) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const matches = [];
        let node;
        while ((node = walker.nextNode())) {
            const value = node.nodeValue.trim();
            const parent = node.parentElement;
            if (!value || value !== text || !parent || parent.closest(`#${PANEL_ID}`)) continue;
            matches.push(parent);
        }
        const source = matches.at(-1);
        return source ? source.closest(CLICKABLE_SELECTOR) || findCursorAncestor(source) || source : null;
    }

    /** 向上寻找带 cursor-pointer 的容器，这是 Incudal 卡片的点击承载层。 */
    function findCursorAncestor(element) {
        let current = element;
        for (let depth = 0; current && depth < 8; depth += 1) {
            const className = String(current.className || '');
            if (className.includes('cursor-pointer')) return current;
            current = current.parentElement;
        }
        return null;
    }

    /** 点击页面中的指定文本卡片。 */
    async function clickText(text) {
        const target = findClickableText(text);
        if (!target) return false;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        fullClick(target);
        flash(target);
        return true;
    }

    /** 点击助手卡片后，依次选择套餐和方案。 */
    async function selectCombo(packageId, planId) {
        const combo = state.combos.find((item) => String(item.packageId) === String(packageId) && String(item.planId) === String(planId));
        if (!combo || combo.soldOut) return;

        setStatus('SELECT PACKAGE...', 'info');
        const packageClicked = await clickText(combo.packageName);
        await sleep(packageClicked ? 500 : 120);

        setStatus('SELECT PLAN...', 'info');
        const planClicked = await clickText(combo.planName);
        setStatus(planClicked ? 'SELECTED' : 'DOM SYNC FAIL', planClicked ? 'ok' : 'error');
        setTimeout(() => setStatus('AUTO 3m'), 2500);
    }

    /** Promise 延迟，等待页面级联渲染方案列表。 */
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // ==================== 事件与拖拽 ====================

    /** 绑定筛选、主题、刷新、折叠、卡片选择事件。 */
    function bindEvents(panel) {
        document.getElementById('ih-sort').addEventListener('change', (event) => {
            state.sort = event.target.value;
            renderCombos();
            saveState(panel);
        });
        document.getElementById('ih-region').addEventListener('change', (event) => {
            state.region = event.target.value;
            renderCombos();
            saveState(panel);
        });
        document.getElementById('ih-hide-sold').addEventListener('change', (event) => {
            state.hideSoldOut = event.target.checked;
            renderCombos();
            saveState(panel);
        });
        document.getElementById('ih-search').addEventListener('input', debounce((event) => {
            state.keyword = event.target.value.trim();
            renderCombos();
        }, 180));
        document.getElementById('ih-theme').addEventListener('click', () => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            panel.dataset.theme = state.theme;
            saveState(panel);
        });
        document.getElementById('ih-refresh').addEventListener('click', loadData);
        document.getElementById('ih-collapse').addEventListener('click', () => {
            state.collapsed = true;
            panel.classList.add('collapsed');
            saveState(panel);
        });
        document.getElementById('ih-list').addEventListener('click', (event) => {
            const card = event.target.closest('.combo-card:not(.sold-out)');
            if (card) selectCombo(card.dataset.packageId, card.dataset.planId);
        });
        document.getElementById('ih-list').addEventListener('keydown', (event) => {
            if (!['Enter', ' '].includes(event.key)) return;
            const card = event.target.closest('.combo-card:not(.sold-out)');
            if (!card) return;
            event.preventDefault();
            selectCombo(card.dataset.packageId, card.dataset.planId);
        });
        bindDrag(panel);
    }

    /** 绑定展开态标题拖拽和折叠态图标吸附。 */
    function bindDrag(panel) {
        const header = panel.querySelector('.panel-header');
        const collapsedIcon = panel.querySelector('.collapsed-icon');
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
            panel.style.left = `${Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, panelX + deltaX))}px`;
            panel.style.top = `${Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, panelY + deltaY))}px`;
        });
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            panel.classList.remove('dragging');
            if (panel.classList.contains('collapsed')) {
                if (moved) snapCollapsed(panel);
                else expandFromIcon(panel);
            }
            saveState(panel);
        });
    }

    /** 从折叠图标展开时防止面板出界。 */
    function expandFromIcon(panel) {
        const rect = panel.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        state.collapsed = false;
        panel.classList.remove('collapsed');
        const left = Math.max(SNAP_MARGIN, Math.min(window.innerWidth - panel.offsetWidth - SNAP_MARGIN, centerX - panel.offsetWidth / 2));
        const top = Math.max(SNAP_MARGIN, Math.min(window.innerHeight - panel.offsetHeight - SNAP_MARGIN, centerY - 28));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = 'auto';
    }

    /** 折叠态拖拽结束后吸附到左右侧边。 */
    function snapCollapsed(panel) {
        const rect = panel.getBoundingClientRect();
        const left = rect.left + rect.width / 2 < window.innerWidth / 2 ? SNAP_MARGIN : window.innerWidth - rect.width - SNAP_MARGIN;
        const top = Math.max(SNAP_MARGIN, Math.min(window.innerHeight - rect.height - SNAP_MARGIN, rect.top));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = 'auto';
    }

    // ==================== 启动 ====================

    /** 初始化：创建面板、绑定事件、等待登录 token 后拉取数据。 */
    function init() {
        const panel = createPanel();
        bindEvents(panel);

        const timer = setInterval(() => {
            if (!getToken()) return;
            clearInterval(timer);
            loadData();
            setInterval(loadData, REFRESH_INTERVAL);
        }, 1000);

        setTimeout(() => {
            clearInterval(timer);
            if (!state.combos.length) loadData();
        }, 12000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
