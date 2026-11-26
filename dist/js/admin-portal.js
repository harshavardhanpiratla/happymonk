/* ==========================================================================
   HAPPY MONK — SEPARATE ADMIN PORTAL CONTROLLER
   Powers: /admin/login and /admin
   ========================================================================== */

const ADMIN_TOKEN_KEY = 'hm_admin_token';

const ORDER_STATUS_LIST = [
  'Order Placed',
  'Order Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Refunded',
];

const PAYMENT_STATUS_LIST = ['Pending', 'Paid', 'Refunded', 'Failed'];

function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch (_) {
    return '';
  }
}

function setAdminToken(token) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (_) {}
}

async function adminApi(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getAdminToken();
  if (token) {
    headers['X-Admin-Token'] = token;
  }
  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Admin request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)} CAD`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeHtml(status) {
  const s = String(status || '').toLowerCase();
  let cls = 'status-pending';
  if (s.includes('placed')) cls = 'status-placed';
  else if (s.includes('confirmed')) cls = 'status-confirmed';
  else if (s.includes('processing')) cls = 'status-processing';
  else if (s.includes('out for delivery')) cls = 'status-out-for-delivery';
  else if (s.includes('shipped')) cls = 'status-shipped';
  else if (s.includes('delivered') || s === 'paid' || s === 'in stock' || s === 'available')
    cls = 'status-delivered';
  else if (s.includes('low stock')) cls = 'status-processing';
  else if (
    s.includes('cancelled') ||
    s.includes('refunded') ||
    s.includes('out of stock') ||
    s === 'failed'
  )
    cls = 'status-cancelled';
  return `<span class="hm-status-badge ${cls}">${status}</span>`;
}

/* ==========================================================================
   1. ADMIN LOGIN PAGE (/admin/login)
   ========================================================================== */
async function initAdminLoginPage() {
  const form = document.getElementById('hm-admin-login-form');
  if (!form) return;

  // Check if already logged in as admin
  try {
    const me = await adminApi('/api/admin/auth/me');
    if (me && me.admin) {
      window.location.href = '/admin';
      return;
    }
  } catch (_) {}

  const pwToggle = document.getElementById('admin-pw-toggle');
  const pwInput = document.getElementById('admin-password');
  if (pwToggle && pwInput) {
    pwToggle.addEventListener('click', () => {
      if (pwInput.type === 'password') {
        pwInput.type = 'text';
        pwToggle.textContent = 'Hide';
      } else {
        pwInput.type = 'password';
        pwToggle.textContent = 'Show';
      }
    });
  }

  const alertBox = document.getElementById('hm-admin-login-alert');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.style.display = 'none';
    const email = document.getElementById('admin-email').value.trim();
    const password = pwInput.value;
    const btn = document.getElementById('admin-login-btn');

    btn.disabled = true;
    btn.textContent = 'Verifying Administrator...';
    try {
      const res = await adminApi('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAdminToken(res.token);
      window.location.href = '/admin';
    } catch (err) {
      alertBox.style.display = 'block';
      alertBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Sign In to Admin Portal';
    }
  });
}

/* ==========================================================================
   2. ADMIN DASHBOARD APPLICATION (/admin)
   ========================================================================== */
async function initAdminDashboardApp() {
  const appRoot = document.getElementById('hm-admin-app');
  if (!appRoot) return;

  let currentAdmin = null;
  try {
    const me = await adminApi('/api/admin/auth/me');
    currentAdmin = me.admin;
  } catch (_) {
    setAdminToken('');
    window.location.href = '/admin/login';
    return;
  }

  const adminNameEl = document.getElementById('hm-admin-user-label');
  if (adminNameEl) {
    adminNameEl.textContent = `${currentAdmin.name} (${currentAdmin.email})`;
  }

  let activeSection = 'dashboard';
  let dashboardData = null;
  let ordersList = [];
  let productsList = [];
  let customersList = [];
  let inventoryList = [];
  let settingsData = null;

  // Order filter state
  let orderFilterStatus = 'All Orders';
  let orderSearchQuery = '';
  let orderDateFilter = '';
  let orderSort = 'newest';
  let knownTopOrderId = null;

  const contentEl = document.getElementById('hm-admin-content');
  const sectionTitleEl = document.getElementById('hm-admin-section-title');
  const liveBannerContainer = document.getElementById('hm-admin-live-banners');

  function showNewOrderNotification(orderNumber, customerName, total) {
    if (!liveBannerContainer) return;
    const banner = document.createElement('div');
    banner.className = 'hm-live-order-banner';
    banner.innerHTML = `
      <div>
        <span class="hm-live-dot"></span>
        <strong style="letter-spacing:0.06em;text-transform:uppercase;">New Order Received — Order #${orderNumber}</strong>
        <span style="margin-left:10px;color:rgba(255,255,255,0.8);">
          from ${customerName || 'Customer'} (${formatMoney(total)})
        </span>
      </div>
      <div style="display:flex;gap:10px;">
        <button type="button" class="hm-toast-btn" data-inspect-order="${orderNumber}">View Order #${orderNumber}</button>
        <button type="button" class="hm-toast-btn is-ghost" data-dismiss-banner>Dismiss</button>
      </div>
    `;
    liveBannerContainer.prepend(banner);

    banner
      .querySelector('[data-inspect-order]')
      .addEventListener('click', () => {
        banner.remove();
        openOrderDetailsModal(orderNumber);
      });
    banner
      .querySelector('[data-dismiss-banner]')
      .addEventListener('click', () => banner.remove());
  }

  async function refreshBadgeCounts() {
    try {
      const dash = await adminApi('/api/admin/dashboard');
      dashboardData = dash;
      const newCountEl = document.getElementById('hm-nav-count-orders');
      if (newCountEl) {
        newCountEl.textContent = String(dash.stats.totalOrders || 0);
      }
      if (dash.recentOrders && dash.recentOrders.length > 0) {
        const newestId = dash.recentOrders[0].id;
        if (knownTopOrderId !== null && newestId > knownTopOrderId) {
          const newest = dash.recentOrders[0];
          showNewOrderNotification(
            newest.orderNumber,
            newest.customerName,
            newest.total
          );
          if (activeSection === 'dashboard' || activeSection === 'orders' || activeSection === 'inventory') {
            renderActiveSection(false);
          }
        }
        knownTopOrderId = newestId;
      } else if (knownTopOrderId === null) {
        knownTopOrderId = 0;
      }
    } catch (_) {}
  }

  // Bind Sidebar Navigation
  document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sec = btn.getAttribute('data-admin-nav');
      if (sec === 'logout') {
        await adminApi('/api/admin/auth/logout', { method: 'POST' }).catch(
          () => {}
        );
        setAdminToken('');
        window.location.href = '/admin/login';
        return;
      }
      activeSection = sec;
      document
        .querySelectorAll('[data-admin-nav]')
        .forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderActiveSection(true);
    });
  });

  /* ----------------------------------------------------------------
     SECTION 1: DASHBOARD OVERVIEW & ANALYTICS
     ---------------------------------------------------------------- */
  async function renderDashboardSection() {
    sectionTitleEl.textContent = 'Dashboard Overview';
    dashboardData = await adminApi('/api/admin/dashboard');
    const st = dashboardData.stats;
    const recent = dashboardData.recentOrders || [];
    const an = dashboardData.analytics || {};

    if (knownTopOrderId === null) {
      knownTopOrderId = recent.length > 0 ? recent[0].id : 0;
    }

    const newCountEl = document.getElementById('hm-nav-count-orders');
    if (newCountEl) newCountEl.textContent = String(st.totalOrders);

    const maxRevDay = Math.max(
      1,
      ...(an.ordersOverTime || []).map((d) => d.revenue)
    );

    contentEl.innerHTML = `
      <!-- 8 KPI Overview Cards -->
      <div class="hm-kpi-grid">
        <div class="hm-kpi-card">
          <span class="hm-kpi-label">Total Orders</span>
          <span class="hm-kpi-value">${st.totalOrders}</span>
          <span class="hm-kpi-sub">All database orders</span>
        </div>
        <div class="hm-kpi-card">
          <span class="hm-kpi-label">New Orders</span>
          <span class="hm-kpi-value">${st.newOrders}</span>
          <span class="hm-kpi-sub">Awaiting confirmation</span>
        </div>
        <div class="hm-kpi-card">
          <span class="hm-kpi-label">Processing Orders</span>
          <span class="hm-kpi-value">${st.processingOrders}</span>
          <span class="hm-kpi-sub">Confirmed & in kitchen</span>
        </div>
        <div class="hm-kpi-card">
          <span class="hm-kpi-label">Shipped Orders</span>
          <span class="hm-kpi-value">${st.shippedOrders}</span>
          <span class="hm-kpi-sub">In transit / out for delivery</span>
        </div>
        <div class="hm-kpi-card">
          <span class="hm-kpi-label">Delivered Orders</span>
          <span class="hm-kpi-value">${st.deliveredOrders}</span>
          <span class="hm-kpi-sub">Completed deliveries</span>
        </div>
        <div class="hm-kpi-card">
          <span class="hm-kpi-label">Total Customers</span>
          <span class="hm-kpi-value">${st.totalCustomers}</span>
          <span class="hm-kpi-sub">Registered customer accounts</span>
        </div>
        <div class="hm-kpi-card">
          <span class="hm-kpi-label">Total Products</span>
          <span class="hm-kpi-value">${st.totalProducts}</span>
          <span class="hm-kpi-sub">Active pantry catalog</span>
        </div>
        <div class="hm-kpi-card" style="background:#000;color:#fff;">
          <span class="hm-kpi-label" style="color:rgba(255,255,255,0.7);">Total Revenue</span>
          <span class="hm-kpi-value" style="color:#fff;">${formatMoney(st.totalRevenue)}</span>
          <span class="hm-kpi-sub" style="color:rgba(255,255,255,0.7);">Active & delivered orders</span>
        </div>
      </div>

      <!-- Recent Orders Table -->
      <div class="hm-table-card">
        <div class="hm-table-header">
          <h2 class="hm-table-title">Recent Orders</h2>
          <button type="button" class="hm-btn-secondary" style="height:38px;padding:0 16px;font-size:12px;" id="hm-dash-view-all-orders">
            Manage All Orders →
          </button>
        </div>
        <div class="hm-table-wrap">
          <table class="hm-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                recent.length === 0
                  ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:#666;">No orders placed yet. Incoming customer orders will appear here automatically.</td></tr>`
                  : recent
                      .map(
                        (o) => `
                  <tr>
                    <td><strong>#${o.orderNumber}</strong></td>
                    <td>
                      <div><strong>${o.customerName}</strong></div>
                      <div style="font-size:12px;color:#666;">${o.customerEmail}</div>
                    </td>
                    <td>${formatDate(o.orderDate)}</td>
                    <td><strong>${formatMoney(o.total)}</strong></td>
                    <td>${statusBadgeHtml(o.paymentStatus)} <span style="font-size:12px;color:#555;">(${o.paymentMethod})</span></td>
                    <td>${statusBadgeHtml(o.orderStatus)}</td>
                    <td>
                      <button type="button" class="hm-btn-secondary" style="height:34px;padding:0 12px;font-size:11px;" data-open-order="${o.orderNumber}">
                        View Details
                      </button>
                    </td>
                  </tr>
                `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Analytics Grid: Orders & Revenue Over Time + Best-Selling Products + Recent Customers -->
      <div class="hm-form-row-2">
        <div class="hm-table-card">
          <div class="hm-table-header">
            <h2 class="hm-table-title">Orders & Revenue Over Time</h2>
          </div>
          <div style="padding:20px 24px;">
            ${
              !an.ordersOverTime || an.ordersOverTime.length === 0
                ? `<p style="color:#666;padding:18px 0;">Revenue and order volume charts populate automatically as orders are placed.</p>`
                : an.ordersOverTime
                    .map((d) => {
                      const pct = Math.max(
                        8,
                        Math.round((d.revenue / maxRevDay) * 100)
                      );
                      return `
                        <div style="margin-bottom:14px;">
                          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
                            <strong>${d.day}</strong>
                            <span>${d.orderCount} order(s) · <strong>${formatMoney(d.revenue)}</strong></span>
                          </div>
                          <div style="height:10px;background:#eee;border:1px solid #000;">
                            <div style="height:100%;width:${pct}%;background:#000;"></div>
                          </div>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>
        </div>

        <div class="hm-table-card">
          <div class="hm-table-header">
            <h2 class="hm-table-title">Best-Selling Products</h2>
          </div>
          <div class="hm-table-wrap">
            <table class="hm-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Units Sold</th>
                  <th>Revenue</th>
                  <th>Stock Left</th>
                </tr>
              </thead>
              <tbody>
                ${(an.bestSellingProducts || [])
                  .map(
                    (p) => `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:10px;">
                        <img src="${p.image}" alt="${p.name}" style="width:36px;height:36px;object-fit:cover;border:1px solid #000;" />
                        <strong>${p.name}</strong>
                      </div>
                    </td>
                    <td><strong>${p.unitsSold}</strong></td>
                    <td>${formatMoney(p.revenue)}</td>
                    <td>${p.stock}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Recent Customer Registrations -->
      <div class="hm-table-card">
        <div class="hm-table-header">
          <h2 class="hm-table-title">Recent Customer Registrations</h2>
        </div>
        <div class="hm-table-wrap">
          <table class="hm-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Registered</th>
                <th>Orders</th>
                <th>Total Spent</th>
              </tr>
            </thead>
            <tbody>
              ${
                !an.recentCustomers || an.recentCustomers.length === 0
                  ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:#666;">No customer registrations yet.</td></tr>`
                  : an.recentCustomers
                      .map(
                        (c) => `
                    <tr>
                      <td><strong>${c.name}</strong></td>
                      <td>${c.email}</td>
                      <td>${c.phone || '—'}</td>
                      <td>${formatDate(c.createdAt)}</td>
                      <td>${c.totalOrders}</td>
                      <td><strong>${formatMoney(c.totalSpending)}</strong></td>
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    const viewAllBtn = document.getElementById('hm-dash-view-all-orders');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        document.querySelector('[data-admin-nav="orders"]').click();
      });
    }

    contentEl.querySelectorAll('[data-open-order]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openOrderDetailsModal(btn.getAttribute('data-open-order'));
      });
    });
  }

  /* ----------------------------------------------------------------
     SECTION 2: ADMIN ORDER MANAGEMENT
     ---------------------------------------------------------------- */
  async function renderOrdersSection() {
    sectionTitleEl.textContent = 'Order Management';
    const qs = new URLSearchParams();
    if (orderFilterStatus && orderFilterStatus !== 'All Orders') {
      qs.set('status', orderFilterStatus);
    }
    if (orderSearchQuery) qs.set('q', orderSearchQuery);
    if (orderDateFilter) qs.set('date', orderDateFilter);
    qs.set('sort', orderSort);

    const res = await adminApi(`/api/admin/orders?${qs.toString()}`);
    ordersList = res.orders || [];

    const filterTabs = [
      'All Orders',
      'New Orders',
      'Confirmed',
      'Processing',
      'Shipped',
      'Out for Delivery',
      'Delivered',
      'Cancelled',
      'Refunded',
    ];

    contentEl.innerHTML = `
      <div class="hm-table-card">
        <div class="hm-table-header">
          <h2 class="hm-table-title">Orders (${ordersList.length})</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <input type="date" id="hm-ord-date" class="hm-input" style="height:38px;width:160px;" value="${orderDateFilter}" />
            <select id="hm-ord-sort" class="hm-select" style="height:38px;width:155px;">
              <option value="newest" ${orderSort === 'newest' ? 'selected' : ''}>Newest First</option>
              <option value="oldest" ${orderSort === 'oldest' ? 'selected' : ''}>Oldest First</option>
            </select>
          </div>
        </div>

        <div class="hm-filter-bar" style="justify-content:space-between;">
          <div class="hm-filter-pills">
            ${filterTabs
              .map(
                (tab) => `
              <button type="button" class="hm-filter-pill ${
                orderFilterStatus === tab ? 'is-active' : ''
              }" data-ord-filter="${tab}">${tab}</button>
            `
              )
              .join('')}
          </div>
          <div style="display:flex;gap:8px;min-width:280px;">
            <input type="search" id="hm-ord-search" class="hm-input" style="height:36px;" placeholder="Search Order ID, name, email..." value="${orderSearchQuery}" />
            <button type="button" class="hm-btn-primary" id="hm-ord-search-btn" style="height:36px;min-width:86px;padding:0 14px;font-size:11px;">Search</button>
          </div>
        </div>

        <div class="hm-table-wrap">
          <table class="hm-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Order Date</th>
                <th>Products Ordered</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Order Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${
                ordersList.length === 0
                  ? `<tr><td colspan="10" style="text-align:center;padding:36px;color:#666;">No matching orders found.</td></tr>`
                  : ordersList
                      .map(
                        (o) => `
                    <tr>
                      <td><strong>#${o.orderNumber}</strong></td>
                      <td>
                        <div><strong>${o.customerName}</strong></div>
                        <div style="font-size:12px;color:#666;">${o.customerEmail}</div>
                      </td>
                      <td>${o.customerPhone || '—'}</td>
                      <td>${formatDate(o.orderDate)}</td>
                      <td>
                        ${o.items
                          .map(
                            (it) =>
                              `<div style="font-size:12.5px;"><strong>${it.name}</strong> (${it.packSize}) × ${it.quantity}</div>`
                          )
                          .join('')}
                      </td>
                      <td><strong>${o.totalQuantity}</strong></td>
                      <td><strong>${formatMoney(o.total)}</strong></td>
                      <td>
                        <div>${statusBadgeHtml(o.paymentStatus)}</div>
                        <div style="font-size:11px;color:#666;margin-top:2px;">${o.paymentMethod}</div>
                      </td>
                      <td>${statusBadgeHtml(o.orderStatus)}</td>
                      <td>
                        <button type="button" class="hm-btn-primary" style="height:34px;min-width:110px;padding:0 12px;font-size:11px;" data-open-order="${o.orderNumber}">
                          Manage Order
                        </button>
                      </td>
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    contentEl.querySelectorAll('[data-ord-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        orderFilterStatus = btn.getAttribute('data-ord-filter');
        renderOrdersSection();
      });
    });

    const searchInput = document.getElementById('hm-ord-search');
    const searchBtn = document.getElementById('hm-ord-search-btn');
    if (searchBtn && searchInput) {
      const triggerSearch = () => {
        orderSearchQuery = searchInput.value.trim();
        renderOrdersSection();
      };
      searchBtn.addEventListener('click', triggerSearch);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') triggerSearch();
      });
    }

    const dateIn = document.getElementById('hm-ord-date');
    if (dateIn) {
      dateIn.addEventListener('change', () => {
        orderDateFilter = dateIn.value;
        renderOrdersSection();
      });
    }

    const sortSel = document.getElementById('hm-ord-sort');
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        orderSort = sortSel.value;
        renderOrdersSection();
      });
    }

    contentEl.querySelectorAll('[data-open-order]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openOrderDetailsModal(btn.getAttribute('data-open-order'));
      });
    });
  }

  /* ----------------------------------------------------------------
     ORDER DETAILS & STATUS UPDATE MODAL
     ---------------------------------------------------------------- */
  async function openOrderDetailsModal(orderNumber) {
    try {
      const res = await adminApi(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}`
      );
      const o = res.order;
      const addr = o.shippingAddress || {};

      const modalWrap = document.createElement('div');
      modalWrap.className = 'hm-modal-backdrop';
      modalWrap.innerHTML = `
        <div class="hm-modal" role="dialog" aria-label="Order Details #${o.orderNumber}">
          <div class="hm-modal-head">
            <div>
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.7);">ORDER MANAGEMENT</span>
              <h2 class="hm-modal-title">Order #${o.orderNumber}</h2>
            </div>
            <button type="button" class="hm-cart-close" data-close-modal>✕</button>
          </div>

          <div class="hm-modal-body">
            <!-- Status Update Control Box -->
            <div style="border:2px solid #000;background:#f8f8f8;padding:18px;margin-bottom:24px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
                <div>
                  <span class="hm-label" style="margin:0;">Update Order & Payment Status</span>
                  <span style="font-size:12px;color:#555;">Changes immediately update the customer's live Order Tracking page</span>
                </div>
                <div>Current: ${statusBadgeHtml(o.orderStatus)}</div>
              </div>

              <form id="hm-admin-status-form" style="display:grid;grid-template-columns:1fr 1fr 1.2fr auto;gap:12px;align-items:end;">
                <div>
                  <label class="hm-label" for="adm-ord-status">Order Status</label>
                  <select id="adm-ord-status" class="hm-select" style="height:42px;">
                    ${ORDER_STATUS_LIST.map(
                      (st) =>
                        `<option value="${st}" ${
                          o.orderStatus === st ? 'selected' : ''
                        }>${st}</option>`
                    ).join('')}
                  </select>
                </div>
                <div>
                  <label class="hm-label" for="adm-pay-status">Payment Status</label>
                  <select id="adm-pay-status" class="hm-select" style="height:42px;">
                    ${PAYMENT_STATUS_LIST.map(
                      (ps) =>
                        `<option value="${ps}" ${
                          o.paymentStatus === ps ? 'selected' : ''
                        }>${ps}</option>`
                    ).join('')}
                  </select>
                </div>
                <div>
                  <label class="hm-label" for="adm-ord-note">Status Note (Optional)</label>
                  <input type="text" id="adm-ord-note" class="hm-input" style="height:42px;" placeholder="e.g. Dispatched via Canada Post" />
                </div>
                <button type="submit" class="hm-btn-primary" id="adm-ord-save-btn" style="height:42px;min-width:140px;padding:0 18px;">
                  Update Status
                </button>
              </form>
              <div id="adm-ord-feedback" style="margin-top:10px;font-size:13px;font-weight:600;display:none;"></div>
            </div>

            <!-- Customer & Delivery Details + Payment & Order Info -->
            <div class="hm-form-row-2" style="margin-bottom:24px;">
              <div style="border:1px solid #000;padding:16px;">
                <div class="hm-label">Customer & Delivery Details</div>
                <div><strong>${addr.fullName || o.customerName}</strong></div>
                <div style="font-size:13px;color:#444;">Email: ${addr.email || o.customerEmail}</div>
                <div style="font-size:13px;color:#444;margin-bottom:10px;">Phone: ${addr.phone || o.customerPhone}</div>
                <div class="hm-label" style="margin-top:8px;">Shipping Address</div>
                <div>${addr.addressLine1 || ''} ${addr.addressLine2 || ''}</div>
                <div>${addr.city || ''}, ${addr.stateProvince || ''} ${addr.postalCode || ''}</div>
                <div>${addr.country || 'Canada'}</div>
                ${o.notes ? `<div style="margin-top:8px;font-size:12.5px;color:#555;"><strong>Notes:</strong> ${o.notes}</div>` : ''}
              </div>

              <div style="border:1px solid #000;padding:16px;">
                <div class="hm-label">Order & Payment Summary</div>
                <div class="hm-cart-summary-row"><span>Order ID</span><strong>#${o.orderNumber}</strong></div>
                <div class="hm-cart-summary-row"><span>Order Date</span><span>${formatDate(o.orderDate)}</span></div>
                <div class="hm-cart-summary-row"><span>Payment Method</span><strong>${o.paymentMethod}</strong></div>
                <div class="hm-cart-summary-row"><span>Payment Status</span><span>${statusBadgeHtml(o.paymentStatus)}</span></div>
                <div class="hm-cart-summary-row"><span>Subtotal</span><span>${formatMoney(o.subtotal)}</span></div>
                <div class="hm-cart-summary-row"><span>Shipping</span><span>${o.shipping === 0 ? 'Free' : formatMoney(o.shipping)}</span></div>
                <div class="hm-cart-summary-row"><span>Taxes</span><span>${formatMoney(o.taxes)}</span></div>
                <div class="hm-cart-summary-row is-total" style="margin-bottom:0;"><span>Total Amount</span><span>${formatMoney(o.total)}</span></div>
              </div>
            </div>

            <!-- Products Ordered Table -->
            <h3 style="font-family:var(--hm-serif);font-size:22px;margin-bottom:10px;">Products Ordered (${o.totalQuantity} units)</h3>
            <div class="hm-table-wrap" style="border:1px solid #000;margin-bottom:24px;">
              <table class="hm-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Pack Size</th>
                    <th>Unit Price</th>
                    <th>Quantity</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${o.items
                    .map(
                      (it) => `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:12px;">
                          <img src="${it.image}" alt="${it.name}" style="width:44px;height:44px;object-fit:cover;border:1px solid #000;" />
                          <strong>${it.name}</strong>
                        </div>
                      </td>
                      <td>${it.packSize}</td>
                      <td>${formatMoney(it.unitPrice)}</td>
                      <td><strong>${it.quantity}</strong></td>
                      <td><strong>${formatMoney(it.subtotal)}</strong></td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>

            <!-- Order Status Audit History -->
            <h3 style="font-family:var(--hm-serif);font-size:22px;margin-bottom:10px;">Order Status History</h3>
            <div style="border:1px solid #000;padding:14px;background:#fafafa;">
              ${(o.statusHistory || [])
                .map(
                  (h) => `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;">
                  <div>
                    <strong>${h.previousStatus ? `${h.previousStatus} → ` : ''}${h.newStatus}</strong>
                    ${h.note ? `<span style="color:#555;"> — ${h.note}</span>` : ''}
                  </div>
                  <div style="color:#666;">
                    by <strong>${h.updatedByName}</strong> · ${formatDate(h.updatedAt)}
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modalWrap);
      modalWrap
        .querySelector('[data-close-modal]')
        .addEventListener('click', () => modalWrap.remove());
      modalWrap.addEventListener('click', (e) => {
        if (e.target === modalWrap) modalWrap.remove();
      });

      const statusForm = modalWrap.querySelector('#hm-admin-status-form');
      const feedbackEl = modalWrap.querySelector('#adm-ord-feedback');
      const saveBtn = modalWrap.querySelector('#adm-ord-save-btn');

      statusForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
          const orderStatus = modalWrap.querySelector('#adm-ord-status').value;
          const paymentStatus = modalWrap.querySelector('#adm-pay-status').value;
          const note = modalWrap.querySelector('#adm-ord-note').value.trim();

          await adminApi(
            `/api/admin/orders/${encodeURIComponent(o.orderNumber)}/status`,
            {
              method: 'PATCH',
              body: JSON.stringify({ orderStatus, paymentStatus, note }),
            }
          );
          modalWrap.remove();
          await renderActiveSection(false);
          openOrderDetailsModal(o.orderNumber);
        } catch (err) {
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = 'var(--hm-red)';
          feedbackEl.textContent = err.message;
          saveBtn.disabled = false;
          saveBtn.textContent = 'Update Status';
        }
      });
    } catch (err) {
      window.alert(err.message);
    }
  }

  /* ----------------------------------------------------------------
     SECTION 3: PRODUCT MANAGEMENT
     ---------------------------------------------------------------- */
  async function renderProductsSection() {
    sectionTitleEl.textContent = 'Product Management';
    const res = await adminApi('/api/admin/products');
    productsList = res.products || [];

    contentEl.innerHTML = `
      <div class="hm-table-card">
        <div class="hm-table-header">
          <div>
            <h2 class="hm-table-title">Storefront Products (${productsList.length})</h2>
            <p style="font-size:13px;color:#555;margin-top:4px;">Any price, stock, pack size, or description change automatically updates the live Happy Monk website.</p>
          </div>
          <button type="button" class="hm-btn-primary" id="hm-admin-add-product-btn" style="height:42px;min-width:170px;padding:0 18px;font-size:12px;">
            + Add New Product
          </button>
        </div>

        <div class="hm-table-wrap">
          <table class="hm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Category</th>
                <th>Price (CAD)</th>
                <th>Pack Sizes</th>
                <th>Stock</th>
                <th>Units Sold</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${productsList
                .map(
                  (p) => `
                <tr>
                  <td><strong>${p.number}</strong></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:12px;">
                      <img src="${p.image}" alt="${p.name}" style="width:48px;height:48px;object-fit:cover;border:1px solid #000;" />
                      <div>
                        <strong>${p.name}</strong>
                        <div style="font-size:12px;color:#666;">/products/${p.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td>${p.category}</td>
                  <td><strong>${formatMoney(p.price)}</strong></td>
                  <td>${(p.packSizes || []).join(', ')}</td>
                  <td><strong>${p.stock}</strong></td>
                  <td>${p.unitsSold || 0}</td>
                  <td>${statusBadgeHtml(
                    p.availability === 'available' && p.stock > 0
                      ? 'Available'
                      : 'Out of Stock'
                  )}</td>
                  <td>
                    <div style="display:flex;gap:8px;">
                      <button type="button" class="hm-btn-secondary" style="height:32px;padding:0 12px;font-size:11px;" data-edit-prod="${p.id}">Edit</button>
                      <button type="button" class="hm-btn-secondary" style="height:32px;padding:0 12px;font-size:11px;border-color:var(--hm-red);color:var(--hm-red);" data-del-prod="${p.id}">Archive</button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document
      .getElementById('hm-admin-add-product-btn')
      .addEventListener('click', () => openProductModal(null));

    contentEl.querySelectorAll('[data-edit-prod]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-prod'));
        const prod = productsList.find((x) => x.id === id);
        if (prod) openProductModal(prod);
      });
    });

    contentEl.querySelectorAll('[data-del-prod]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-del-prod'));
        const prod = productsList.find((x) => x.id === id);
        if (
          !prod ||
          !window.confirm(
            `Archive "${prod.name}" and remove it from the public storefront?`
          )
        )
          return;
        await adminApi(`/api/admin/products/${id}`, { method: 'DELETE' });
        renderProductsSection();
      });
    });
  }

  function openProductModal(product = null) {
    const isEdit = Boolean(product);
    const p = product || {
      name: '',
      category: 'Spices',
      price: 16.0,
      stock: 25,
      lowStockThreshold: 8,
      packSizes: ['250g', '500g'],
      image: '/img/spices.png',
      description: '',
      kitchenCopy: '',
      recipeHeading: '',
      recipeCopy: '',
      availability: 'available',
      supplier: 'Happy Monk Certified Grower',
      certificateType: 'Purity & Lab Quality Assay',
      issuingBody: 'CFIA / Accredited Lab',
      certificateNumber: `HM-${Date.now().toString().slice(-4)}`,
    };

    const modalWrap = document.createElement('div');
    modalWrap.className = 'hm-modal-backdrop';
    modalWrap.innerHTML = `
      <div class="hm-modal" role="dialog">
        <div class="hm-modal-head">
          <h2 class="hm-modal-title">${isEdit ? `Edit ${p.name}` : 'Add New Product'}</h2>
          <button type="button" class="hm-cart-close" data-close-modal>✕</button>
        </div>
        <div class="hm-modal-body">
          <form id="hm-prod-modal-form">
            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label">Product Name *</label>
                <input type="text" id="pm-name" class="hm-input" required value="${p.name}" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label">Category *</label>
                <input type="text" id="pm-category" class="hm-input" required value="${p.category}" placeholder="Coffee, Honey, Spices, Ghee" />
              </div>
            </div>

            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label">Price (CAD) *</label>
                <input type="number" step="0.01" min="0" id="pm-price" class="hm-input" required value="${p.price}" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label">Pack Sizes (comma-separated) *</label>
                <input type="text" id="pm-packs" class="hm-input" required value="${(p.packSizes || ['250g']).join(', ')}" placeholder="250g, 500g" />
              </div>
            </div>

            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label">Stock Quantity *</label>
                <input type="number" min="0" id="pm-stock" class="hm-input" required value="${p.stock}" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label">Availability Status</label>
                <select id="pm-avail" class="hm-select">
                  <option value="available" ${p.availability === 'available' ? 'selected' : ''}>Available (In Stock)</option>
                  <option value="out_of_stock" ${p.availability === 'out_of_stock' ? 'selected' : ''}>Out of Stock</option>
                </select>
              </div>
            </div>

            <div class="hm-form-group">
              <label class="hm-label">Product Image Path or URL *</label>
              <input type="text" id="pm-image" class="hm-input" required value="${p.image}" placeholder="/img/coffee.png" />
            </div>

            <div class="hm-form-group">
              <label class="hm-label">From Happy Monk's Kitchen Story / Description</label>
              <textarea id="pm-kitchen" class="hm-textarea">${p.kitchenCopy || p.description || ''}</textarea>
            </div>

            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label">Dish / Recipe Heading</label>
                <input type="text" id="pm-recipe-head" class="hm-input" value="${p.recipeHeading || ''}" placeholder="e.g. South Indian filter coffee" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label">Dish / Recipe Note</label>
                <input type="text" id="pm-recipe-copy" class="hm-input" value="${p.recipeCopy || ''}" />
              </div>
            </div>

            <div style="border-top:1px solid #000;padding-top:16px;margin-top:8px;">
              <div class="hm-label" style="margin-bottom:12px;">Proof on the Pack (Certificate Metadata)</div>
              <div class="hm-form-row-2">
                <div class="hm-form-group">
                  <label class="hm-label">Supplier</label>
                  <input type="text" id="pm-supplier" class="hm-input" value="${p.supplier || ''}" />
                </div>
                <div class="hm-form-group">
                  <label class="hm-label">Certificate Type</label>
                  <input type="text" id="pm-cert-type" class="hm-input" value="${p.certificateType || ''}" />
                </div>
              </div>
              <div class="hm-form-row-2">
                <div class="hm-form-group">
                  <label class="hm-label">Issuing Body</label>
                  <input type="text" id="pm-issuing" class="hm-input" value="${p.issuingBody || ''}" />
                </div>
                <div class="hm-form-group">
                  <label class="hm-label">Certificate Number</label>
                  <input type="text" id="pm-cert-num" class="hm-input" value="${p.certificateNumber || ''}" />
                </div>
              </div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:16px;">
              <button type="button" class="hm-btn-secondary" data-close-modal>Cancel</button>
              <button type="submit" class="hm-btn-primary" id="pm-save-btn">
                ${isEdit ? 'Save Product Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modalWrap);
    modalWrap.querySelectorAll('[data-close-modal]').forEach((b) => {
      b.addEventListener('click', () => modalWrap.remove());
    });

    modalWrap
      .querySelector('#hm-prod-modal-form')
      .addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          name: modalWrap.querySelector('#pm-name').value.trim(),
          category: modalWrap.querySelector('#pm-category').value.trim(),
          price: Number(modalWrap.querySelector('#pm-price').value),
          packSizes: modalWrap
            .querySelector('#pm-packs')
            .value.split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          stock: parseInt(modalWrap.querySelector('#pm-stock').value, 10) || 0,
          availability: modalWrap.querySelector('#pm-avail').value,
          image: modalWrap.querySelector('#pm-image').value.trim(),
          description: modalWrap.querySelector('#pm-kitchen').value.trim(),
          kitchenCopy: modalWrap.querySelector('#pm-kitchen').value.trim(),
          recipeHeading: modalWrap.querySelector('#pm-recipe-head').value.trim(),
          recipeCopy: modalWrap.querySelector('#pm-recipe-copy').value.trim(),
          supplier: modalWrap.querySelector('#pm-supplier').value.trim(),
          certificateType: modalWrap.querySelector('#pm-cert-type').value.trim(),
          issuingBody: modalWrap.querySelector('#pm-issuing').value.trim(),
          certificateNumber: modalWrap.querySelector('#pm-cert-num').value.trim(),
        };

        try {
          if (isEdit) {
            await adminApi(`/api/admin/products/${p.id}`, {
              method: 'PUT',
              body: JSON.stringify(payload),
            });
          } else {
            await adminApi('/api/admin/products', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
          }
          modalWrap.remove();
          renderProductsSection();
        } catch (err) {
          window.alert(err.message);
        }
      });
  }

  /* ----------------------------------------------------------------
     SECTION 4: CUSTOMER MANAGEMENT
     ---------------------------------------------------------------- */
  let customerSearch = '';
  async function renderCustomersSection() {
    sectionTitleEl.textContent = 'Customer Management';
    const res = await adminApi(
      `/api/admin/customers?q=${encodeURIComponent(customerSearch)}`
    );
    customersList = res.customers || [];

    contentEl.innerHTML = `
      <div class="hm-table-card">
        <div class="hm-table-header">
          <h2 class="hm-table-title">Registered Customers (${customersList.length})</h2>
          <div style="display:flex;gap:8px;min-width:300px;">
            <input type="search" id="hm-cust-search" class="hm-input" style="height:38px;" placeholder="Search name, email, phone..." value="${customerSearch}" />
            <button type="button" class="hm-btn-primary" id="hm-cust-search-btn" style="height:38px;min-width:90px;padding:0 14px;font-size:11px;">Search</button>
          </div>
        </div>

        <div class="hm-table-wrap">
          <table class="hm-table">
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Phone Number</th>
                <th>Registration Date</th>
                <th>Total Orders</th>
                <th>Total Spending</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                customersList.length === 0
                  ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:#666;">No matching customers found.</td></tr>`
                  : customersList
                      .map(
                        (c) => `
                    <tr>
                      <td><strong>${c.customerCode}</strong></td>
                      <td><strong>${c.name}</strong></td>
                      <td>${c.email}</td>
                      <td>${c.phone || '—'}</td>
                      <td>${formatDate(c.createdAt)}</td>
                      <td><strong>${c.totalOrders}</strong></td>
                      <td><strong>${formatMoney(c.totalSpending)}</strong></td>
                      <td>
                        <button type="button" class="hm-btn-secondary" style="height:32px;padding:0 12px;font-size:11px;" data-view-cust="${c.id}">
                          Profile & Orders
                        </button>
                      </td>
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    const sIn = document.getElementById('hm-cust-search');
    const sBtn = document.getElementById('hm-cust-search-btn');
    if (sBtn && sIn) {
      const run = () => {
        customerSearch = sIn.value.trim();
        renderCustomersSection();
      };
      sBtn.addEventListener('click', run);
      sIn.addEventListener('keydown', (e) => e.key === 'Enter' && run());
    }

    contentEl.querySelectorAll('[data-view-cust]').forEach((btn) => {
      btn.addEventListener('click', () =>
        openCustomerModal(Number(btn.getAttribute('data-view-cust')))
      );
    });
  }

  async function openCustomerModal(customerId) {
    try {
      const res = await adminApi(`/api/admin/customers/${customerId}`);
      const c = res.customer;
      const modalWrap = document.createElement('div');
      modalWrap.className = 'hm-modal-backdrop';
      modalWrap.innerHTML = `
        <div class="hm-modal" role="dialog">
          <div class="hm-modal-head">
            <div>
              <span style="font-size:10px;letter-spacing:0.18em;color:rgba(255,255,255,0.7);">${c.customerCode}</span>
              <h2 class="hm-modal-title">${c.name}</h2>
            </div>
            <button type="button" class="hm-cart-close" data-close-modal>✕</button>
          </div>
          <div class="hm-modal-body">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:16px;border:1px solid #000;background:#fafafa;margin-bottom:24px;">
              <div><div class="hm-label">Email</div><strong>${c.email}</strong></div>
              <div><div class="hm-label">Phone</div><strong>${c.phone || '—'}</strong></div>
              <div><div class="hm-label">Total Orders</div><strong>${c.totalOrders}</strong></div>
              <div><div class="hm-label">Total Spending</div><strong>${formatMoney(c.totalSpending)}</strong></div>
            </div>

            <h3 style="font-family:var(--hm-serif);font-size:22px;margin-bottom:12px;">Customer Order History</h3>
            ${
              c.orders.length === 0
                ? `<p style="color:#666;">This customer has not placed any orders yet.</p>`
                : `<div class="hm-table-wrap" style="border:1px solid #000;">
                     <table class="hm-table">
                       <thead>
                         <tr>
                           <th>Order ID</th>
                           <th>Date</th>
                           <th>Items</th>
                           <th>Total</th>
                           <th>Payment</th>
                           <th>Status</th>
                         </tr>
                       </thead>
                       <tbody>
                         ${c.orders
                           .map(
                             (o) => `
                           <tr>
                             <td><strong>#${o.orderNumber}</strong></td>
                             <td>${formatDate(o.orderDate)}</td>
                             <td>${o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</td>
                             <td><strong>${formatMoney(o.total)}</strong></td>
                             <td>${statusBadgeHtml(o.paymentStatus)}</td>
                             <td>${statusBadgeHtml(o.orderStatus)}</td>
                           </tr>
                         `
                           )
                           .join('')}
                       </tbody>
                     </table>
                   </div>`
            }
          </div>
        </div>
      `;
      document.body.appendChild(modalWrap);
      modalWrap
        .querySelector('[data-close-modal]')
        .addEventListener('click', () => modalWrap.remove());
    } catch (err) {
      window.alert(err.message);
    }
  }

  /* ----------------------------------------------------------------
     SECTION 5: INVENTORY MANAGEMENT
     ---------------------------------------------------------------- */
  async function renderInventorySection() {
    sectionTitleEl.textContent = 'Inventory Management';
    const res = await adminApi('/api/admin/inventory');
    inventoryList = res.inventory || [];

    const lowCount = inventoryList.filter(
      (i) => i.isLowStock || i.isOutOfStock
    ).length;

    contentEl.innerHTML = `
      ${
        lowCount > 0
          ? `<div class="hm-alert is-error" style="margin-bottom:20px;">
               <strong>Inventory Alert:</strong> ${lowCount} product(s) are currently Low Stock or Out of Stock.
             </div>`
          : ''
      }

      <div class="hm-table-card">
        <div class="hm-table-header">
          <div>
            <h2 class="hm-table-title">Real-Time Pantry Inventory</h2>
            <p style="font-size:13px;color:#555;margin-top:4px;">Stock automatically deducts inside an atomic database transaction when orders are placed, and restores if an order is cancelled or refunded.</p>
          </div>
        </div>

        <div class="hm-table-wrap">
          <table class="hm-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Stock Status</th>
                <th>Units Sold</th>
                <th>Low-Stock Warning At</th>
                <th>Quick Stock Update</th>
              </tr>
            </thead>
            <tbody>
              ${inventoryList
                .map(
                  (item) => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:12px;">
                      <img src="${item.image}" alt="${item.name}" style="width:42px;height:42px;object-fit:cover;border:1px solid #000;" />
                      <strong>${item.name}</strong>
                    </div>
                  </td>
                  <td>${item.category}</td>
                  <td><strong style="font-size:17px;">${item.stock}</strong> units</td>
                  <td>${statusBadgeHtml(item.stockStatus)}</td>
                  <td><strong>${item.unitsSold}</strong></td>
                  <td>≤ ${item.lowStockThreshold} units</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <input type="number" min="0" class="hm-input" style="width:88px;height:34px;" value="${item.stock}" data-inv-input="${item.id}" />
                      <button type="button" class="hm-btn-primary" style="height:34px;min-width:86px;padding:0 12px;font-size:11px;" data-inv-save="${item.id}">
                        Save Stock
                      </button>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    contentEl.querySelectorAll('[data-inv-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-inv-save'));
        const input = contentEl.querySelector(`[data-inv-input="${id}"]`);
        const newStock = Math.max(0, parseInt(input.value, 10) || 0);
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
          await adminApi(`/api/admin/inventory/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ stock: newStock }),
          });
          renderInventorySection();
        } catch (err) {
          window.alert(err.message);
          btn.disabled = false;
          btn.textContent = 'Save Stock';
        }
      });
    });
  }

  /* ----------------------------------------------------------------
     SECTION 6: SETTINGS & AUDIT LOGS
     ---------------------------------------------------------------- */
  async function renderSettingsSection() {
    sectionTitleEl.textContent = 'Store Settings & Audit Logs';
    const res = await adminApi('/api/admin/settings');
    settingsData = res.settings;
    const logs = res.auditLogs || [];

    contentEl.innerHTML = `
      <div class="hm-form-row-2">
        <div class="hm-table-card" style="padding:24px;">
          <h2 class="hm-table-title" style="margin-bottom:18px;">Shipping, Tax & Checkout Rules</h2>
          <div id="hm-settings-alert" style="display:none;"></div>
          <form id="hm-admin-settings-form">
            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label">Standard Shipping Fee (CAD)</label>
                <input type="number" step="0.01" min="0" id="st-shipping" class="hm-input" value="${settingsData.shipping_fee}" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label">Free Shipping Threshold (CAD)</label>
                <input type="number" step="0.01" min="0" id="st-free-thresh" class="hm-input" value="${settingsData.free_shipping_threshold}" />
              </div>
            </div>

            <div class="hm-form-group">
              <label class="hm-label">Applicable Tax Rate (%)</label>
              <input type="number" step="0.1" min="0" id="st-tax" class="hm-input" value="${settingsData.tax_rate_percent}" />
            </div>

            <div class="hm-form-group">
              <label class="hm-label">Interac e-Transfer Instructions</label>
              <textarea id="st-etransfer" class="hm-textarea">${settingsData.etransfer_instructions || ''}</textarea>
            </div>

            <button type="submit" class="hm-btn-primary" style="width:100%;">Save Store Settings</button>
          </form>
        </div>

        <div class="hm-table-card">
          <div class="hm-table-header">
            <h2 class="hm-table-title">Administrator Audit Logs</h2>
          </div>
          <div class="hm-table-wrap" style="max-height:420px;overflow-y:auto;">
            <table class="hm-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Entity</th>
                </tr>
              </thead>
              <tbody>
                ${
                  logs.length === 0
                    ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:#666;">No audit events recorded yet.</td></tr>`
                    : logs
                        .map(
                          (l) => `
                      <tr>
                        <td style="font-size:12px;">${formatDate(l.createdAt)}</td>
                        <td style="font-size:12px;">${l.adminEmail}</td>
                        <td><strong>${l.action}</strong></td>
                        <td style="font-size:12px;">${l.entityType} #${l.entityId}</td>
                      </tr>
                    `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const form = document.getElementById('hm-admin-settings-form');
    const alertBox = document.getElementById('hm-settings-alert');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await adminApi('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            shipping_fee: Number(document.getElementById('st-shipping').value),
            free_shipping_threshold: Number(
              document.getElementById('st-free-thresh').value
            ),
            tax_rate_percent: Number(document.getElementById('st-tax').value),
            etransfer_instructions: document
              .getElementById('st-etransfer')
              .value.trim(),
          }),
        });
        alertBox.style.display = 'block';
        alertBox.className = 'hm-alert is-success';
        alertBox.textContent = 'Store settings updated.';
      } catch (err) {
        alertBox.style.display = 'block';
        alertBox.className = 'hm-alert is-error';
        alertBox.textContent = err.message;
      }
    });
  }

  async function renderActiveSection(showLoading = false) {
    if (showLoading) {
      contentEl.innerHTML = `<div class="hm-table-card" style="padding:32px;">Loading ${activeSection}...</div>`;
    }
    try {
      if (activeSection === 'dashboard') await renderDashboardSection();
      else if (activeSection === 'orders') await renderOrdersSection();
      else if (activeSection === 'products') await renderProductsSection();
      else if (activeSection === 'customers') await renderCustomersSection();
      else if (activeSection === 'inventory') await renderInventorySection();
      else if (activeSection === 'settings') await renderSettingsSection();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        setAdminToken('');
        window.location.href = '/admin/login';
        return;
      }
      contentEl.innerHTML = `<div class="hm-alert is-error">${err.message}</div>`;
    }
  }

  // Initial render
  await renderActiveSection(true);

  // Connect real-time Server-Sent Events stream + 4-second periodic fallback
  try {
    const token = getAdminToken();
    const es = new EventSource(
      `/api/events?role=admin&token=${encodeURIComponent(token)}`
    );
    es.addEventListener('new_order', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.order && data.order.id) {
          knownTopOrderId = Math.max(knownTopOrderId || 0, data.order.id);
        }
        showNewOrderNotification(
          data.orderNumber,
          data.customerName,
          data.total
        );
        renderActiveSection(false);
      } catch (_) {}
    });
    es.addEventListener('order_updated', () => {
      if (
        activeSection === 'dashboard' ||
        activeSection === 'orders' ||
        activeSection === 'inventory'
      ) {
        renderActiveSection(false);
      }
    });
    es.addEventListener('customer_registered', () => {
      if (activeSection === 'dashboard' || activeSection === 'customers') {
        renderActiveSection(false);
      }
    });
  } catch (_) {}

  setInterval(() => {
    refreshBadgeCounts();
  }, 4000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initAdminLoginPage();
    initAdminDashboardApp();
  });
} else {
  initAdminLoginPage();
  initAdminDashboardApp();
}
