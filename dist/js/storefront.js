/* ==========================================================================
   HAPPY MONK — SHARED STOREFRONT, CART, & CUSTOMER SESSION ENGINE
   ========================================================================== */

const GUEST_CART_KEY = 'hm_guest_cart_v1';
const CUSTOMER_TOKEN_KEY = 'hm_customer_token';

export const HM = {
  user: null,
  products: [],
  settings: {
    shipping_fee: 8.0,
    free_shipping_threshold: 75.0,
    tax_rate_percent: 13.0,
    currency: 'CAD',
    cancellable_statuses: ['Order Placed', 'Order Confirmed'],
  },
  cart: {
    items: [],
    itemCount: 0,
    subtotal: 0,
    shipping: 0,
    taxes: 0,
    total: 0,
  },
  listeners: new Set(),

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  notify() {
    for (const fn of this.listeners) {
      try {
        fn(this);
      } catch (e) {
        console.error(e);
      }
    }
  },

  getToken() {
    try {
      return localStorage.getItem(CUSTOMER_TOKEN_KEY) || '';
    } catch (_) {
      return '';
    }
  },

  setToken(token) {
    try {
      if (token) localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
      else localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    } catch (_) {}
  },

  async api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const token = this.getToken();
    if (token && !headers['X-Customer-Token']) {
      headers['X-Customer-Token'] = token;
    }
    const res = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  },

  getGuestCartRaw() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  },

  setGuestCartRaw(items) {
    try {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    } catch (_) {}
  },

  clearGuestCart() {
    try {
      localStorage.removeItem(GUEST_CART_KEY);
    } catch (_) {}
  },

  computeGuestCart() {
    const raw = this.getGuestCartRaw();
    const items = [];
    for (const entry of raw) {
      const product =
        this.products.find(
          (p) => p.id === Number(entry.productId) || p.slug === entry.slug
        ) || null;
      if (!product || product.availability === 'archived') continue;
      const packSize =
        entry.packSize ||
        (product.packSizes && product.packSizes[0]) ||
        'Standard';
      const maxStock = Math.max(0, Number(product.stock));
      const qty =
        maxStock > 0
          ? Math.min(maxStock, Math.max(1, Number(entry.quantity) || 1))
          : Math.max(1, Number(entry.quantity) || 1);
      const unitPrice = Number(product.price);
      const subtotal = Math.round(unitPrice * qty * 100) / 100;
      items.push({
        id: `${product.id}-${packSize}`,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        category: product.category,
        packSize,
        packSizes: product.packSizes || ['Standard'],
        unitPrice,
        quantity: qty,
        subtotal,
        image: product.image,
        imageAlt: product.imageAlt,
        stock: maxStock,
        availability: product.availability,
      });
    }
    const subtotal =
      Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
    const fee = Number(this.settings.shipping_fee ?? 8);
    const freeThresh = Number(this.settings.free_shipping_threshold ?? 75);
    const taxRate = Number(this.settings.tax_rate_percent ?? 13);
    const shipping =
      subtotal <= 0 ? 0 : subtotal >= freeThresh ? 0 : Math.round(fee * 100) / 100;
    const taxes =
      Math.round((subtotal + shipping) * (taxRate / 100) * 100) / 100;
    const total = Math.round((subtotal + shipping + taxes) * 100) / 100;
    this.cart = {
      items,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      subtotal,
      shipping,
      taxes,
      total,
    };
    return this.cart;
  },

  async init() {
    try {
      const [prodData, authData] = await Promise.all([
        this.api('/api/products').catch(() => ({ products: [], settings: {} })),
        this.api('/api/auth/me').catch(() => ({ user: null })),
      ]);

      if (Array.isArray(prodData.products)) {
        this.products = prodData.products;
      }
      if (prodData.settings) {
        this.settings = { ...this.settings, ...prodData.settings };
      }

      if (authData && authData.user) {
        this.user = authData.user;
        const guestItems = this.getGuestCartRaw();
        if (guestItems.length > 0) {
          const merged = await this.api('/api/cart/merge', {
            method: 'POST',
            body: JSON.stringify({ items: guestItems, mode: 'max' }),
          });
          this.clearGuestCart();
          this.cart = merged;
        } else if (authData.cart) {
          this.cart = authData.cart;
        }
      } else {
        this.user = null;
        this.computeGuestCart();
      }
    } catch (e) {
      console.error('HM init error:', e);
    }

    this.renderNavAndDrawer();
    this.enhanceStorefrontPages();
    this.notify();
    return this;
  },

  async addToCart({ productId, slug, packSize, quantity = 1 }) {
    const product =
      this.products.find(
        (p) => (productId && p.id === Number(productId)) || (slug && p.slug === slug)
      ) || null;
    if (!product) {
      throw new Error('Product not found.');
    }
    if (product.availability !== 'available' || product.stock <= 0) {
      throw new Error(`${product.name} is currently out of stock.`);
    }
    const chosenPack =
      packSize || (product.packSizes && product.packSizes[0]) || 'Standard';
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    if (this.user) {
      const updated = await this.api('/api/cart', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          slug: product.slug,
          packSize: chosenPack,
          quantity: qty,
          mode: 'add',
        }),
      });
      this.cart = updated;
    } else {
      const raw = this.getGuestCartRaw();
      const idx = raw.findIndex(
        (i) =>
          (i.productId === product.id || i.slug === product.slug) &&
          i.packSize === chosenPack
      );
      const currentQty = idx !== -1 ? Number(raw[idx].quantity) || 0 : 0;
      if (currentQty + qty > product.stock) {
        throw new Error(
          `Only ${product.stock} unit(s) of ${product.name} are available in stock.`
        );
      }
      if (idx !== -1) {
        raw[idx].quantity = currentQty + qty;
      } else {
        raw.push({
          productId: product.id,
          slug: product.slug,
          packSize: chosenPack,
          quantity: qty,
        });
      }
      this.setGuestCartRaw(raw);
      this.computeGuestCart();
    }

    this.updateCartUI();
    this.notify();
    this.showToast({
      title: 'Added to Cart',
      message: `${qty} × ${product.name} (${chosenPack}) added to your pantry cart.`,
      showCartActions: true,
    });
    return this.cart;
  },

  async updateCartQuantity({ productId, packSize, quantity }) {
    const qty = parseInt(quantity, 10) || 0;
    if (this.user) {
      const updated = await this.api('/api/cart', {
        method: 'PUT',
        body: JSON.stringify({ productId, packSize, quantity: qty }),
      });
      this.cart = updated;
    } else {
      let raw = this.getGuestCartRaw();
      const product = this.products.find((p) => p.id === Number(productId));
      if (qty <= 0) {
        raw = raw.filter(
          (i) => !(Number(i.productId) === Number(productId) && i.packSize === packSize)
        );
      } else {
        if (product && qty > product.stock) {
          throw new Error(
            `Only ${product.stock} unit(s) of ${product.name} are available.`
          );
        }
        const item = raw.find(
          (i) => Number(i.productId) === Number(productId) && i.packSize === packSize
        );
        if (item) item.quantity = qty;
      }
      this.setGuestCartRaw(raw);
      this.computeGuestCart();
    }
    this.updateCartUI();
    this.notify();
    return this.cart;
  },

  async removeCartItem({ id, productId, packSize }) {
    if (this.user) {
      const qs = new URLSearchParams();
      if (id && typeof id === 'number') qs.set('id', String(id));
      if (productId) qs.set('productId', String(productId));
      if (packSize) qs.set('packSize', String(packSize));
      const updated = await this.api(`/api/cart?${qs.toString()}`, {
        method: 'DELETE',
      });
      this.cart = updated;
    } else {
      const raw = this.getGuestCartRaw().filter(
        (i) => !(Number(i.productId) === Number(productId) && i.packSize === packSize)
      );
      this.setGuestCartRaw(raw);
      this.computeGuestCart();
    }
    this.updateCartUI();
    this.notify();
    return this.cart;
  },

  async logout() {
    try {
      await this.api('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    this.setToken('');
    this.user = null;
    this.computeGuestCart();
    this.updateCartUI();
    this.notify();
    window.location.href = '/';
  },

  proceedToCheckout() {
    if (!this.user) {
      window.location.href = '/signin?redirect=/checkout';
    } else {
      window.location.href = '/checkout';
    }
  },

  formatMoney(amount) {
    return `$${Number(amount || 0).toFixed(2)} CAD`;
  },

  showToast({ title, message, showCartActions = false }) {
    let container = document.getElementById('hm-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'hm-toast-container';
      container.className = 'hm-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'hm-toast';
    toast.innerHTML = `
      <div class="hm-toast-title">${title}</div>
      <div class="hm-toast-msg">${message}</div>
      ${
        showCartActions
          ? `<div class="hm-toast-actions">
               <button type="button" class="hm-toast-btn" data-open-cart>View Cart (${this.cart.itemCount})</button>
               <button type="button" class="hm-toast-btn is-ghost" data-go-checkout>Checkout ↗</button>
             </div>`
          : ''
      }
    `;
    container.appendChild(toast);

    const openBtn = toast.querySelector('[data-open-cart]');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        toast.remove();
        this.openCartDrawer();
      });
    }
    const checkoutBtn = toast.querySelector('[data-go-checkout]');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        toast.remove();
        this.proceedToCheckout();
      });
    }

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 4500);
  },

  openCartDrawer() {
    const backdrop = document.getElementById('hm-cart-backdrop');
    const drawer = document.getElementById('hm-cart-drawer');
    if (backdrop && drawer) {
      backdrop.classList.add('is-open');
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
    }
  },

  closeCartDrawer() {
    const backdrop = document.getElementById('hm-cart-backdrop');
    const drawer = document.getElementById('hm-cart-drawer');
    if (backdrop && drawer) {
      backdrop.classList.remove('is-open');
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    }
  },

  renderNavAndDrawer() {
    // 1. Inject Account + Cart buttons into primary navs
    const homeNavList = document.getElementById('nav-links');
    const edNavList = document.querySelector('.ed-nav-links');
    const storyTopNav = document.querySelector('.story-top-nav');

    const authHref = this.user ? '/account' : '/signin';
    const authLabel = this.user
      ? `My Account (${this.user.name.split(' ')[0]})`
      : 'Sign In';

    const injectIntoList = (ul) => {
      if (!ul) return;
      let authLi = ul.querySelector('[data-hm-nav-auth]');
      if (!authLi) {
        authLi = document.createElement('li');
        authLi.setAttribute('data-hm-nav-auth', '1');
        ul.appendChild(authLi);
      }
      authLi.innerHTML = `<a href="${authHref}" id="hm-nav-auth-link">${authLabel}</a>`;

      let cartLi = ul.querySelector('[data-hm-nav-cart]');
      if (!cartLi) {
        cartLi = document.createElement('li');
        cartLi.setAttribute('data-hm-nav-cart', '1');
        ul.appendChild(cartLi);
      }
      cartLi.innerHTML = `
        <button type="button" class="hm-cart-trigger" data-hm-cart-open aria-label="Open shopping cart">
          <span>Cart</span>
          <span class="hm-cart-badge" data-hm-cart-count>${this.cart.itemCount}</span>
        </button>
      `;
    };

    injectIntoList(homeNavList);
    injectIntoList(edNavList);

    if (storyTopNav && !storyTopNav.querySelector('[data-hm-story-util]')) {
      storyTopNav.style.display = 'flex';
      storyTopNav.style.justifyContent = 'space-between';
      storyTopNav.style.alignItems = 'center';
      const util = document.createElement('div');
      util.className = 'hm-nav-utility';
      util.setAttribute('data-hm-story-util', '1');
      util.innerHTML = `
        <a href="/shop" class="link story-home-link">Shop</a>
        <a href="${authHref}" class="link story-home-link" data-hm-story-auth>${authLabel}</a>
        <button type="button" class="hm-cart-trigger" style="border-color:#000;color:#000" data-hm-cart-open>
          <span>Cart</span>
          <span class="hm-cart-badge" style="background:#000;color:#fff" data-hm-cart-count>${this.cart.itemCount}</span>
        </button>
      `;
      storyTopNav.appendChild(util);
    }

    // Mobile menus
    const mobileLists = document.querySelectorAll(
      '#mobile-menu ul, #ed-mobile-menu ul'
    );
    mobileLists.forEach((ul) => {
      if (!ul.querySelector('[data-hm-mob-auth]')) {
        const liAuth = document.createElement('li');
        liAuth.setAttribute('data-hm-mob-auth', '1');
        liAuth.innerHTML = `<a href="${authHref}"><span>${authLabel}</span></a>`;
        ul.appendChild(liAuth);

        const liCart = document.createElement('li');
        liCart.setAttribute('data-hm-mob-cart', '1');
        liCart.innerHTML = `<a href="/cart"><span>Cart (<strong data-hm-cart-count>${this.cart.itemCount}</strong>)</span></a>`;
        ul.appendChild(liCart);
      }
    });

    // 2. Build Slide-Out Cart Drawer once
    if (!document.getElementById('hm-cart-drawer')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'hm-cart-backdrop';
      backdrop.className = 'hm-cart-backdrop';
      backdrop.addEventListener('click', () => this.closeCartDrawer());

      const drawer = document.createElement('aside');
      drawer.id = 'hm-cart-drawer';
      drawer.className = 'hm-cart-drawer';
      drawer.setAttribute('aria-hidden', 'true');
      drawer.setAttribute('aria-label', 'Shopping Cart');
      drawer.innerHTML = `
        <div class="hm-cart-drawer-head">
          <h2 class="hm-cart-drawer-title">Your Pantry Cart</h2>
          <button type="button" class="hm-cart-close" id="hm-cart-close-btn" aria-label="Close cart">✕</button>
        </div>
        <div class="hm-cart-drawer-body" id="hm-cart-drawer-body"></div>
        <div class="hm-cart-drawer-foot" id="hm-cart-drawer-foot"></div>
      `;

      document.body.appendChild(backdrop);
      document.body.appendChild(drawer);

      document
        .getElementById('hm-cart-close-btn')
        .addEventListener('click', () => this.closeCartDrawer());
    }

    document.querySelectorAll('[data-hm-cart-open]').forEach((btn) => {
      if (!btn.dataset.boundCart) {
        btn.dataset.boundCart = '1';
        btn.addEventListener('click', () => this.openCartDrawer());
      }
    });

    this.updateCartUI();
  },

  updateCartUI() {
    const authHref = this.user ? '/account' : '/signin';
    const authLabel = this.user
      ? `My Account (${this.user.name.split(' ')[0]})`
      : 'Sign In';

    const authLink = document.getElementById('hm-nav-auth-link');
    if (authLink) {
      authLink.href = authHref;
      authLink.textContent = authLabel;
    }
    const storyAuth = document.querySelector('[data-hm-story-auth]');
    if (storyAuth) {
      storyAuth.href = authHref;
      storyAuth.textContent = authLabel;
    }

    document.querySelectorAll('[data-hm-cart-count]').forEach((el) => {
      el.textContent = String(this.cart.itemCount || 0);
    });

    const bodyEl = document.getElementById('hm-cart-drawer-body');
    const footEl = document.getElementById('hm-cart-drawer-foot');
    if (!bodyEl || !footEl) return;

    if (!this.cart.items || this.cart.items.length === 0) {
      bodyEl.innerHTML = `
        <div class="hm-cart-empty">
          <p>Your pantry cart is empty.</p>
          <span>Explore our coffee, honey, spices and ghee.</span>
          <div style="margin-top: 24px;">
            <a href="/shop" class="hm-btn-primary" style="display:inline-flex;min-width:160px;">Shop the range ↗</a>
          </div>
        </div>
      `;
      footEl.innerHTML = '';
      footEl.style.display = 'none';
      return;
    }

    footEl.style.display = 'block';
    bodyEl.innerHTML = this.cart.items
      .map(
        (item) => `
        <div class="hm-cart-item" data-cart-product="${item.productId}" data-cart-pack="${item.packSize}">
          <a href="/products/${item.slug}">
            <img class="hm-cart-item-img" src="${item.image}" alt="${item.name}" />
          </a>
          <div>
            <div class="hm-cart-item-top">
              <a href="/products/${item.slug}" class="hm-cart-item-name">${item.name}</a>
              <strong>${this.formatMoney(item.subtotal)}</strong>
            </div>
            <div class="hm-cart-item-meta">
              Pack: <strong>${item.packSize}</strong> · ${this.formatMoney(item.unitPrice)} each
            </div>
            <div class="hm-cart-item-bottom">
              <div class="hm-mini-qty">
                <button type="button" data-cart-dec="${item.productId}" data-pack="${item.packSize}" aria-label="Decrease quantity">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-inc="${item.productId}" data-pack="${item.packSize}" aria-label="Increase quantity">+</button>
              </div>
              <button type="button" class="hm-cart-remove" data-cart-rem="${item.productId}" data-pack="${item.packSize}">Remove</button>
            </div>
          </div>
        </div>
      `
      )
      .join('');

    bodyEl.querySelectorAll('[data-cart-dec]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = Number(btn.getAttribute('data-cart-dec'));
        const pack = btn.getAttribute('data-pack');
        const it = this.cart.items.find(
          (x) => x.productId === pid && x.packSize === pack
        );
        if (!it) return;
        try {
          await this.updateCartQuantity({
            productId: pid,
            packSize: pack,
            quantity: it.quantity - 1,
          });
        } catch (err) {
          this.showToast({ title: 'Cart Notice', message: err.message });
        }
      });
    });

    bodyEl.querySelectorAll('[data-cart-inc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = Number(btn.getAttribute('data-cart-inc'));
        const pack = btn.getAttribute('data-pack');
        const it = this.cart.items.find(
          (x) => x.productId === pid && x.packSize === pack
        );
        if (!it) return;
        try {
          await this.updateCartQuantity({
            productId: pid,
            packSize: pack,
            quantity: it.quantity + 1,
          });
        } catch (err) {
          this.showToast({ title: 'Stock Limit', message: err.message });
        }
      });
    });

    bodyEl.querySelectorAll('[data-cart-rem]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = Number(btn.getAttribute('data-cart-rem'));
        const pack = btn.getAttribute('data-pack');
        await this.removeCartItem({ productId: pid, packSize: pack });
      });
    });

    footEl.innerHTML = `
      <div class="hm-cart-summary-row">
        <span>Subtotal</span>
        <strong>${this.formatMoney(this.cart.subtotal)}</strong>
      </div>
      <div class="hm-cart-summary-row">
        <span>Shipping</span>
        <span>${
          this.cart.shipping === 0
            ? 'Free'
            : this.formatMoney(this.cart.shipping)
        }</span>
      </div>
      <div class="hm-cart-summary-row">
        <span>Estimated Taxes (${this.settings.tax_rate_percent || 13}%)</span>
        <span>${this.formatMoney(this.cart.taxes)}</span>
      </div>
      <div class="hm-cart-summary-row is-total">
        <span>Total</span>
        <span>${this.formatMoney(this.cart.total)}</span>
      </div>
      <div class="hm-cart-foot-btns">
        <a href="/cart" class="hm-btn-secondary">View Cart</a>
        <button type="button" class="hm-btn-primary" id="hm-drawer-checkout-btn">
          Proceed to Checkout ↗
        </button>
      </div>
    `;

    const checkoutBtn = document.getElementById('hm-drawer-checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => this.proceedToCheckout());
    }
  },

  getStockBadgeHtml(product) {
    if (product.availability !== 'available' || product.stock <= 0) {
      return `<span class="hm-stock-pill out-of-stock">Out of Stock</span>`;
    }
    if (product.stock <= (product.lowStockThreshold || 8)) {
      return `<span class="hm-stock-pill low-stock">Low Stock · ${product.stock} left</span>`;
    }
    return `<span class="hm-stock-pill in-stock">In Stock · ${product.stock} available</span>`;
  },

  enhanceStorefrontPages() {
    if (!this.products || this.products.length === 0) return;

    // 1. Enhance /shop catalog grid (#ed-catalog-grid)
    const catalogGrid = document.getElementById('ed-catalog-grid');
    if (catalogGrid) {
      const existingSlugs = new Set();

      // Update existing cards and hide archived ones
      catalogGrid.querySelectorAll('.ed-product-card').forEach((card) => {
        const idAttr = card.id || '';
        const slug = idAttr.startsWith('card-')
          ? idAttr.slice('card-'.length)
          : (card.getAttribute('href') || '').split('/').pop();
        const product = this.products.find((p) => p.slug === slug);
        if (!product) {
          card.style.display = 'none';
          return;
        }
        existingSlugs.add(product.slug);

        const img = card.querySelector('img');
        if (img) {
          img.src = product.image;
          img.alt = product.imageAlt || product.name;
        }
        const titleSpan = card.querySelector('.ed-card-title .line > span');
        if (titleSpan) titleSpan.textContent = product.name;
        else {
          const titleEl = card.querySelector('.ed-card-title');
          if (titleEl) titleEl.textContent = product.name;
        }
        const descEl = card.querySelector('.ed-card-desc');
        if (descEl) {
          descEl.textContent =
            product.kitchenCopy || product.description || product.cardSummary;
        }

        const bodyEl = card.querySelector('.ed-card-body');
        if (bodyEl && !bodyEl.querySelector('.ed-card-price-row')) {
          const priceRow = document.createElement('div');
          priceRow.className = 'ed-card-price-row';
          const ctaEl = bodyEl.querySelector('.ed-card-cta');
          bodyEl.insertBefore(priceRow, ctaEl);
        }
        const priceRow = card.querySelector('.ed-card-price-row');
        if (priceRow) {
          priceRow.innerHTML = `
            <span>${this.formatMoney(product.price)}</span>
            ${this.getStockBadgeHtml(product)}
          `;
        }
      });

      // Append any newly added products from Admin Portal
      for (const product of this.products) {
        if (existingSlugs.has(product.slug)) continue;
        const card = document.createElement('a');
        card.href = `/product?product=${encodeURIComponent(product.slug)}`;
        card.className = 'ed-product-card';
        card.id = `card-${product.slug}`;
        card.innerHTML = `
          <div class="ed-card-media" style="clip-path:none;">
            <img src="${product.image}" alt="${product.imageAlt || product.name}" width="1024" height="1024" style="transform:none;" />
          </div>
          <div class="ed-card-body">
            <div class="ed-card-meta">
              <span>${product.number} / ${product.category.toUpperCase()}</span>
              <span class="ed-card-recipe-tag">${product.recipeHeading || product.category}</span>
            </div>
            <h2 class="ed-card-title"><span>${product.name}</span></h2>
            <p class="ed-card-desc">${product.kitchenCopy || product.description || product.cardSummary}</p>
            <div class="ed-card-price-row">
              <span>${this.formatMoney(product.price)}</span>
              ${this.getStockBadgeHtml(product)}
            </div>
            <span class="ed-card-cta">View product <span class="arrow" aria-hidden="true">↗</span></span>
          </div>
        `;
        catalogGrid.appendChild(card);
      }
    }

    // 2. Enhance Product Detail Page (.product-detail-page)
    if (document.body.classList.contains('product-detail-page')) {
      const params = new URLSearchParams(window.location.search);
      const pathParts = window.location.pathname
        .replace(/\/index\.html$/i, '')
        .replace(/\/+$/, '')
        .split('/')
        .filter(Boolean);
      const lastPart = (pathParts[pathParts.length - 1] || '').replace(
        /\.html$/i,
        ''
      );
      const slug =
        params.get('product') ||
        (lastPart && lastPart !== 'product' ? lastPart : 'pure-coffee');

      const product =
        this.products.find((p) => p.slug === slug) || this.products[0];
      if (!product) return;

      document.title = `${product.name} — Happy Monk Pantry`;
      const imgEl = document.getElementById('pd-image');
      if (imgEl) {
        imgEl.src = product.image;
        imgEl.alt = product.imageAlt || product.name;
      }
      const titleText = document.getElementById('pd-title-text');
      if (titleText) titleText.textContent = product.name;
      const kh = document.getElementById('pd-kitchen-heading');
      if (kh) kh.textContent = product.kitchenHeading || 'From Happy Monk’s kitchen';
      const kc = document.getElementById('pd-kitchen-copy');
      if (kc) kc.textContent = product.kitchenCopy || product.description;
      const rh = document.getElementById('pd-recipe-heading');
      if (rh) rh.textContent = product.recipeHeading || product.category;
      const rc = document.getElementById('pd-recipe-copy');
      if (rc) rc.textContent = product.recipeCopy || product.cardSummary;

      // Update specs table (Price & Pack sizes)
      const specsDl = document.querySelector('.pd-specs');
      if (specsDl) {
        specsDl.style.opacity = '1';
        specsDl.innerHTML = `
          <div class="pd-spec-row">
            <dt>Price (CAD)</dt>
            <dd><strong>${this.formatMoney(product.price)}</strong></dd>
          </div>
          <div class="pd-spec-row">
            <dt>Pack sizes</dt>
            <dd>${(product.packSizes || ['Standard']).join(' · ')}</dd>
          </div>
          <div class="pd-spec-row">
            <dt>Availability</dt>
            <dd>${this.getStockBadgeHtml(product)}</dd>
          </div>
        `;
      }

      // Update Proof card fields
      const proofRows = document.querySelectorAll('#pd-proof-card .pd-proof-row');
      if (proofRows.length >= 4) {
        proofRows[0].querySelector('dd').textContent =
          product.supplier || '[supplier]';
        proofRows[1].querySelector('dd').textContent =
          product.certificateType || '[certificate type]';
        proofRows[2].querySelector('dd').textContent =
          product.issuingBody || '[issuing body]';
        proofRows[3].querySelector('dd').textContent =
          product.certificateNumber || '[number]';
      }

      // Inject Interactive Add-to-Cart Purchase Box
      const infoCol = document.querySelector('.pd-info-col');
      if (infoCol && !document.getElementById('hm-pdp-purchase-box')) {
        const box = document.createElement('div');
        box.id = 'hm-pdp-purchase-box';
        box.className = 'hm-pdp-purchase-box';

        const packs =
          Array.isArray(product.packSizes) && product.packSizes.length > 0
            ? product.packSizes
            : ['Standard'];
        let selectedPack = packs[0];
        const isAvailable =
          product.availability === 'available' && product.stock > 0;

        box.innerHTML = `
          <div class="hm-pdp-price-bar">
            <div>
              <span class="hm-pdp-price" id="hm-pdp-price-val">$${Number(product.price).toFixed(2)}</span>
              <span class="hm-pdp-price-currency">CAD</span>
            </div>
            <div id="hm-pdp-stock-badge">${this.getStockBadgeHtml(product)}</div>
          </div>

          <div>
            <span class="hm-pdp-field-label">Select Pack Size</span>
            <div class="hm-pack-options" id="hm-pdp-pack-options">
              ${packs
                .map(
                  (ps, i) => `
                  <button type="button" class="hm-pack-btn ${
                    i === 0 ? 'is-selected' : ''
                  }" data-pack-choice="${ps}">${ps}</button>
                `
                )
                .join('')}
            </div>
          </div>

          <div>
            <span class="hm-pdp-field-label">Quantity</span>
            <div class="hm-pdp-actions-row">
              <div class="hm-qty-control">
                <button type="button" class="hm-qty-btn" id="hm-pdp-qty-dec" aria-label="Decrease quantity" ${
                  !isAvailable ? 'disabled' : ''
                }>−</button>
                <input type="number" class="hm-qty-input" id="hm-pdp-qty-input" value="1" min="1" max="${Math.max(
                  1,
                  product.stock
                )}" ${!isAvailable ? 'disabled' : ''} />
                <button type="button" class="hm-qty-btn" id="hm-pdp-qty-inc" aria-label="Increase quantity" ${
                  !isAvailable ? 'disabled' : ''
                }>+</button>
              </div>

              <button type="button" class="hm-btn-primary" id="hm-pdp-add-btn" ${
                !isAvailable ? 'disabled' : ''
              }>
                ${isAvailable ? 'Add to Cart' : 'Out of Stock'}
              </button>

              ${
                isAvailable
                  ? `<button type="button" class="hm-btn-secondary" id="hm-pdp-buy-now-btn">Buy Now ↗</button>`
                  : ''
              }
            </div>
          </div>
        `;

        if (specsDl && specsDl.nextSibling) {
          infoCol.insertBefore(box, specsDl.nextSibling);
        } else {
          infoCol.appendChild(box);
        }

        // Bind pack size buttons
        box.querySelectorAll('[data-pack-choice]').forEach((btn) => {
          btn.addEventListener('click', () => {
            box
              .querySelectorAll('[data-pack-choice]')
              .forEach((b) => b.classList.remove('is-selected'));
            btn.classList.add('is-selected');
            selectedPack = btn.getAttribute('data-pack-choice');
          });
        });

        const qtyInput = document.getElementById('hm-pdp-qty-input');
        const decBtn = document.getElementById('hm-pdp-qty-dec');
        const incBtn = document.getElementById('hm-pdp-qty-inc');
        const addBtn = document.getElementById('hm-pdp-add-btn');
        const buyNowBtn = document.getElementById('hm-pdp-buy-now-btn');

        if (decBtn && qtyInput) {
          decBtn.addEventListener('click', () => {
            const cur = parseInt(qtyInput.value, 10) || 1;
            qtyInput.value = String(Math.max(1, cur - 1));
          });
        }
        if (incBtn && qtyInput) {
          incBtn.addEventListener('click', () => {
            const cur = parseInt(qtyInput.value, 10) || 1;
            qtyInput.value = String(Math.min(product.stock, cur + 1));
          });
        }
        if (addBtn) {
          addBtn.addEventListener('click', async () => {
            const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
            addBtn.disabled = true;
            const prevText = addBtn.textContent;
            addBtn.textContent = 'Adding...';
            try {
              await this.addToCart({
                productId: product.id,
                slug: product.slug,
                packSize: selectedPack,
                quantity: qty,
              });
              addBtn.textContent = 'Added ✓';
              setTimeout(() => {
                addBtn.textContent = prevText;
                addBtn.disabled = false;
              }, 900);
            } catch (err) {
              this.showToast({ title: 'Cannot Add to Cart', message: err.message });
              addBtn.textContent = prevText;
              addBtn.disabled = false;
            }
          });
        }
        if (buyNowBtn) {
          buyNowBtn.addEventListener('click', async () => {
            const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
            buyNowBtn.disabled = true;
            try {
              await this.addToCart({
                productId: product.id,
                slug: product.slug,
                packSize: selectedPack,
                quantity: qty,
              });
              this.proceedToCheckout();
            } catch (err) {
              this.showToast({ title: 'Cannot Proceed', message: err.message });
              buyNowBtn.disabled = false;
            }
          });
        }
      }
    }
  },
};

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => HM.init());
} else {
  HM.init();
}
