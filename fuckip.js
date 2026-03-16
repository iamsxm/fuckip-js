// ==UserScript==
// @name         FuckIP 价格显示增强（颜色 + 升序排序）
// @namespace    https://fuckip.me/
// @version      20260304.03
// @description  创建页增强（排序/自动命名/悬浮窗）+ 详情页NAT增强（TCP+UDP、随机端口、双协议提交+按钮接管）。
// @author       suxiaomi
// @match        https://fuckip.me/dashboard*
// @run-at       document-idle
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/566346/FuckIP%20%E4%BB%B7%E6%A0%BC%E6%98%BE%E7%A4%BA%E5%A2%9E%E5%BC%BA%EF%BC%88%E9%A2%9C%E8%89%B2%20%2B%20%E5%8D%87%E5%BA%8F%E6%8E%92%E5%BA%8F%EF%BC%89.user.js
// @updateURL https://update.greasyfork.org/scripts/566346/FuckIP%20%E4%BB%B7%E6%A0%BC%E6%98%BE%E7%A4%BA%E5%A2%9E%E5%BC%BA%EF%BC%88%E9%A2%9C%E8%89%B2%20%2B%20%E5%8D%87%E5%BA%8F%E6%8E%92%E5%BA%8F%EF%BC%89.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const API = '/api/server-configs';
  const ROUTE_PATH = '/dashboard/servers/create';
  const SERVER_DETAIL_PATH_RE = /^\/dashboard\/servers\/([0-9a-f-]{36})\/?$/i;
  const PANEL_ID = 'fuckip-quick-panel';
  const PANEL_LAUNCHER_ID = 'fuckip-quick-panel-launcher';
  const PANEL_STYLE_ID = 'fuckip-quick-panel-style';
  const NAT_ENHANCE_STYLE_ID = 'fuckip-nat-enhance-style';
  const NAT_RANDOM_BTN_ID = 'fuckip-nat-random-port-btn';
  const NAT_PROTOCOL_TCP_UDP_VALUE = 'tcp+udp';

  let lastUrl = location.href;
  let serverConfigs = null;

  // typeId -> minPrice
  const priceCache = new Map();

  // MutationObserver & 防抖/防循环
  let observer = null;
  let stockObserver = null;
  let updateTimer = null;
  let isUpdating = false;
  let boundMainServerNameInput = null;
  const boundContainers = new WeakSet();
  let detailMutationObserver = null;
  let detailEnhanceTimer = null;

  /* ================= 工具：容器定位 ================= */

  // 页面框架可能会重建 #server-type-tabs，所以每次都重新查
  function getTabsContainer() {
    return (
      document.querySelector('#server-type-tabs') ||
      // 兜底：某些情况下容器结构变化，至少找到有 .subtab 的最近父节点
      document.querySelector('.subtabs') ||
      document.body
    );
  }

  function isCreatePage() {
    return location.href.includes(ROUTE_PATH);
  }

  function getDetailServerIdFromPath() {
    const match = location.pathname.match(SERVER_DETAIL_PATH_RE);
    return match ? match[1] : null;
  }

  function isServerDetailPage() {
    return Boolean(getDetailServerIdFromPath());
  }

  function getTabs() {
    const container = getTabsContainer();
    return Array.from(container.querySelectorAll('.subtab'));
  }

  function getTypeId(tab) {
    return String(tab?.getAttribute('data-type-id') || '');
  }

  /* ================= 价格规则 ================= */

  function getPriceColor(price) {
    if (price <= 0.1) return '#16a34a'; // 绿色
    if (price <= 0.3) return '#f97316'; // 橙色
    return '#eab308'; // 黄色
  }

  function formatPrice(price) {
    return `$${price.toFixed(2)}`;
  }

  function formatPriceForName(price) {
    if (typeof price !== 'number' || !Number.isFinite(price)) return 'na';
    return price.toFixed(2);
  }

  function random4Digits() {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }

  function parseAutoName(name) {
    const m = String(name || '').trim().match(/^server-([0-9]+(?:\.[0-9]+)?|na)-(\d{4})$/);
    if (!m) return null;
    return { priceText: m[1], code: m[2] };
  }

  function buildAutoName(price) {
    return `server-${formatPriceForName(price)}-${random4Digits()}`;
  }

  function getActiveTypePrice() {
    const active = document.querySelector('#server-type-tabs .subtab.active');
    if (!active) return null;
    const typeId = getTypeId(active);
    const price = priceCache.get(typeId);
    return typeof price === 'number' ? price : null;
  }

  function cleanTabText(text) {
    return String(text || '')
      .replace(/\|\s*\$\d+(?:\.\d+)?/g, '')
      .replace(/（已售罄）/g, '')
      .trim();
  }

  function getActiveTypeName() {
    const active = document.querySelector('#server-type-tabs .subtab.active');
    if (!active) return '-';
    const title = cleanTabText(active.getAttribute('title') || '');
    if (title) return title;
    const text = cleanTabText(active.textContent || '');
    return text || '-';
  }

  /* ================= 价格计算 ================= */

  function safeMin(item) {
    if (!item) return 0;
    if (typeof item.min === 'number') return item.min;
    if (typeof item.default === 'number') return item.default;
    return 0;
  }

  function safePrice(item) {
    return typeof item?.price === 'number' ? item.price : 0;
  }

  function calcMinPrice(config) {
    if (!config) return 0;
    let total = 0;
    for (const key in config) {
      const item = config[key];
      total += safeMin(item) * safePrice(item);
    }
    return total;
  }

  function buildCache(cfg) {
    priceCache.clear();
    if (!cfg?.regions) return;

    for (const region of cfg.regions) {
      for (const type of region.serverTypes || []) {
        if (!type?.id) continue;
        priceCache.set(String(type.id), calcMinPrice(type.config));
      }
    }
  }

  /* ================= DOM 注入（不破坏原结构） ================= */

  function injectPrice(tab, price) {
    let priceSpan = tab.querySelector('.fuckip-min-price');

    if (!priceSpan) {
      priceSpan = document.createElement('span');
      priceSpan.className = 'fuckip-min-price';
      priceSpan.style.marginLeft = '6px';
      priceSpan.style.fontWeight = '600';
      tab.appendChild(priceSpan);
    }

    priceSpan.textContent = `| ${formatPrice(price)}`;
    priceSpan.style.color = getPriceColor(price);
  }

  function isOutOfStock(tab) {
    const text = tab.textContent || '';
    if (text.includes('售罄') || text.includes('已售罄')) return true;
    if (tab.querySelector('.out-of-stock, .sold-out, [data-out-of-stock="true"]')) return true;
    return false;
  }

  function getDesiredKey(tab) {
    const typeId = getTypeId(tab);
    const price = priceCache.get(typeId);
    return {
      out: isOutOfStock(tab) ? 1 : 0,
      price: (typeof price === 'number' ? price : Number.POSITIVE_INFINITY),
      typeId,
    };
  }

  /* ================= 自动命名 ================= */

  function autoFillServerName() {
    const input = document.querySelector('#server-name');
    if (!input) return;

    const activePrice = getActiveTypePrice();
    if (activePrice == null) return;

    const current = input.value.trim();
    const desiredPriceText = formatPriceForName(activePrice);

    if (!current) {
      input.value = buildAutoName(activePrice);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const parsed = parseAutoName(current);
    if (!parsed) return; // 用户手动改过名称，不覆盖
    if (parsed.priceText === desiredPriceText) return;

    input.value = buildAutoName(activePrice);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ================= 右侧悬浮窗 ================= */

  function ensurePanelStyle() {
    if (document.getElementById(PANEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PANEL_STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 16px;
        top: 120px;
        width: 220px;
        background: rgba(18, 23, 33, 0.76);
        color: #e9eef7;
        border: 1px solid rgba(95, 120, 165, 0.45);
        border-radius: 10px;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
        z-index: 2147483600;
        padding: 10px;
        font-size: 12px;
        line-height: 1.4;
        backdrop-filter: blur(3px);
      }
      #${PANEL_ID} .fp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 6px;
        cursor: move;
        user-select: none;
        touch-action: none;
      }
      #${PANEL_ID} .fp-title {
        font-weight: 700;
        color: #9ad1ff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .fp-actions {
        display: inline-flex;
        gap: 4px;
      }
      #${PANEL_ID} .fp-action-btn {
        width: 18px;
        height: 18px;
        border: 1px solid rgba(162, 188, 228, 0.45);
        border-radius: 4px;
        background: rgba(44, 58, 82, 0.8);
        color: #d9e7ff;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
      }
      #${PANEL_ID} .fp-action-btn:hover {
        background: rgba(73, 100, 144, 0.85);
      }
      #${PANEL_ID} .fp-row {
        margin-bottom: 6px;
      }
      #${PANEL_ID} .fp-label {
        display: block;
        margin-bottom: 3px;
        color: #c5d3e6;
      }
      #${PANEL_ID} input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #4a5b7a;
        border-radius: 6px;
        background: #1d2634;
        color: #f2f6ff;
        padding: 5px 7px;
        outline: none;
      }
      #${PANEL_ID} input:focus {
        border-color: #6ea7ff;
      }
      #${PANEL_ID} .fp-price-range {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      #${PANEL_ID} .fp-stock {
        font-weight: 700;
        color: #7fffb8;
      }
      #${PANEL_ID} .fp-value {
        font-weight: 600;
        color: #dce9ff;
        word-break: break-all;
      }
      #${PANEL_ID} .fp-btn {
        width: 100%;
        border: 0;
        border-radius: 6px;
        background: #2f86ff;
        color: #fff;
        font-weight: 700;
        padding: 7px 8px;
        cursor: pointer;
      }
      #${PANEL_ID} .fp-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      #${PANEL_LAUNCHER_ID} {
        position: fixed;
        right: 0;
        top: 45vh;
        width: 26px;
        height: 88px;
        border: 1px solid rgba(95, 120, 165, 0.45);
        border-right: 0;
        border-radius: 8px 0 0 8px;
        background: rgba(24, 34, 50, 0.85);
        color: #dbe8ff;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 1px;
        cursor: pointer;
        z-index: 2147483600;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(3px);
      }
      #${PANEL_LAUNCHER_ID}:hover {
        background: rgba(37, 56, 85, 0.9);
      }
    `;
    document.head.appendChild(style);
  }

  function createFloatingPanel() {
    if (!isCreatePage()) return;
    if (document.getElementById(PANEL_ID)) {
      createPanelLauncher();
      return;
    }

    ensurePanelStyle();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="fp-header">
        <div class="fp-title">FuckIP 快捷面板</div>
        <div class="fp-actions">
          <button id="fp-close-btn" class="fp-action-btn" type="button" title="关闭">x</button>
        </div>
      </div>
      <div class="fp-row">
        <span class="fp-label">当前机型</span>
        <div id="fp-active-name" class="fp-value">-</div>
      </div>
      <div class="fp-row">
        <span class="fp-label">当前价格</span>
        <div id="fp-active-price" class="fp-value">-</div>
      </div>
      <div class="fp-row">
        <span class="fp-label">剩余数量</span>
        <div id="fp-stock" class="fp-stock">-</div>
      </div>
      <div class="fp-row">
        <span class="fp-label">服务器名称（同步）</span>
        <input id="fp-server-name" type="text" placeholder="默认自动填充">
      </div>
      <div class="fp-row">
        <span class="fp-label">快速搜索</span>
        <input id="fp-search" type="text" placeholder="输入关键词过滤机型">
      </div>
      <div class="fp-row">
        <span class="fp-label">快速价格筛选</span>
        <div class="fp-price-range">
          <input id="fp-price-min" type="number" step="0.01" min="0" placeholder="最低价">
          <input id="fp-price-max" type="number" step="0.01" min="0" placeholder="最高价">
        </div>
      </div>
      <div class="fp-row" style="margin-bottom:0;">
        <button id="fp-create-btn" class="fp-btn" type="button">创建服务器</button>
      </div>
    `;
    document.body.appendChild(panel);

    const searchInput = panel.querySelector('#fp-search');
    const minInput = panel.querySelector('#fp-price-min');
    const maxInput = panel.querySelector('#fp-price-max');
    const createBtn = panel.querySelector('#fp-create-btn');
    const panelServerNameInput = panel.querySelector('#fp-server-name');
    const closeBtn = panel.querySelector('#fp-close-btn');

    searchInput?.addEventListener('input', applyTabFilters);
    minInput?.addEventListener('input', applyTabFilters);
    maxInput?.addEventListener('input', applyTabFilters);
    panelServerNameInput?.addEventListener('input', syncServerNameFromPanel);
    panelServerNameInput?.addEventListener('blur', () => {
      if (!panelServerNameInput.value.trim()) {
        autoFillServerName();
        syncPanelStatus();
      }
    });
    createBtn?.addEventListener('click', () => {
      const rawBtn = document.querySelector('#create-server-btn');
      if (rawBtn && !rawBtn.disabled) rawBtn.click();
    });
    closeBtn?.addEventListener('click', () => hideFloatingPanel());

    createPanelLauncher();
    enablePanelDrag(panel);
    bindMainServerNameInput();
    syncPanelStatus();
    hideFloatingPanel();
  }

  function removeFloatingPanel() {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(PANEL_LAUNCHER_ID)?.remove();
  }

  function createPanelLauncher() {
    if (document.getElementById(PANEL_LAUNCHER_ID)) return;
    const launcher = document.createElement('button');
    launcher.id = PANEL_LAUNCHER_ID;
    launcher.type = 'button';
    launcher.title = '展开快捷面板';
    launcher.textContent = '面板';
    launcher.addEventListener('click', showFloatingPanel);
    document.body.appendChild(launcher);
  }

  function showFloatingPanel() {
    const panel = document.getElementById(PANEL_ID);
    const launcher = document.getElementById(PANEL_LAUNCHER_ID);
    if (!panel) return;
    panel.style.display = 'block';
    if (launcher) launcher.style.display = 'none';
    syncPanelStatus();
  }

  function hideFloatingPanel() {
    const panel = document.getElementById(PANEL_ID);
    const launcher = document.getElementById(PANEL_LAUNCHER_ID);
    if (panel) panel.style.display = 'none';
    if (launcher) launcher.style.display = 'flex';
  }

  /* ================= 详情页 NAT 增强 ================= */

  function ensureNatEnhanceStyle() {
    if (document.getElementById(NAT_ENHANCE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = NAT_ENHANCE_STYLE_ID;
    style.textContent = `
      #${NAT_RANDOM_BTN_ID} {
        display: inline-block;
        margin-left: 6px;
        font-size: 14px;
        line-height: 1;
        vertical-align: middle;
        cursor: pointer;
        user-select: none;
        opacity: 0.86;
      }
      #${NAT_RANDOM_BTN_ID}:hover {
        opacity: 1;
        transform: scale(1.08);
      }
    `;
    document.head.appendChild(style);
  }

  function ensureNatProtocolOption() {
    const protocolSelect = document.getElementById('nat-protocol');
    if (!protocolSelect) return;
    let protocolOption = protocolSelect.querySelector(`option[value="${NAT_PROTOCOL_TCP_UDP_VALUE}"]`);

    if (!protocolOption) {
      protocolOption = document.createElement('option');
      protocolOption.value = NAT_PROTOCOL_TCP_UDP_VALUE;
      protocolOption.textContent = 'TCP+UDP';
      protocolSelect.appendChild(protocolOption);
    }

    // 仅首次增强时设置默认值，避免覆盖用户后续手动选择
    if (protocolSelect.dataset.fuckipDefaultSet !== '1') {
      protocolSelect.value = NAT_PROTOCOL_TCP_UDP_VALUE;
      protocolSelect.dataset.fuckipDefaultSet = '1';
    }
  }

  function randomNatExternalPort() {
    return Math.floor(Math.random() * (65535 - 10000 + 1)) + 10000;
  }

  function ensureNatRandomButton() {
    const externalInput = document.getElementById('nat-external-port');
    if (!externalInput) return;
    if (document.getElementById(NAT_RANDOM_BTN_ID)) return;

    const legacyRow = document.getElementById('fuckip-nat-external-row');
    if (legacyRow && legacyRow.contains(externalInput) && legacyRow.parentElement) {
      legacyRow.parentElement.insertBefore(externalInput, legacyRow);
      legacyRow.remove();
    }

    const trigger = document.createElement('span');
    trigger.id = NAT_RANDOM_BTN_ID;
    trigger.textContent = '🎲';
    trigger.title = '随机';
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-label', '随机填充外部端口');
    trigger.tabIndex = 0;

    const fillRandomPort = () => {
      const value = String(randomNatExternalPort());
      externalInput.value = value;
      const internalInput = document.getElementById('nat-internal-port');
      if (internalInput) internalInput.value = value;
      externalInput.dispatchEvent(new Event('input', { bubbles: true }));
      externalInput.dispatchEvent(new Event('change', { bubbles: true }));
      if (internalInput) {
        internalInput.dispatchEvent(new Event('input', { bubbles: true }));
        internalInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    trigger.addEventListener('click', fillRandomPort);
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fillRandomPort();
      }
    });

    const label = document.querySelector('label[for="nat-external-port"]');
    if (label) {
      label.appendChild(trigger);
      return;
    }
    externalInput.insertAdjacentElement('afterend', trigger);
  }

  function getNatServerId() {
    return window.serverId || getDetailServerIdFromPath();
  }

  function getNatTableBody() {
    let tableBody = document.getElementById('nat-port-table-body');
    if (tableBody) return tableBody;

    const listContainer = document.getElementById('nat-port-list');
    if (!listContainer) return null;

    listContainer.innerHTML = `
      <table class="nat-port-table">
        <thead>
          <tr>
            <th>协议</th>
            <th>外部端口</th>
            <th>内部端口</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="nat-port-table-body"></tbody>
      </table>
    `;
    return document.getElementById('nat-port-table-body');
  }

  function natRowExists(tableBody, protocol, externalPort, internalPort) {
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    return rows.some((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) return false;
      const p = (cells[0].textContent || '').trim().toLowerCase();
      const ext = parseInt(cells[1].textContent || '', 10);
      const targetText = (cells[2].textContent || '').trim();
      return p === protocol && ext === externalPort && targetText.includes(String(internalPort));
    });
  }

  function appendNatRow(protocol, externalPort, internalPort, remark) {
    const tableBody = getNatTableBody();
    if (!tableBody) return;
    if (natRowExists(tableBody, protocol, externalPort, internalPort)) return;

    const row = document.createElement('tr');
    if (internalPort === 22) row.className = 'ssh-port-highlight';

    const protocolCell = document.createElement('td');
    protocolCell.textContent = protocol;

    const extCell = document.createElement('td');
    extCell.textContent = String(externalPort);

    const targetCell = document.createElement('td');
    targetCell.textContent = String(internalPort);
    if (internalPort === 22) {
      const natIp = (document.querySelector('.nat-ip-badge')?.textContent || '').trim();
      if (natIp) {
        const tip = document.createElement('div');
        tip.className = 'ssh-port-tooltip';
        tip.textContent = `SSH连接请使用: ${natIp}:${externalPort}`;
        targetCell.appendChild(tip);
      }
    }

    const remarkCell = document.createElement('td');
    remarkCell.textContent = remark || '';

    const actionCell = document.createElement('td');
    actionCell.className = 'nat-port-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-nat';
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      if (typeof window.deleteNatPort === 'function') {
        window.deleteNatPort(protocol, externalPort, internalPort, remark || '');
      }
    });
    actionCell.appendChild(delBtn);

    row.appendChild(protocolCell);
    row.appendChild(extCell);
    row.appendChild(targetCell);
    row.appendChild(remarkCell);
    row.appendChild(actionCell);
    tableBody.appendChild(row);
  }

  async function requestAddNatPort(serverId, protocol, externalPort, internalPort, remark) {
    const res = await fetch(`/api/servers/${serverId}/nat-port`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        protocol,
        port: externalPort,
        target: internalPort,
        remark,
      }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }

    if (!res.ok) {
      throw new Error(data?.msg || `HTTP ${res.status}`);
    }
    if (!data || data.code !== 0) {
      throw new Error(data?.msg || '接口返回异常');
    }
    return data;
  }

  async function enhancedAddNatPort() {
    const serverId = getNatServerId();
    if (!serverId) {
      alert('无法识别服务器ID');
      return;
    }

    const protocolValue = String(document.getElementById('nat-protocol')?.value || '').toLowerCase();
    const externalPort = parseInt(document.getElementById('nat-external-port')?.value || '', 10);
    const internalPort = parseInt(document.getElementById('nat-internal-port')?.value || '', 10);
    const remark = document.getElementById('nat-remark')?.value || '';

    if (!externalPort || !internalPort) {
      alert('请输入有效的端口号');
      return;
    }
    if (externalPort < 1 || externalPort > 65535 || internalPort < 1 || internalPort > 65535) {
      alert('端口号必须在1-65535之间');
      return;
    }

    const protocols = protocolValue === NAT_PROTOCOL_TCP_UDP_VALUE ? ['tcp', 'udp'] : [protocolValue];
    if (!protocols.every((p) => p === 'tcp' || p === 'udp')) {
      alert('协议无效，请选择 TCP、UDP 或 TCP+UDP');
      return;
    }

    const addBtn = document.querySelector('.nat-port-form button[onclick*="addNatPort"]');
    if (addBtn) addBtn.disabled = true;

    const success = [];
    const failed = [];
    try {
      for (const protocol of protocols) {
        try {
          await requestAddNatPort(serverId, protocol, externalPort, internalPort, remark);
          success.push(protocol);
          appendNatRow(protocol, externalPort, internalPort, remark);
        } catch (e) {
          failed.push(`${protocol.toUpperCase()}: ${e?.message || '未知错误'}`);
        }
      }
    } finally {
      if (addBtn) addBtn.disabled = false;
    }

    if (success.length > 0) {
      document.getElementById('nat-external-port').value = '';
      document.getElementById('nat-internal-port').value = '';
      document.getElementById('nat-remark').value = '';
    }

    if (failed.length === 0) {
      alert(protocols.length === 2 ? 'TCP+UDP 端口添加成功' : '端口添加成功');
      return;
    }

    if (success.length > 0) {
      alert(`端口部分添加成功。成功: ${success.map((p) => p.toUpperCase()).join(', ')}；失败: ${failed.join('；')}`);
      return;
    }

    alert(`添加端口失败: ${failed.join('；')}`);
  }

  function overrideAddNatPort() {
    if (window.addNatPort === enhancedAddNatPort) return;
    window.addNatPort = enhancedAddNatPort;
  }

  function ensureNatAddButtonBinding() {
    const addBtn = document.querySelector('.nat-port-form button[onclick*="addNatPort"]');
    if (!addBtn) return;
    if (addBtn.dataset.fuckipNatBound === '1') return;

    addBtn.dataset.fuckipNatBound = '1';
    addBtn.setAttribute('onclick', 'return false;');
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      enhancedAddNatPort();
    }, true);
  }

  function enhanceServerDetailNatSection() {
    if (!isServerDetailPage()) return;
    ensureNatEnhanceStyle();
    ensureNatProtocolOption();
    ensureNatRandomButton();
    overrideAddNatPort();
    ensureNatAddButtonBinding();
  }

  function scheduleDetailEnhance() {
    clearTimeout(detailEnhanceTimer);
    detailEnhanceTimer = setTimeout(() => {
      enhanceServerDetailNatSection();
    }, 120);
  }

  function observeDetailPage() {
    if (detailMutationObserver) detailMutationObserver.disconnect();
    detailMutationObserver = new MutationObserver(() => {
      scheduleDetailEnhance();
    });
    detailMutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function cleanupDetailEnhancement() {
    clearTimeout(detailEnhanceTimer);
    if (detailMutationObserver) detailMutationObserver.disconnect();
  }

  function bindMainServerNameInput() {
    const mainInput = document.querySelector('#server-name');
    if (mainInput === boundMainServerNameInput) return;

    if (boundMainServerNameInput) {
      boundMainServerNameInput.removeEventListener('input', syncServerNameFromMain);
    }
    boundMainServerNameInput = mainInput;
    if (boundMainServerNameInput) {
      boundMainServerNameInput.addEventListener('input', syncServerNameFromMain);
    }
  }

  function syncServerNameFromMain() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const panelInput = panel.querySelector('#fp-server-name');
    const mainInput = document.querySelector('#server-name');
    if (!panelInput || !mainInput) return;
    if (document.activeElement === panelInput) return;
    if (panelInput.value !== mainInput.value) {
      panelInput.value = mainInput.value;
    }
  }

  function syncServerNameFromPanel(e) {
    const mainInput = document.querySelector('#server-name');
    if (!mainInput) return;
    const next = e?.target?.value ?? '';
    if (mainInput.value !== next) {
      mainInput.value = next;
    }
    mainInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function enablePanelDrag(panel) {
    const handle = panel.querySelector('.fp-header');
    if (!handle) return;

    let dragging = false;
    let pointerId = null;
    let startClientX = 0;
    let startClientY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target && e.target.closest('.fp-action-btn')) return;
      dragging = true;
      pointerId = e.pointerId;

      const rect = panel.getBoundingClientRect();
      startClientX = e.clientX;
      startClientY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      panel.style.left = `${startLeft}px`;
      panel.style.top = `${startTop}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';

      handle.setPointerCapture(pointerId);
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pointerId) return;

      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;

      let nextLeft = startLeft + dx;
      let nextTop = startTop + dy;

      const maxLeft = Math.max(0, window.innerWidth - width);
      const maxTop = Math.max(0, window.innerHeight - height);
      nextLeft = Math.min(Math.max(0, nextLeft), maxLeft);
      nextTop = Math.min(Math.max(0, nextTop), maxTop);

      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    });

    const stopDrag = (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      handle.releasePointerCapture(pointerId);
      pointerId = null;
    };

    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
  }

  function getFilterState() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return null;

    const keyword = (panel.querySelector('#fp-search')?.value || '').trim().toLowerCase();
    const minVal = parseFloat(panel.querySelector('#fp-price-min')?.value || '');
    const maxVal = parseFloat(panel.querySelector('#fp-price-max')?.value || '');

    return {
      keyword,
      min: Number.isFinite(minVal) ? minVal : null,
      max: Number.isFinite(maxVal) ? maxVal : null,
    };
  }

  function getTabDisplayName(tab) {
    const base = tab.getAttribute('title') || tab.textContent || '';
    return cleanTabText(base).toLowerCase();
  }

  function applyTabFilters() {
    const state = getFilterState();
    if (!state) return;

    const tabs = getTabs();
    for (const tab of tabs) {
      const typeId = getTypeId(tab);
      const price = priceCache.get(typeId);
      const name = getTabDisplayName(tab);

      const hitKeyword = !state.keyword || name.includes(state.keyword);
      const hitMin = state.min == null || (typeof price === 'number' && price >= state.min);
      const hitMax = state.max == null || (typeof price === 'number' && price <= state.max);

      tab.style.display = hitKeyword && hitMin && hitMax ? '' : 'none';
    }
  }

  function syncPanelStatus() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    bindMainServerNameInput();

    const stockText = (document.querySelector('#stock-info')?.textContent || '').trim();
    const match = stockText.match(/(\d+)/);
    const stockValue = match ? match[1] : (stockText || '-');
    const activeTypeName = getActiveTypeName();
    const activeTypePrice = getActiveTypePrice();
    const activeTypePriceText = activeTypePrice == null ? '-' : formatPrice(activeTypePrice);
    const createRawBtn = document.querySelector('#create-server-btn');

    const activeNameEl = panel.querySelector('#fp-active-name');
    const activePriceEl = panel.querySelector('#fp-active-price');
    const stockEl = panel.querySelector('#fp-stock');
    const createBtn = panel.querySelector('#fp-create-btn');

    if (activeNameEl) activeNameEl.textContent = activeTypeName;
    if (activePriceEl) activePriceEl.textContent = activeTypePriceText;
    if (stockEl) stockEl.textContent = stockValue;
    if (createBtn) createBtn.disabled = !createRawBtn || createRawBtn.disabled;

    syncServerNameFromMain();
  }

  function observeStockInfo() {
    const stockInfo = document.querySelector('#stock-info');
    if (!stockInfo) return;

    if (stockObserver) stockObserver.disconnect();
    stockObserver = new MutationObserver(() => syncPanelStatus());
    stockObserver.observe(stockInfo, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function updateAllPricesAndSort() {
    const container = getTabsContainer();
    const tabs = Array.from(container.querySelectorAll('.subtab'));
    if (!tabs.length) {
      syncPanelStatus();
      return;
    }

    if (!priceCache.size) {
      applyTabFilters();
      autoFillServerName();
      syncPanelStatus();
      return;
    }
    if (isUpdating) return;

    isUpdating = true;

    // ✅ 关键修复：更新期间断开 observer，避免我们自己重排触发 observer → 循环
    if (observer) observer.disconnect();

    try {
      // 1) 先补价格（框架重建节点会丢 span，所以需要重复补）
      for (const tab of tabs) {
        const typeId = getTypeId(tab);
        if (!typeId) continue;

        const price = priceCache.get(typeId);
        if (typeof price !== 'number') continue;

        injectPrice(tab, price);
      }

      // 2) 排序：未售罄在前，售罄在后；组内按最低价升序
      //    ✅ 关键修复：只有当“目标顺序 != 当前顺序”时才重排 DOM，减少抖动与渲染打架
      const currentOrder = tabs.map(t => getTypeId(t)).join('|');

      const sorted = tabs.slice().sort((a, b) => {
        const A = getDesiredKey(a);
        const B = getDesiredKey(b);

        if (A.out !== B.out) return A.out - B.out;
        if (A.price !== B.price) return A.price - B.price;

        // 价格相同，保持稳定排序（按原 typeId 字符串）
        return A.typeId.localeCompare(B.typeId);
      });

      const targetOrder = sorted.map(t => getTypeId(t)).join('|');

      if (currentOrder !== targetOrder) {
        // ✅ 用 DocumentFragment 一次性插入，减少 reflow
        const frag = document.createDocumentFragment();
        sorted.forEach(t => frag.appendChild(t));
        container.appendChild(frag);
      }

      applyTabFilters();
      autoFillServerName();
      syncPanelStatus();
    } finally {
      // 恢复 observer
      observeTabs();
      isUpdating = false;
    }
  }

  /* ================= 调度（去抖） ================= */

  // ✅ 关键修复：不用 requestAnimationFrame（DOM 高频刷新的页面会打架）
  // 统一在“安静一会儿”后再处理，避免频繁重排
  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      updateAllPricesAndSort();
    }, 200);
  }

  /* ================= 加载接口 ================= */

  async function loadConfigsOnce() {
    if (serverConfigs) return;

    try {
      const res = await fetch(API, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      serverConfigs = await res.json();
      buildCache(serverConfigs);
      scheduleUpdate();
      console.log('✅ 最低价缓存构建完成');
    } catch (e) {
      console.error('❌ 获取 server-configs 失败', e);
    }
  }

  /* ================= DOM 监听（抗重建） ================= */

  function bindTabClick(container) {
    if (boundContainers.has(container)) return;
    boundContainers.add(container);
    container.addEventListener('click', (e) => {
      if (e.target && e.target.closest('.subtab')) {
        setTimeout(scheduleUpdate, 60);
      }
    }, true);
  }

  function observeTabs() {
    const container = getTabsContainer();
    if (!container) return;

    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      // DOM 在刷时别立刻处理，走去抖
      scheduleUpdate();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    bindTabClick(container);
  }

  function cleanupWhenLeavePage() {
    clearTimeout(updateTimer);
    if (observer) observer.disconnect();
    if (stockObserver) stockObserver.disconnect();
    if (boundMainServerNameInput) {
      boundMainServerNameInput.removeEventListener('input', syncServerNameFromMain);
      boundMainServerNameInput = null;
    }
    removeFloatingPanel();
  }

  /* ================= SPA 路由监听 ================= */

  function onRouteChange() {
    if (isCreatePage()) {
      cleanupDetailEnhancement();
      createFloatingPanel();
      loadConfigsOnce();
      observeStockInfo();
      observeTabs();
      scheduleUpdate();
      return;
    }

    cleanupWhenLeavePage();

    if (isServerDetailPage()) {
      enhanceServerDetailNatSection();
      observeDetailPage();
      scheduleDetailEnhance();
      return;
    }

    cleanupDetailEnhancement();
  }

  function checkUrl() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onRouteChange();
    }
  }

  const push = history.pushState;
  history.pushState = function () {
    push.apply(this, arguments);
    setTimeout(checkUrl, 50);
  };

  const replace = history.replaceState;
  history.replaceState = function () {
    replace.apply(this, arguments);
    setTimeout(checkUrl, 50);
  };

  window.addEventListener('popstate', checkUrl);

  // 首次执行
  onRouteChange();

})();
