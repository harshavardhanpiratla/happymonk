/* ==========================================================================
   HAPPY MONK — CUSTOMER PORTAL CONTROLLER
   Powers: /signin, /signup, /account, /cart, /checkout, /order-success, /track-order
   ========================================================================== */

import { HM } from './storefront.js';

const ORDER_STAGES = [
  'Order Placed',
  'Order Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
];

export function statusBadgeHtml(status) {
  const s = String(status || '').toLowerCase();
  let cls = 'status-pending';
  if (s.includes('placed')) cls = 'status-placed';
  else if (s.includes('confirmed')) cls = 'status-confirmed';
  else if (s.includes('processing')) cls = 'status-processing';
  else if (s.includes('out for delivery')) cls = 'status-out-for-delivery';
  else if (s.includes('shipped')) cls = 'status-shipped';
  else if (s.includes('delivered') || s === 'paid') cls = 'status-delivered';
  else if (s.includes('cancelled')) cls = 'status-cancelled';
  else if (s.includes('refunded') || s === 'failed') cls = 'status-refunded';
  return `<span class="hm-status-badge ${cls}">${status}</span>`;
}

export function formatDate(iso) {
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

function bindPasswordToggles(root = document) {
  root.querySelectorAll('[data-pw-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-pw-toggle');
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  });
}

/* ==========================================================================
   1. SIGN IN PAGE (/signin)
   ========================================================================== */
function initSignInPage() {
  const form = document.getElementById('hm-signin-form');
  if (!form) return;

  bindPasswordToggles();
  const params = new URLSearchParams(window.location.search);
  const redirectUrl = params.get('redirect') || '/account';

  const signupLink = document.getElementById('hm-goto-signup');
  if (signupLink && params.get('redirect')) {
    signupLink.href = `/signup?redirect=${encodeURIComponent(redirectUrl)}`;
  }

  // If already logged in, redirect
  HM.onChange(() => {
    if (HM.user) {
      window.location.href = redirectUrl;
    }
  });

  const alertBox = document.getElementById('hm-signin-alert');
  const showErr = (msg, isSuccess = false) => {
    alertBox.style.display = 'block';
    alertBox.className = `hm-alert ${isSuccess ? 'is-success' : 'is-error'}`;
    alertBox.textContent = msg;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.style.display = 'none';
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    const rememberMe = document.getElementById('signin-remember').checked;
    const submitBtn = document.getElementById('signin-submit-btn');

    if (!email || !password) {
      return showErr('Please enter your email address and password.');
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';
    try {
      const guestCart = HM.getGuestCartRaw();
      const res = await HM.api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, rememberMe, guestCart }),
      });
      HM.setToken(res.token);
      HM.clearGuestCart();
      HM.user = res.user;
      HM.cart = res.cart;
      window.location.href = redirectUrl;
    } catch (err) {
      showErr(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });

  // Forgot password toggle
  const forgotToggle = document.getElementById('hm-forgot-toggle');
  const forgotBox = document.getElementById('hm-forgot-box');
  const forgotForm = document.getElementById('hm-forgot-form');
  if (forgotToggle && forgotBox) {
    forgotToggle.addEventListener('click', (e) => {
      e.preventDefault();
      forgotBox.style.display =
        forgotBox.style.display === 'none' ? 'block' : 'none';
    });
  }
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('fp-email').value.trim();
      const phone = document.getElementById('fp-phone').value.trim();
      const newPassword = document.getElementById('fp-new-pw').value;
      const confirmPassword = document.getElementById('fp-confirm-pw').value;
      try {
        const res = await HM.api('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email, phone, newPassword, confirmPassword }),
        });
        showErr(res.message, true);
        forgotBox.style.display = 'none';
      } catch (err) {
        showErr(err.message);
      }
    });
  }
}

/* ==========================================================================
   2. SIGN UP PAGE (/signup)
   ========================================================================== */
function initSignUpPage() {
  const form = document.getElementById('hm-signup-form');
  if (!form) return;

  bindPasswordToggles();
  const params = new URLSearchParams(window.location.search);
  const redirectUrl = params.get('redirect') || '/account';

  const signinLink = document.getElementById('hm-goto-signin');
  if (signinLink && params.get('redirect')) {
    signinLink.href = `/signin?redirect=${encodeURIComponent(redirectUrl)}`;
  }

  const alertBox = document.getElementById('hm-signup-alert');
  const showErr = (msg) => {
    alertBox.style.display = 'block';
    alertBox.className = 'hm-alert is-error';
    alertBox.textContent = msg;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.style.display = 'none';
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm').value;
    const submitBtn = document.getElementById('signup-submit-btn');

    if (name.length < 2) {
      return showErr('Please enter your full name.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return showErr('Please enter a valid email address.');
    }
    if (!/^\d{10,15}$/.test(phone.replace(/[\s\-().+]/g, ''))) {
      return showErr('Please enter a valid 10 to 15 digit phone number.');
    }
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return showErr(
        'Password must be at least 8 characters and include uppercase, lowercase, and a number.'
      );
    }
    if (password !== confirmPassword) {
      return showErr('Passwords do not match.');
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';
    try {
      const guestCart = HM.getGuestCartRaw();
      const res = await HM.api('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          confirmPassword,
          guestCart,
        }),
      });
      HM.setToken(res.token);
      HM.clearGuestCart();
      HM.user = res.user;
      HM.cart = res.cart;
      window.location.href = redirectUrl;
    } catch (err) {
      showErr(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
}

/* ==========================================================================
   3. DEDICATED SHOPPING CART PAGE (/cart)
   ========================================================================== */
function initCartPage() {
  const root = document.getElementById('hm-cart-page-root');
  if (!root) return;

  const render = () => {
    const cart = HM.cart;
    if (!cart.items || cart.items.length === 0) {
      root.innerHTML = `
        <div class="hm-panel-card" style="text-align:center;padding:64px 24px;">
          <p class="eyebrow">YOUR PANTRY CART</p>
          <h2 class="hm-panel-title" style="margin-bottom:14px;">Your cart is empty</h2>
          <p style="color:#555;margin-bottom:28px;">Add Pure Coffee, Honey, Chilli Powder or Ghee to begin your order.</p>
          <a href="/shop" class="hm-btn-primary" style="display:inline-flex;max-width:240px;">Shop the range ↗</a>
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="hm-checkout-grid">
        <div class="hm-panel-card">
          <div class="hm-panel-head">
            <h2 class="hm-panel-title">Cart Items (${cart.itemCount})</h2>
            <a href="/shop" class="link">Continue shopping ↗</a>
          </div>
          <div>
            ${cart.items
              .map(
                (item) => `
              <div class="hm-cart-item" style="grid-template-columns: 96px 1fr; padding: 22px 0;">
                <a href="/products/${item.slug}">
                  <img class="hm-cart-item-img" style="width:96px;height:96px;" src="${item.image}" alt="${item.name}" />
                </a>
                <div>
                  <div class="hm-cart-item-top">
                    <div>
                      <a href="/products/${item.slug}" class="hm-cart-item-name" style="font-size:24px;">${item.name}</a>
                      <div class="hm-cart-item-meta" style="font-size:13.5px;">
                        Pack Size: <strong>${item.packSize}</strong> · Unit Price: <strong>${HM.formatMoney(item.unitPrice)}</strong>
                      </div>
                    </div>
                    <strong style="font-size:17px;">${HM.formatMoney(item.subtotal)}</strong>
                  </div>
                  <div class="hm-cart-item-bottom" style="margin-top:12px;">
                    <div class="hm-mini-qty">
                      <button type="button" data-page-dec="${item.productId}" data-pack="${item.packSize}">−</button>
                      <span>${item.quantity}</span>
                      <button type="button" data-page-inc="${item.productId}" data-pack="${item.packSize}">+</button>
                    </div>
                    <button type="button" class="hm-cart-remove" data-page-rem="${item.productId}" data-pack="${item.packSize}">Remove item</button>
                  </div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="hm-panel-card">
          <div class="hm-panel-head">
            <h2 class="hm-panel-title">Order Summary</h2>
          </div>
          <div class="hm-cart-summary-row">
            <span>Subtotal (${cart.itemCount} items)</span>
            <strong>${HM.formatMoney(cart.subtotal)}</strong>
          </div>
          <div class="hm-cart-summary-row">
            <span>Shipping Charge</span>
            <span>${cart.shipping === 0 ? 'Free' : HM.formatMoney(cart.shipping)}</span>
          </div>
          <div class="hm-cart-summary-row">
            <span>Applicable Taxes (${HM.settings.tax_rate_percent || 13}%)</span>
            <span>${HM.formatMoney(cart.taxes)}</span>
          </div>
          <div class="hm-cart-summary-row is-total">
            <span>Total Amount</span>
            <span>${HM.formatMoney(cart.total)}</span>
          </div>
          <p style="font-size:12.5px;color:#555;margin-bottom:18px;">
            ${
              cart.shipping === 0
                ? '✓ Your order qualifies for Free Canadian Shipping.'
                : `Add ${HM.formatMoney(
                    Math.max(0, (HM.settings.free_shipping_threshold || 75) - cart.subtotal)
                  )} more for Free Shipping.`
            }
          </p>
          <button type="button" class="hm-btn-primary" id="hm-cart-page-checkout" style="width:100%;">
            Proceed to Checkout ↗
          </button>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-page-dec]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = Number(btn.getAttribute('data-page-dec'));
        const pack = btn.getAttribute('data-pack');
        const it = HM.cart.items.find(
          (x) => x.productId === pid && x.packSize === pack
        );
        if (it) {
          try {
            await HM.updateCartQuantity({
              productId: pid,
              packSize: pack,
              quantity: it.quantity - 1,
            });
          } catch (e) {
            HM.showToast({ title: 'Notice', message: e.message });
          }
        }
      });
    });

    root.querySelectorAll('[data-page-inc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = Number(btn.getAttribute('data-page-inc'));
        const pack = btn.getAttribute('data-pack');
        const it = HM.cart.items.find(
          (x) => x.productId === pid && x.packSize === pack
        );
        if (it) {
          try {
            await HM.updateCartQuantity({
              productId: pid,
              packSize: pack,
              quantity: it.quantity + 1,
            });
          } catch (e) {
            HM.showToast({ title: 'Stock Limit', message: e.message });
          }
        }
      });
    });

    root.querySelectorAll('[data-page-rem]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = Number(btn.getAttribute('data-page-rem'));
        const pack = btn.getAttribute('data-pack');
        await HM.removeCartItem({ productId: pid, packSize: pack });
      });
    });

    const ckBtn = document.getElementById('hm-cart-page-checkout');
    if (ckBtn) {
      ckBtn.addEventListener('click', () => HM.proceedToCheckout());
    }
  };

  HM.onChange(render);
  render();
}

/* ==========================================================================
   4. CHECKOUT PAGE (/checkout)
   ========================================================================== */
function initCheckoutPage() {
  const root = document.getElementById('hm-checkout-root');
  if (!root) return;

  // Generate unique idempotency key for this checkout session to prevent duplicate orders
  const idempotencyKey = `ck-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let initialized = false;

  const render = () => {
    if (!HM.user) {
      window.location.href = '/signin?redirect=/checkout';
      return;
    }

    if (!HM.cart.items || HM.cart.items.length === 0) {
      root.innerHTML = `
        <div class="hm-panel-card" style="text-align:center;padding:64px 24px;">
          <h2 class="hm-panel-title" style="margin-bottom:14px;">Your cart is empty</h2>
          <p style="color:#555;margin-bottom:24px;">Add products to your cart before checking out.</p>
          <a href="/shop" class="hm-btn-primary" style="display:inline-flex;max-width:220px;">Browse Products ↗</a>
        </div>
      `;
      return;
    }

    if (initialized) return;
    initialized = true;

    const cart = HM.cart;
    const u = HM.user;

    root.innerHTML = `
      <form id="hm-checkout-form" class="hm-checkout-grid">
        <div>
          <div class="hm-panel-card">
            <div class="hm-panel-head">
              <h2 class="hm-panel-title">1. Delivery Information</h2>
              <span style="font-size:12px;color:#555;">Canadian & North American Delivery</span>
            </div>

            <div id="hm-checkout-alert" class="hm-alert is-error" style="display:none;"></div>

            <div class="hm-form-group">
              <label class="hm-label" for="ck-name">Full Name *</label>
              <input class="hm-input" id="ck-name" type="text" required value="${u.name || ''}" />
            </div>

            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label" for="ck-email">Email Address *</label>
                <input class="hm-input" id="ck-email" type="email" required value="${u.email || ''}" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label" for="ck-phone">Phone Number *</label>
                <input class="hm-input" id="ck-phone" type="tel" required value="${u.phone || ''}" placeholder="+1 (416) 555-0199" />
              </div>
            </div>

            <div class="hm-form-group">
              <label class="hm-label" for="ck-addr1">Address Line 1 *</label>
              <input class="hm-input" id="ck-addr1" type="text" required placeholder="Street address, house number" />
            </div>

            <div class="hm-form-group">
              <label class="hm-label" for="ck-addr2">Address Line 2 (Optional)</label>
              <input class="hm-input" id="ck-addr2" type="text" placeholder="Apartment, suite, unit, buzzer" />
            </div>

            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label" for="ck-city">City *</label>
                <input class="hm-input" id="ck-city" type="text" required placeholder="Toronto" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label" for="ck-province">Province / State *</label>
                <input class="hm-input" id="ck-province" type="text" required placeholder="Ontario" value="Ontario" />
              </div>
            </div>

            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label" for="ck-postal">Postal / ZIP Code *</label>
                <input class="hm-input" id="ck-postal" type="text" required placeholder="M5V 2T6" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label" for="ck-country">Country *</label>
                <input class="hm-input" id="ck-country" type="text" required value="Canada" />
              </div>
            </div>

            <div class="hm-form-group" style="margin-bottom:0;">
              <label class="hm-label" for="ck-notes">Delivery Notes (Optional)</label>
              <textarea class="hm-textarea" id="ck-notes" placeholder="Leave at front porch or concierge desk"></textarea>
            </div>
          </div>

          <div class="hm-panel-card">
            <div class="hm-panel-head">
              <h2 class="hm-panel-title">2. Payment Method</h2>
            </div>

            <label class="hm-payment-option is-selected" data-pay-label>
              <input type="radio" name="paymentMethod" value="Cash on Delivery" checked />
              <div>
                <strong>Cash on Delivery (COD)</strong>
                <p style="font-size:13.5px;color:#555;margin-top:4px;">
                  Pay in cash or debit upon doorstep delivery. Payment status will be recorded as Pending until delivery is completed.
                </p>
              </div>
            </label>

            <label class="hm-payment-option" data-pay-label>
              <input type="radio" name="paymentMethod" value="Interac e-Transfer" />
              <div>
                <strong>Interac e-Transfer (Manual Verification)</strong>
                <p style="font-size:13.5px;color:#555;margin-top:4px;">
                  ${
                    HM.settings.etransfer_instructions ||
                    'Send Interac e-Transfer to orders@happymonk.ca with your Order ID in the message.'
                  }
                </p>
              </div>
            </label>

            <label class="hm-payment-option" style="opacity:0.6;cursor:not-allowed;" title="Configure STRIPE_SECRET_KEY in environment variables to enable online card payments">
              <input type="radio" name="paymentMethod" value="Stripe" disabled />
              <div>
                <strong>Credit / Debit Card (Stripe Ready)</strong>
                <p style="font-size:13px;color:#666;margin-top:4px;">
                  ${
                    HM.settings.stripe_enabled
                      ? 'Pay securely via Stripe.'
                      : 'Stripe API key is not configured in environment. Cash on Delivery and Interac e-Transfer are active.'
                  }
                </p>
              </div>
            </label>
          </div>
        </div>

        <div>
          <div class="hm-panel-card" style="position:sticky;top:96px;">
            <div class="hm-panel-head">
              <h2 class="hm-panel-title">Order Summary</h2>
              <a href="/cart" class="link">Edit cart</a>
            </div>

            <div style="margin-bottom:20px;">
              ${cart.items
                .map(
                  (item) => `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.12);">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <img src="${item.image}" alt="${item.name}" style="width:52px;height:52px;object-fit:cover;border:1px solid #000;" />
                    <div>
                      <div style="font-family:var(--hm-serif);font-size:18px;line-height:1.1;">${item.name}</div>
                      <div style="font-size:12px;color:#555;">Pack: ${item.packSize} · Qty: ${item.quantity} × ${HM.formatMoney(item.unitPrice)}</div>
                    </div>
                  </div>
                  <strong>${HM.formatMoney(item.subtotal)}</strong>
                </div>
              `
                )
                .join('')}
            </div>

            <div class="hm-cart-summary-row">
              <span>Subtotal (${cart.itemCount} items)</span>
              <strong>${HM.formatMoney(cart.subtotal)}</strong>
            </div>
            <div class="hm-cart-summary-row">
              <span>Shipping Fee</span>
              <span>${cart.shipping === 0 ? 'Free' : HM.formatMoney(cart.shipping)}</span>
            </div>
            <div class="hm-cart-summary-row">
              <span>Applicable Taxes (${HM.settings.tax_rate_percent || 13}%)</span>
              <span>${HM.formatMoney(cart.taxes)}</span>
            </div>
            <div class="hm-cart-summary-row is-total">
              <span>Grand Total</span>
              <span>${HM.formatMoney(cart.total)}</span>
            </div>

            <button type="submit" class="hm-btn-primary" id="hm-place-order-btn" style="width:100%;height:54px;font-size:14px;">
              Place Order — ${HM.formatMoney(cart.total)}
            </button>

            <p style="font-size:12px;color:#666;text-align:center;margin-top:14px;">
              Every Happy Monk pack carries its supplier and certificate number printed on the back panel.
            </p>
          </div>
        </div>
      </form>
    `;

    root.querySelectorAll('[data-pay-label]').forEach((lbl) => {
      const radio = lbl.querySelector('input[type="radio"]');
      radio.addEventListener('change', () => {
        root
          .querySelectorAll('[data-pay-label]')
          .forEach((l) => l.classList.remove('is-selected'));
        if (radio.checked) lbl.classList.add('is-selected');
      });
    });

    const form = document.getElementById('hm-checkout-form');
    const alertBox = document.getElementById('hm-checkout-alert');
    const submitBtn = document.getElementById('hm-place-order-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.style.display = 'none';

      const delivery = {
        fullName: document.getElementById('ck-name').value.trim(),
        email: document.getElementById('ck-email').value.trim(),
        phone: document.getElementById('ck-phone').value.trim(),
        addressLine1: document.getElementById('ck-addr1').value.trim(),
        addressLine2: document.getElementById('ck-addr2').value.trim(),
        city: document.getElementById('ck-city').value.trim(),
        stateProvince: document.getElementById('ck-province').value.trim(),
        postalCode: document.getElementById('ck-postal').value.trim(),
        country: document.getElementById('ck-country').value.trim(),
      };
      const notes = document.getElementById('ck-notes').value.trim();
      const paymentRadio = form.querySelector(
        'input[name="paymentMethod"]:checked'
      );
      const paymentMethod = paymentRadio
        ? paymentRadio.value
        : 'Cash on Delivery';

      submitBtn.disabled = true;
      submitBtn.textContent = 'Placing your order...';

      try {
        const res = await HM.api('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey,
            delivery,
            paymentMethod,
            notes,
          }),
        });
        HM.cart = {
          items: [],
          itemCount: 0,
          subtotal: 0,
          shipping: 0,
          taxes: 0,
          total: 0,
        };
        HM.updateCartUI();
        window.location.href = `/order-success?order=${encodeURIComponent(
          res.order.orderNumber
        )}`;
      } catch (err) {
        alertBox.style.display = 'block';
        alertBox.textContent = err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = `Place Order — ${HM.formatMoney(cart.total)}`;
      }
    });
  };

  HM.onChange(render);
  if (HM.user) render();
}

/* ==========================================================================
   5. ORDER SUCCESS PAGE (/order-success)
   ========================================================================== */
async function initOrderSuccessPage() {
  const root = document.getElementById('hm-order-success-root');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const orderNumber = params.get('order');
  if (!orderNumber) {
    window.location.href = '/account';
    return;
  }

  try {
    const res = await HM.api(`/api/orders/${encodeURIComponent(orderNumber)}`);
    const o = res.order;
    const addr = o.shippingAddress || {};

    root.innerHTML = `
      <div class="hm-panel-card" style="max-width:860px;margin:0 auto;">
        <p class="eyebrow" style="color:var(--hm-green);">ORDER CONFIRMED · THANK YOU</p>
        <h1 class="hm-panel-title" style="font-size:clamp(36px,5vw,56px);margin-bottom:12px;">
          Order #${o.orderNumber} Placed
        </h1>
        <p style="font-size:16px;color:#333;margin-bottom:28px;">
          We’ve received your order on ${formatDate(o.orderDate)} and transmitted it to Happy Monk’s kitchen & fulfillment team.
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:20px;border:1px solid #000;background:#fafafa;margin-bottom:28px;">
          <div>
            <div class="hm-label">Order Number</div>
            <strong style="font-size:18px;">#${o.orderNumber}</strong>
          </div>
          <div>
            <div class="hm-label">Order Status</div>
            ${statusBadgeHtml(o.orderStatus)}
          </div>
          <div>
            <div class="hm-label">Payment Method</div>
            <div><strong>${o.paymentMethod}</strong> (${o.paymentStatus})</div>
          </div>
          <div>
            <div class="hm-label">Grand Total</div>
            <strong style="font-size:18px;">${HM.formatMoney(o.total)}</strong>
          </div>
        </div>

        <div class="hm-form-row-2" style="margin-bottom:28px;">
          <div style="border:1px solid #e0e0e0;padding:18px;">
            <div class="hm-label">Delivery Address</div>
            <div><strong>${addr.fullName || o.customerName}</strong></div>
            <div>${addr.addressLine1 || ''} ${addr.addressLine2 || ''}</div>
            <div>${addr.city || ''}, ${addr.stateProvince || ''} ${addr.postalCode || ''}</div>
            <div>${addr.country || 'Canada'}</div>
            <div style="margin-top:6px;font-size:13px;color:#555;">Phone: ${addr.phone || o.customerPhone}</div>
          </div>
          <div style="border:1px solid #e0e0e0;padding:18px;">
            <div class="hm-label">Order Totals</div>
            <div class="hm-cart-summary-row"><span>Subtotal</span><span>${HM.formatMoney(o.subtotal)}</span></div>
            <div class="hm-cart-summary-row"><span>Shipping</span><span>${o.shipping === 0 ? 'Free' : HM.formatMoney(o.shipping)}</span></div>
            <div class="hm-cart-summary-row"><span>Taxes</span><span>${HM.formatMoney(o.taxes)}</span></div>
            <div class="hm-cart-summary-row is-total" style="margin-bottom:0;"><span>Total</span><span>${HM.formatMoney(o.total)}</span></div>
          </div>
        </div>

        <h3 style="font-family:var(--hm-serif);font-size:24px;margin-bottom:14px;">Items Ordered</h3>
        <div style="border-top:1px solid #000;margin-bottom:32px;">
          ${o.items
            .map(
              (it) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #e4e4e7;">
              <div style="display:flex;align-items:center;gap:14px;">
                <img src="${it.image}" alt="${it.name}" style="width:56px;height:56px;object-fit:cover;border:1px solid #000;" />
                <div>
                  <strong style="font-size:16px;">${it.name}</strong>
                  <div style="font-size:13px;color:#555;">Pack: ${it.packSize} · Qty: ${it.quantity} × ${HM.formatMoney(it.unitPrice)}</div>
                </div>
              </div>
              <strong>${HM.formatMoney(it.subtotal)}</strong>
            </div>
          `
            )
            .join('')}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:14px;">
          <a href="/track-order?order=${encodeURIComponent(o.orderNumber)}" class="hm-btn-primary">
            Track Order Live ↗
          </a>
          <a href="/account?tab=orders" class="hm-btn-secondary">
            View My Orders
          </a>
          <a href="/shop" class="hm-btn-secondary">
            Continue Shopping
          </a>
        </div>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `
      <div class="hm-panel-card">
        <div class="hm-alert is-error">${err.message}</div>
        <a href="/account" class="hm-btn-primary">Go to My Account</a>
      </div>
    `;
  }
}

/* ==========================================================================
   6. ORDER TRACKING RENDERER & PAGE (/track-order & Account Tracking Tab)
   ========================================================================== */
export function renderOrderTrackingCard(order, cancellableStatuses = ['Order Placed', 'Order Confirmed'], onCancelSuccess = null) {
  const currentIdx = ORDER_STAGES.indexOf(order.orderStatus);
  const isCancelled = order.orderStatus === 'Cancelled';
  const isRefunded = order.orderStatus === 'Refunded';
  const canCancel = cancellableStatuses.includes(order.orderStatus);

  const stagesHtml = ORDER_STAGES.map((stage, idx) => {
    let stateClass = '';
    if (!isCancelled && !isRefunded) {
      if (idx < currentIdx || order.orderStatus === 'Delivered') {
        stateClass = 'is-completed';
      } else if (idx === currentIdx) {
        stateClass = 'is-current';
      }
    }
    return `
      <div class="hm-tracker-step ${stateClass}">
        <span class="hm-tracker-step-num">0${idx + 1}</span>
        <span class="hm-tracker-step-label">${stage}</span>
      </div>
    `;
  }).join('');

  const addr = order.shippingAddress || {};

  return `
    <div class="hm-panel-card" data-tracking-order="${order.orderNumber}">
      <div class="hm-panel-head">
        <div>
          <p class="eyebrow" style="margin-bottom:6px;">LIVE ORDER TRACKING · #${order.orderNumber}</p>
          <h2 class="hm-panel-title">Order #${order.orderNumber}</h2>
          <p style="font-size:13.5px;color:#555;margin-top:6px;">Placed on ${formatDate(order.orderDate)} · Total: <strong>${HM.formatMoney(order.total)}</strong></p>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <div>Current Status: ${statusBadgeHtml(order.orderStatus)}</div>
          <div style="font-size:12.5px;color:#555;">Payment: <strong>${order.paymentMethod}</strong> (${order.paymentStatus})</div>
        </div>
      </div>

      ${
        isCancelled || isRefunded
          ? `<div class="hm-alert is-error" style="margin-bottom:24px;">
               This order has been marked as <strong>${order.orderStatus}</strong>.
             </div>`
          : `<div class="hm-tracker-stages">${stagesHtml}</div>`
      }

      <div class="hm-form-row-2" style="margin-bottom:28px;">
        <div style="border:1px solid #000;padding:20px;">
          <div class="hm-label">Products in This Shipment</div>
          ${order.items
            .map(
              (it) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee;">
              <div style="display:flex;align-items:center;gap:12px;">
                <img src="${it.image}" alt="${it.name}" style="width:46px;height:46px;object-fit:cover;border:1px solid #000;" />
                <div>
                  <strong>${it.name}</strong>
                  <div style="font-size:12px;color:#555;">Pack: ${it.packSize} · Qty: ${it.quantity} × ${HM.formatMoney(it.unitPrice)}</div>
                </div>
              </div>
              <strong>${HM.formatMoney(it.subtotal)}</strong>
            </div>
          `
            )
            .join('')}
          <div style="display:flex;justify-content:space-between;padding-top:12px;font-weight:700;">
            <span>Total Paid / Due</span>
            <span>${HM.formatMoney(order.total)}</span>
          </div>
        </div>

        <div style="border:1px solid #000;padding:20px;">
          <div class="hm-label">Shipping Destination</div>
          <div style="margin-bottom:16px;">
            <div><strong>${addr.fullName || order.customerName}</strong></div>
            <div>${addr.addressLine1 || ''} ${addr.addressLine2 || ''}</div>
            <div>${addr.city || ''}, ${addr.stateProvince || ''} ${addr.postalCode || ''}</div>
            <div>${addr.country || 'Canada'}</div>
            <div style="font-size:13px;color:#555;margin-top:4px;">${addr.phone || order.customerPhone} · ${addr.email || order.customerEmail}</div>
          </div>

          <div class="hm-label">Status History Timeline</div>
          <div style="display:flex;flex-direction:column;gap:8px;max-height:180px;overflow-y:auto;">
            ${(order.statusHistory || [])
              .map(
                (h) => `
              <div style="font-size:12.5px;padding:8px 10px;background:#f8f8f8;border-left:3px solid #000;">
                <div><strong>${h.newStatus}</strong> <span style="color:#666;">(${formatDate(h.updatedAt)})</span></div>
                ${h.note ? `<div style="color:#555;">${h.note}</div>` : ''}
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <span style="font-size:12px;color:#555;">
          <span class="hm-live-dot"></span> Automatically syncs when Happy Monk updates your order status
        </span>
        ${
          canCancel
            ? `<button type="button" class="hm-btn-secondary" style="border-color:var(--hm-red);color:var(--hm-red);height:42px;" data-cancel-order="${order.orderNumber}">
                 Cancel Order
               </button>`
            : ''
        }
      </div>
    </div>
  `;
}

function initTrackOrderPage() {
  const root = document.getElementById('hm-track-order-root');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  let currentOrderNum = (params.get('order') || '').trim().toUpperCase();

  const loadOrder = async () => {
    if (!HM.user) {
      window.location.href = `/signin?redirect=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
      return;
    }

    try {
      if (!currentOrderNum) {
        const listRes = await HM.api('/api/orders');
        if (!listRes.orders || listRes.orders.length === 0) {
          root.innerHTML = `
            <div class="hm-panel-card" style="text-align:center;padding:56px 24px;">
              <h2 class="hm-panel-title" style="margin-bottom:12px;">No Orders to Track Yet</h2>
              <p style="color:#555;margin-bottom:24px;">Once you place an order, you can track every stage of its journey here.</p>
              <a href="/shop" class="hm-btn-primary" style="display:inline-flex;max-width:220px;">Shop the range ↗</a>
            </div>
          `;
          return;
        }
        currentOrderNum = listRes.orders[0].orderNumber;
      }

      const res = await HM.api(
        `/api/orders/${encodeURIComponent(currentOrderNum)}`
      );
      const cancellable =
        (res.settings && res.settings.cancellable_statuses) || [
          'Order Placed',
          'Order Confirmed',
        ];
      root.innerHTML = renderOrderTrackingCard(res.order, cancellable);

      const cancelBtn = root.querySelector('[data-cancel-order]');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          if (
            !window.confirm(
              `Are you sure you want to cancel Order #${currentOrderNum}?`
            )
          )
            return;
          cancelBtn.disabled = true;
          try {
            await HM.api(
              `/api/orders/${encodeURIComponent(currentOrderNum)}/cancel`,
              {
                method: 'POST',
                body: JSON.stringify({ reason: 'Cancelled by customer' }),
              }
            );
            HM.showToast({
              title: 'Order Cancelled',
              message: `Order #${currentOrderNum} has been cancelled.`,
            });
            await loadOrder();
          } catch (err) {
            HM.showToast({ title: 'Cannot Cancel', message: err.message });
            cancelBtn.disabled = false;
          }
        });
      }
    } catch (err) {
      root.innerHTML = `
        <div class="hm-panel-card">
          <div class="hm-alert is-error">${err.message}</div>
          <a href="/account?tab=orders" class="hm-btn-secondary">Back to My Orders</a>
        </div>
      `;
    }
  };

  HM.onChange(() => {
    if (HM.user) loadOrder();
  });

  // Auto-refresh every 4 seconds + listen to SSE so admin status changes reflect live
  setInterval(() => {
    if (HM.user && currentOrderNum) loadOrder();
  }, 4000);

  try {
    const es = new EventSource('/api/events?role=customer');
    es.addEventListener('order_updated', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (
          !currentOrderNum ||
          data.orderNumber.toUpperCase() === currentOrderNum.toUpperCase()
        ) {
          loadOrder();
        }
      } catch (_) {}
    });
  } catch (_) {}
}

/* ==========================================================================
   7. CUSTOMER ACCOUNT DASHBOARD (/account)
   ========================================================================== */
function initAccountDashboardPage() {
  const root = document.getElementById('hm-account-root');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  let activeTab = params.get('tab') || 'profile';
  let trackingOrderNum = params.get('order') || '';
  let ordersCache = [];

  const fetchOrders = async () => {
    const res = await HM.api('/api/orders');
    ordersCache = res.orders || [];
    if (!trackingOrderNum && ordersCache.length > 0) {
      trackingOrderNum = ordersCache[0].orderNumber;
    }
    return ordersCache;
  };

  const renderDashboard = async () => {
    if (!HM.user) {
      window.location.href = '/signin?redirect=/account';
      return;
    }

    await fetchOrders().catch(() => {});
    const u = HM.user;

    root.innerHTML = `
      <div class="hm-account-layout">
        <aside class="hm-account-nav">
          <div class="hm-account-user-box">
            <div class="hm-account-user-name">${u.name}</div>
            <div class="hm-account-user-email">${u.email}</div>
          </div>
          <div class="hm-account-tabs">
            <button type="button" class="hm-account-tab-btn ${
              activeTab === 'profile' ? 'is-active' : ''
            }" data-acc-tab="profile">
              <span>My Account</span>
              <span>→</span>
            </button>
            <button type="button" class="hm-account-tab-btn ${
              activeTab === 'orders' ? 'is-active' : ''
            }" data-acc-tab="orders">
              <span>My Orders</span>
              <span>(${ordersCache.length})</span>
            </button>
            <button type="button" class="hm-account-tab-btn ${
              activeTab === 'tracking' ? 'is-active' : ''
            }" data-acc-tab="tracking">
              <span>Order Tracking</span>
              <span>→</span>
            </button>
            <button type="button" class="hm-account-tab-btn ${
              activeTab === 'cart' ? 'is-active' : ''
            }" data-acc-tab="cart">
              <span>My Cart</span>
              <span>(${HM.cart.itemCount})</span>
            </button>
            <button type="button" class="hm-account-tab-btn" id="hm-account-logout-btn" style="color:var(--hm-red);">
              <span>Sign Out</span>
              <span>↗</span>
            </button>
          </div>
        </aside>

        <section id="hm-account-main-panel"></section>
      </div>
    `;

    root.querySelectorAll('[data-acc-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-acc-tab');
        const url = new URL(window.location.href);
        url.searchParams.set('tab', activeTab);
        window.history.replaceState(null, '', url.toString());
        renderDashboard();
      });
    });

    document
      .getElementById('hm-account-logout-btn')
      .addEventListener('click', () => HM.logout());

    const panel = document.getElementById('hm-account-main-panel');

    if (activeTab === 'profile') {
      panel.innerHTML = `
        <div class="hm-panel-card">
          <div class="hm-panel-head">
            <div>
              <p class="eyebrow" style="margin-bottom:6px;">CUSTOMER PROFILE</p>
              <h2 class="hm-panel-title">My Account</h2>
            </div>
            <span style="font-size:12.5px;color:#555;">Member since ${formatDate(u.createdAt)}</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:18px;background:#fafafa;border:1px solid #000;margin-bottom:28px;">
            <div>
              <div class="hm-label">Customer Name</div>
              <strong>${u.name}</strong>
            </div>
            <div>
              <div class="hm-label">Email Address</div>
              <strong>${u.email}</strong>
            </div>
            <div>
              <div class="hm-label">Phone Number</div>
              <strong>${u.phone || 'Not set'}</strong>
            </div>
            <div>
              <div class="hm-label">Account Created</div>
              <strong>${formatDate(u.createdAt)}</strong>
            </div>
          </div>

          <h3 style="font-family:var(--hm-serif);font-size:26px;margin-bottom:16px;">Edit Profile Information</h3>
          <div id="hm-profile-alert" style="display:none;"></div>
          <form id="hm-profile-form">
            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label" for="prof-name">Full Name</label>
                <input class="hm-input" id="prof-name" type="text" required value="${u.name}" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label" for="prof-phone">Phone Number</label>
                <input class="hm-input" id="prof-phone" type="tel" required value="${u.phone || ''}" />
              </div>
            </div>
            <div class="hm-form-row-2">
              <div class="hm-form-group">
                <label class="hm-label" for="prof-email">Email Address</label>
                <input class="hm-input" id="prof-email" type="email" required value="${u.email}" />
              </div>
              <div class="hm-form-group">
                <label class="hm-label" for="prof-pw">New Password (leave blank to keep current)</label>
                <input class="hm-input" id="prof-pw" type="password" placeholder="••••••••" />
              </div>
            </div>
            <button type="submit" class="hm-btn-primary" style="max-width:240px;">Save Profile Changes</button>
          </form>
        </div>
      `;

      const pForm = document.getElementById('hm-profile-form');
      const pAlert = document.getElementById('hm-profile-alert');
      pForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        pAlert.style.display = 'none';
        try {
          const res = await HM.api('/api/account/profile', {
            method: 'PUT',
            body: JSON.stringify({
              name: document.getElementById('prof-name').value.trim(),
              phone: document.getElementById('prof-phone').value.trim(),
              email: document.getElementById('prof-email').value.trim(),
              newPassword: document.getElementById('prof-pw').value || undefined,
            }),
          });
          HM.user = res.user;
          HM.updateCartUI();
          pAlert.style.display = 'block';
          pAlert.className = 'hm-alert is-success';
          pAlert.textContent = 'Your profile has been updated.';
        } catch (err) {
          pAlert.style.display = 'block';
          pAlert.className = 'hm-alert is-error';
          pAlert.textContent = err.message;
        }
      });
    } else if (activeTab === 'orders') {
      if (ordersCache.length === 0) {
        panel.innerHTML = `
          <div class="hm-panel-card" style="text-align:center;padding:56px 24px;">
            <h2 class="hm-panel-title" style="margin-bottom:12px;">No Orders Placed Yet</h2>
            <p style="color:#555;margin-bottom:24px;">Your order history and tracking details will appear here once you place your first order.</p>
            <a href="/shop" class="hm-btn-primary" style="display:inline-flex;max-width:220px;">Shop the range ↗</a>
          </div>
        `;
      } else {
        panel.innerHTML = `
          <div class="hm-panel-card">
            <div class="hm-panel-head">
              <div>
                <p class="eyebrow" style="margin-bottom:6px;">PURCHASE HISTORY</p>
                <h2 class="hm-panel-title">My Orders (${ordersCache.length})</h2>
              </div>
              <a href="/shop" class="link">Place another order ↗</a>
            </div>

            <div style="display:flex;flex-direction:column;gap:20px;">
              ${ordersCache
                .map(
                  (o) => `
                <div style="border:1px solid #000;padding:22px;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;padding-bottom:14px;margin-bottom:16px;border-bottom:1px solid #e4e4e7;">
                    <div>
                      <div style="font-family:var(--hm-serif);font-size:24px;line-height:1;">Order #${o.orderNumber}</div>
                      <div style="font-size:13px;color:#555;margin-top:4px;">Placed on ${formatDate(o.orderDate)}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                      <span>Payment: ${statusBadgeHtml(o.paymentStatus)}</span>
                      <span>Status: ${statusBadgeHtml(o.orderStatus)}</span>
                    </div>
                  </div>

                  <div style="margin-bottom:16px;">
                    ${o.items
                      .map(
                        (it) => `
                      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                        <div style="display:flex;align-items:center;gap:12px;">
                          <img src="${it.image}" alt="${it.name}" style="width:44px;height:44px;object-fit:cover;border:1px solid #000;" />
                          <div>
                            <strong>${it.name}</strong> <span style="font-size:12.5px;color:#555;">(${it.packSize})</span>
                            <div style="font-size:12.5px;color:#555;">Quantity: ${it.quantity} × ${HM.formatMoney(it.unitPrice)}</div>
                          </div>
                        </div>
                        <strong>${HM.formatMoney(it.subtotal)}</strong>
                      </div>
                    `
                      )
                      .join('')}
                  </div>

                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding-top:14px;border-top:1px solid #e4e4e7;">
                    <div>
                      <span style="font-size:13px;color:#555;">Total Amount:</span>
                      <strong style="font-size:18px;margin-left:6px;">${HM.formatMoney(o.total)}</strong>
                    </div>
                    <div style="display:flex;gap:10px;">
                      <button type="button" class="hm-btn-secondary" style="height:40px;padding:0 16px;font-size:12px;" data-view-order-track="${o.orderNumber}">
                        View Order Details & Track →
                      </button>
                    </div>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        `;

        panel.querySelectorAll('[data-view-order-track]').forEach((btn) => {
          btn.addEventListener('click', () => {
            trackingOrderNum = btn.getAttribute('data-view-order-track');
            activeTab = 'tracking';
            renderDashboard();
          });
        });
      }
    } else if (activeTab === 'tracking') {
      if (ordersCache.length === 0) {
        panel.innerHTML = `
          <div class="hm-panel-card" style="text-align:center;padding:56px 24px;">
            <h2 class="hm-panel-title" style="margin-bottom:12px;">No Active Orders</h2>
            <p style="color:#555;margin-bottom:24px;">Place an order to track its real-time status here.</p>
            <a href="/shop" class="hm-btn-primary" style="display:inline-flex;max-width:220px;">Shop the range ↗</a>
          </div>
        `;
      } else {
        const selectedOrder =
          ordersCache.find((o) => o.orderNumber === trackingOrderNum) ||
          ordersCache[0];
        trackingOrderNum = selectedOrder.orderNumber;

        const selectorHtml =
          ordersCache.length > 1
            ? `<div class="hm-panel-card" style="padding:18px 24px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                 <label class="hm-label" style="margin:0;" for="hm-track-select">Select Order to Track:</label>
                 <select id="hm-track-select" class="hm-select" style="max-width:340px;">
                   ${ordersCache
                     .map(
                       (o) => `
                     <option value="${o.orderNumber}" ${
                         o.orderNumber === selectedOrder.orderNumber
                           ? 'selected'
                           : ''
                       }>
                       #${o.orderNumber} — ${formatDate(o.orderDate)} (${o.orderStatus})
                     </option>
                   `
                     )
                     .join('')}
                 </select>
               </div>`
            : '';

        panel.innerHTML =
          selectorHtml +
          renderOrderTrackingCard(
            selectedOrder,
            HM.settings.cancellable_statuses || [
              'Order Placed',
              'Order Confirmed',
            ]
          );

        const sel = document.getElementById('hm-track-select');
        if (sel) {
          sel.addEventListener('change', () => {
            trackingOrderNum = sel.value;
            renderDashboard();
          });
        }

        const cancelBtn = panel.querySelector('[data-cancel-order]');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', async () => {
            const ordNum = cancelBtn.getAttribute('data-cancel-order');
            if (
              !window.confirm(
                `Are you sure you want to cancel Order #${ordNum}?`
              )
            )
              return;
            cancelBtn.disabled = true;
            try {
              await HM.api(`/api/orders/${encodeURIComponent(ordNum)}/cancel`, {
                method: 'POST',
                body: JSON.stringify({ reason: 'Cancelled by customer' }),
              });
              HM.showToast({
                title: 'Order Cancelled',
                message: `Order #${ordNum} has been cancelled.`,
              });
              await renderDashboard();
            } catch (err) {
              HM.showToast({ title: 'Cannot Cancel', message: err.message });
              cancelBtn.disabled = false;
            }
          });
        }
      }
    } else if (activeTab === 'cart') {
      panel.innerHTML = `<div id="hm-account-cart-mount"></div>`;
      const mount = document.getElementById('hm-account-cart-mount');
      if (!HM.cart.items || HM.cart.items.length === 0) {
        mount.innerHTML = `
          <div class="hm-panel-card" style="text-align:center;padding:56px 24px;">
            <h2 class="hm-panel-title" style="margin-bottom:12px;">Your Cart is Empty</h2>
            <p style="color:#555;margin-bottom:24px;">Browse our pantry essentials to add items to your cart.</p>
            <a href="/shop" class="hm-btn-primary" style="display:inline-flex;max-width:220px;">Shop the range ↗</a>
          </div>
        `;
      } else {
        mount.innerHTML = `
          <div class="hm-panel-card">
            <div class="hm-panel-head">
              <h2 class="hm-panel-title">My Saved Cart (${HM.cart.itemCount} items)</h2>
              <a href="/checkout" class="hm-btn-primary" style="max-width:220px;height:42px;">Proceed to Checkout ↗</a>
            </div>
            ${HM.cart.items
              .map(
                (item) => `
              <div class="hm-cart-item">
                <img class="hm-cart-item-img" src="${item.image}" alt="${item.name}" />
                <div>
                  <div class="hm-cart-item-top">
                    <strong class="hm-cart-item-name">${item.name} (${item.packSize})</strong>
                    <strong>${HM.formatMoney(item.subtotal)}</strong>
                  </div>
                  <div class="hm-cart-item-meta">${item.quantity} × ${HM.formatMoney(item.unitPrice)}</div>
                  <div class="hm-cart-item-bottom">
                    <div class="hm-mini-qty">
                      <button type="button" data-acc-dec="${item.productId}" data-pack="${item.packSize}">−</button>
                      <span>${item.quantity}</span>
                      <button type="button" data-acc-inc="${item.productId}" data-pack="${item.packSize}">+</button>
                    </div>
                    <button type="button" class="hm-cart-remove" data-acc-rem="${item.productId}" data-pack="${item.packSize}">Remove</button>
                  </div>
                </div>
              </div>
            `
              )
              .join('')}
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid #000;">
              <div class="hm-cart-summary-row"><span>Subtotal</span><strong>${HM.formatMoney(HM.cart.subtotal)}</strong></div>
              <div class="hm-cart-summary-row"><span>Shipping</span><span>${HM.cart.shipping === 0 ? 'Free' : HM.formatMoney(HM.cart.shipping)}</span></div>
              <div class="hm-cart-summary-row"><span>Taxes</span><span>${HM.formatMoney(HM.cart.taxes)}</span></div>
              <div class="hm-cart-summary-row is-total"><span>Total</span><span>${HM.formatMoney(HM.cart.total)}</span></div>
            </div>
          </div>
        `;

        mount.querySelectorAll('[data-acc-dec]').forEach((b) => {
          b.addEventListener('click', async () => {
            const pid = Number(b.getAttribute('data-acc-dec'));
            const pack = b.getAttribute('data-pack');
            const it = HM.cart.items.find(
              (x) => x.productId === pid && x.packSize === pack
            );
            if (it) {
              await HM.updateCartQuantity({
                productId: pid,
                packSize: pack,
                quantity: it.quantity - 1,
              });
              renderDashboard();
            }
          });
        });
        mount.querySelectorAll('[data-acc-inc]').forEach((b) => {
          b.addEventListener('click', async () => {
            const pid = Number(b.getAttribute('data-acc-inc'));
            const pack = b.getAttribute('data-pack');
            const it = HM.cart.items.find(
              (x) => x.productId === pid && x.packSize === pack
            );
            if (it) {
              await HM.updateCartQuantity({
                productId: pid,
                packSize: pack,
                quantity: it.quantity + 1,
              });
              renderDashboard();
            }
          });
        });
        mount.querySelectorAll('[data-acc-rem]').forEach((b) => {
          b.addEventListener('click', async () => {
            const pid = Number(b.getAttribute('data-acc-rem'));
            const pack = b.getAttribute('data-pack');
            await HM.removeCartItem({ productId: pid, packSize: pack });
            renderDashboard();
          });
        });
      }
    }
  };

  let initialRendered = false;
  HM.onChange(() => {
    if (!initialRendered && HM.user) {
      initialRendered = true;
      renderDashboard();
    }
  });
  if (HM.user) {
    initialRendered = true;
    renderDashboard();
  } else {
    setTimeout(() => {
      if (!HM.user) window.location.href = '/signin?redirect=/account';
    }, 900);
  }

  // Live refresh when viewing orders or tracking
  setInterval(() => {
    if (HM.user && (activeTab === 'tracking' || activeTab === 'orders')) {
      renderDashboard();
    }
  }, 5000);
}

// Boot appropriate page controller
function bootCustomerPortal() {
  initSignInPage();
  initSignUpPage();
  initCartPage();
  initCheckoutPage();
  initOrderSuccessPage();
  initTrackOrderPage();
  initAccountDashboardPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootCustomerPortal);
} else {
  bootCustomerPortal();
}
