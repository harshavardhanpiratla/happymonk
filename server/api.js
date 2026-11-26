import { createHash, randomBytes } from 'node:crypto';
import {
  getDb,
  hashPassword,
  verifyPassword,
  withTransaction,
  getStoreSettings,
  updateStoreSettings,
  formatProductRow,
} from './db.js';

const VALID_ORDER_STATUSES = [
  'Order Placed',
  'Order Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Refunded',
];

const VALID_PAYMENT_STATUSES = ['Pending', 'Paid', 'Refunded', 'Failed'];

// Active SSE clients for real-time updates
const sseClients = new Set();

export function broadcastEvent(eventType, payload) {
  const data = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      if (eventType === 'new_order' && client.role !== 'admin') continue;
      client.res.write(data);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

function sha256(input) {
  return createHash('sha256').update(String(input)).digest('hex');
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function buildCookie(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (typeof maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  return parts.join('; ');
}

function createSession(db, user, rememberMe = false) {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const maxAge = rememberMe ? 30 * 24 * 3600 : 24 * 3600;
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, role, remember_me, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(tokenHash, user.id, user.role, rememberMe ? 1 : 0, expiresAt);

  return { rawToken, maxAge, expiresAt };
}

function getAuthenticatedUser(db, req, expectedRole = 'customer') {
  const cookies = parseCookies(req.headers.cookie || '');
  const authHeader = req.headers.authorization || '';
  let rawToken = null;

  if (expectedRole === 'admin') {
    rawToken =
      req.headers['x-admin-token'] ||
      (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null) ||
      cookies.hm_admin_session ||
      null;
  } else {
    rawToken =
      req.headers['x-customer-token'] ||
      (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null) ||
      cookies.hm_customer_session ||
      null;
  }

  if (!rawToken) return null;
  const tokenHash = sha256(rawToken);
  const row = db
    .prepare(
      `SELECT s.id as session_id, s.token_hash, s.role as session_role, s.expires_at,
              u.id, u.name, u.email, u.phone, u.role, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash);

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  if (expectedRole && row.role !== expectedRole) {
    return null;
  }
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.created_at,
    tokenHash: row.token_hash,
  };
}

function logAudit(db, admin, action, entityType, entityId, details = {}) {
  db.prepare(
    `INSERT INTO audit_logs (admin_id, admin_email, action, entity_type, entity_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    admin ? admin.id : null,
    admin ? admin.email : 'system',
    action,
    entityType,
    String(entityId),
    JSON.stringify(details)
  );
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

function validatePhone(phone) {
  const cleaned = String(phone || '').replace(/[\s\-().+]/g, '');
  return /^\d{10,15}$/.test(cleaned);
}

function validatePassword(pw) {
  const s = String(pw || '');
  if (s.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(s)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(s)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(s)) {
    return 'Password must contain at least one number.';
  }
  return null;
}

function roundCurrency(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function computeTotals(db, subtotal) {
  const settings = getStoreSettings(db);
  const sub = roundCurrency(subtotal);
  const shipping =
    sub <= 0
      ? 0
      : sub >= Number(settings.free_shipping_threshold)
      ? 0
      : roundCurrency(Number(settings.shipping_fee));
  const taxes = roundCurrency(
    (sub + shipping) * (Number(settings.tax_rate_percent) / 100)
  );
  const total = roundCurrency(sub + shipping + taxes);
  return { subtotal: sub, shipping, taxes, total, settings };
}

function getCustomerCartDetails(db, customerId) {
  const rows = db
    .prepare(
      `SELECT c.id as cart_id, c.product_id, c.pack_size, c.quantity, c.updated_at,
              p.slug, p.name, p.category, p.price, p.image, p.image_alt,
              p.pack_sizes_json, p.stock, p.availability
       FROM carts c
       JOIN products p ON p.id = c.product_id
       WHERE c.customer_id = ?
       ORDER BY c.id ASC`
    )
    .all(customerId);

  const items = rows.map((r) => {
    let packSizes = ['250g'];
    try {
      packSizes = JSON.parse(r.pack_sizes_json || '["250g"]');
    } catch (_) {}
    const unitPrice = roundCurrency(Number(r.price));
    const quantity = Number(r.quantity);
    const lineTotal = roundCurrency(unitPrice * quantity);
    return {
      id: Number(r.cart_id),
      productId: Number(r.product_id),
      slug: r.slug,
      name: r.name,
      category: r.category,
      packSize: r.pack_size || packSizes[0] || 'Standard',
      packSizes,
      unitPrice,
      quantity,
      subtotal: lineTotal,
      image: r.image,
      imageAlt: r.image_alt,
      stock: Number(r.stock),
      availability:
        Number(r.stock) <= 0 || r.availability !== 'available'
          ? 'out_of_stock'
          : 'available',
    };
  });

  const rawSubtotal = items.reduce((acc, item) => acc + item.subtotal, 0);
  const totals = computeTotals(db, rawSubtotal);
  return {
    items,
    itemCount: items.reduce((acc, item) => acc + item.quantity, 0),
    ...totals,
  };
}

function mergeGuestCartIntoCustomer(db, customerId, guestItems, mode = 'max') {
  if (!Array.isArray(guestItems) || guestItems.length === 0) return;

  for (const g of guestItems) {
    const qty = Math.max(1, parseInt(g.quantity, 10) || 1);
    let product = null;
    if (g.productId) {
      product = db
        .prepare("SELECT * FROM products WHERE id = ? AND availability != 'archived'")
        .get(Number(g.productId));
    }
    if (!product && g.slug) {
      product = db
        .prepare("SELECT * FROM products WHERE slug = ? AND availability != 'archived'")
        .get(String(g.slug));
    }
    if (!product || Number(product.stock) <= 0) continue;

    let packSizes = ['250g'];
    try {
      packSizes = JSON.parse(product.pack_sizes_json || '["250g"]');
    } catch (_) {}
    const packSize = g.packSize || packSizes[0] || 'Standard';

    const existing = db
      .prepare(
        'SELECT id, quantity FROM carts WHERE customer_id = ? AND product_id = ? AND pack_size = ?'
      )
      .get(customerId, product.id, packSize);

    const maxAllowed = Math.max(1, Number(product.stock));
    if (existing) {
      const mergedQty =
        mode === 'add'
          ? Math.min(maxAllowed, Number(existing.quantity) + qty)
          : Math.min(maxAllowed, Math.max(Number(existing.quantity), qty));
      db.prepare(
        "UPDATE carts SET quantity = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(mergedQty, existing.id);
    } else {
      const clamped = Math.min(maxAllowed, qty);
      db.prepare(
        'INSERT INTO carts (customer_id, product_id, pack_size, quantity) VALUES (?, ?, ?, ?)'
      ).run(customerId, product.id, packSize, clamped);
    }
  }
}

function hydrateOrder(db, orderRow) {
  if (!orderRow) return null;
  const items = db
    .prepare(
      `SELECT id, order_id, product_id, product_slug, product_name_snapshot,
              product_image_snapshot, pack_size_snapshot, unit_price_snapshot,
              quantity, subtotal
       FROM order_items
       WHERE order_id = ?
       ORDER BY id ASC`
    )
    .all(orderRow.id)
    .map((it) => ({
      id: Number(it.id),
      productId: Number(it.product_id),
      slug: it.product_slug,
      name: it.product_name_snapshot,
      image: it.product_image_snapshot,
      packSize: it.pack_size_snapshot,
      unitPrice: Number(it.unit_price_snapshot),
      quantity: Number(it.quantity),
      subtotal: Number(it.subtotal),
    }));

  const address = db
    .prepare('SELECT * FROM shipping_addresses WHERE order_id = ?')
    .get(orderRow.id);

  const history = db
    .prepare(
      `SELECT id, previous_status, new_status, updated_by_id, updated_by_name, note, updated_at
       FROM order_status_history
       WHERE order_id = ?
       ORDER BY id ASC`
    )
    .all(orderRow.id)
    .map((h) => ({
      id: Number(h.id),
      previousStatus: h.previous_status,
      newStatus: h.new_status,
      updatedById: h.updated_by_id ? Number(h.updated_by_id) : null,
      updatedByName: h.updated_by_name,
      note: h.note,
      updatedAt: h.updated_at,
    }));

  const customer = db
    .prepare('SELECT id, name, email, phone FROM users WHERE id = ?')
    .get(orderRow.customer_id);

  return {
    id: Number(orderRow.id),
    orderNumber: orderRow.order_number,
    customerId: Number(orderRow.customer_id),
    customerName: customer ? customer.name : address ? address.full_name : 'Customer',
    customerEmail: customer ? customer.email : address ? address.email : '',
    customerPhone: customer ? customer.phone : address ? address.phone : '',
    orderDate: orderRow.order_date,
    subtotal: Number(orderRow.subtotal),
    shipping: Number(orderRow.shipping),
    taxes: Number(orderRow.taxes),
    total: Number(orderRow.total),
    paymentMethod: orderRow.payment_method,
    paymentStatus: orderRow.payment_status,
    orderStatus: orderRow.order_status,
    notes: orderRow.notes || '',
    updatedAt: orderRow.updated_at,
    totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
    items,
    shippingAddress: address
      ? {
          fullName: address.full_name,
          email: address.email,
          phone: address.phone,
          addressLine1: address.address_line1,
          addressLine2: address.address_line2,
          city: address.city,
          stateProvince: address.state_province,
          postalCode: address.postal_code,
          country: address.country,
        }
      : null,
    statusHistory: history,
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolveBody, rejectBody) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        rejectBody(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolveBody({});
      try {
        resolveBody(JSON.parse(raw));
      } catch (e) {
        rejectBody(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', rejectBody);
  });
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

export async function handleApiRequest(req, res) {
  const db = getDb();
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  try {
    /* ==============================================================
       REAL-TIME SERVER-SENT EVENTS (/api/events)
       ============================================================== */
    if (pathname === '/api/events' && method === 'GET') {
      const roleParam = urlObj.searchParams.get('role');
      const tokenParam = urlObj.searchParams.get('token');
      if (tokenParam) {
        req.headers.authorization = `Bearer ${tokenParam}`;
      }
      const user =
        roleParam === 'admin'
          ? getAuthenticatedUser(db, req, 'admin')
          : getAuthenticatedUser(db, req, 'customer');

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, role: user ? user.role : 'guest' })}\n\n`);

      const client = {
        res,
        role: user ? user.role : 'guest',
        userId: user ? user.id : null,
      };
      sseClients.add(client);

      const keepAlive = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch (_) {
          clearInterval(keepAlive);
          sseClients.delete(client);
        }
      }, 20000);

      req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(client);
      });
      return;
    }

    /* ==============================================================
       PUBLIC PRODUCTS & STORE CONFIG (/api/products)
       ============================================================== */
    if (pathname === '/api/products' && method === 'GET') {
      const rows = db
        .prepare(
          "SELECT * FROM products WHERE availability != 'archived' ORDER BY number ASC, id ASC"
        )
        .all();
      const settings = getStoreSettings(db);
      return sendJson(res, 200, {
        products: rows.map(formatProductRow),
        settings: {
          ...settings,
          stripe_enabled: Boolean(process.env.STRIPE_SECRET_KEY),
        },
      });
    }

    if (pathname.startsWith('/api/products/') && method === 'GET') {
      const slugOrId = decodeURIComponent(pathname.slice('/api/products/'.length));
      let row = db
        .prepare("SELECT * FROM products WHERE slug = ? AND availability != 'archived'")
        .get(slugOrId);
      if (!row && /^\d+$/.test(slugOrId)) {
        row = db
          .prepare("SELECT * FROM products WHERE id = ? AND availability != 'archived'")
          .get(Number(slugOrId));
      }
      if (!row) {
        return sendJson(res, 404, { error: 'Product not found.' });
      }
      return sendJson(res, 200, {
        product: formatProductRow(row),
        settings: getStoreSettings(db),
      });
    }

    /* ==============================================================
       CUSTOMER AUTHENTICATION (/api/auth/*)
       ============================================================== */
    if (pathname === '/api/auth/signup' && method === 'POST') {
      const body = await readJsonBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const phone = String(body.phone || '').trim();
      const password = String(body.password || '');
      const confirmPassword = String(body.confirmPassword || '');

      if (name.length < 2) {
        return sendJson(res, 400, { error: 'Please enter your full name.' });
      }
      if (!validateEmail(email)) {
        return sendJson(res, 400, { error: 'Please enter a valid email address.' });
      }
      if (!validatePhone(phone)) {
        return sendJson(res, 400, {
          error: 'Please enter a valid 10 to 15 digit phone number.',
        });
      }
      const pwError = validatePassword(password);
      if (pwError) {
        return sendJson(res, 400, { error: pwError });
      }
      if (password !== confirmPassword) {
        return sendJson(res, 400, { error: 'Passwords do not match.' });
      }

      const existing = db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get(email);
      if (existing) {
        return sendJson(res, 409, {
          error: 'An account with this email address already exists.',
        });
      }

      const pwHash = hashPassword(password);
      const info = db
        .prepare(
          `INSERT INTO users (name, email, phone, password_hash, role)
           VALUES (?, ?, ?, ?, 'customer')`
        )
        .run(name, email, phone, pwHash);

      const userId = Number(info.lastInsertRowid);
      const user = db
        .prepare(
          'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?'
        )
        .get(userId);

      if (Array.isArray(body.guestCart) && body.guestCart.length > 0) {
        withTransaction(db, () => {
          mergeGuestCartIntoCustomer(db, userId, body.guestCart, 'max');
        });
      }

      const session = createSession(db, user, true);
      const cart = getCustomerCartDetails(db, userId);

      broadcastEvent('customer_registered', {
        id: userId,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
      });

      return sendJson(
        res,
        201,
        {
          user: {
            id: Number(user.id),
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            createdAt: user.created_at,
          },
          token: session.rawToken,
          cart,
        },
        {
          'Set-Cookie': buildCookie(
            'hm_customer_session',
            session.rawToken,
            session.maxAge
          ),
        }
      );
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const rememberMe = Boolean(body.rememberMe);

      if (!validateEmail(email) || !password) {
        return sendJson(res, 400, {
          error: 'Please enter your email address and password.',
        });
      }

      const user = db
        .prepare('SELECT * FROM users WHERE email = ?')
        .get(email);

      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, {
          error: 'Invalid email address or password.',
        });
      }

      if (user.role !== 'customer') {
        return sendJson(res, 403, {
          error:
            'Administrator accounts must sign in through the separate Admin Portal (/admin/login).',
        });
      }

      if (Array.isArray(body.guestCart) && body.guestCart.length > 0) {
        withTransaction(db, () => {
          mergeGuestCartIntoCustomer(db, Number(user.id), body.guestCart, 'max');
        });
      }

      const session = createSession(db, user, rememberMe);
      const cart = getCustomerCartDetails(db, Number(user.id));

      return sendJson(
        res,
        200,
        {
          user: {
            id: Number(user.id),
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            createdAt: user.created_at,
          },
          token: session.rawToken,
          cart,
        },
        {
          'Set-Cookie': buildCookie(
            'hm_customer_session',
            session.rawToken,
            session.maxAge
          ),
        }
      );
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (user && user.tokenHash) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(user.tokenHash);
      }
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': buildCookie('hm_customer_session', '', 0) }
      );
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 200, { user: null, settings: getStoreSettings(db) });
      }
      const cart = getCustomerCartDetails(db, user.id);
      return sendJson(res, 200, {
        user,
        cart,
        settings: getStoreSettings(db),
      });
    }

    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const phone = String(body.phone || '').trim();
      const newPassword = String(body.newPassword || '');
      const confirmPassword = String(body.confirmPassword || '');

      if (!validateEmail(email) || !validatePhone(phone)) {
        return sendJson(res, 400, {
          error: 'Please enter your registered email address and phone number.',
        });
      }
      const pwErr = validatePassword(newPassword);
      if (pwErr) return sendJson(res, 400, { error: pwErr });
      if (newPassword !== confirmPassword) {
        return sendJson(res, 400, { error: 'Passwords do not match.' });
      }

      const user = db
        .prepare("SELECT * FROM users WHERE email = ? AND role = 'customer'")
        .get(email);
      const cleanInputPhone = phone.replace(/\D/g, '');
      const cleanUserPhone = user ? String(user.phone || '').replace(/\D/g, '') : '';

      if (!user || !cleanUserPhone || cleanInputPhone !== cleanUserPhone) {
        return sendJson(res, 400, {
          error: 'Could not verify account with the provided email and phone number.',
        });
      }

      db.prepare(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(hashPassword(newPassword), user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

      return sendJson(res, 200, {
        ok: true,
        message: 'Your password has been updated. Please sign in with your new password.',
      });
    }

    /* ==============================================================
       CUSTOMER PROFILE (/api/account/profile)
       ============================================================== */
    if (pathname === '/api/account/profile' && method === 'PUT') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, { error: 'Please sign in to update your profile.' });
      }
      const body = await readJsonBody(req);
      const name = String(body.name || user.name).trim();
      const email = String(body.email || user.email).trim().toLowerCase();
      const phone = String(body.phone || user.phone).trim();

      if (name.length < 2) {
        return sendJson(res, 400, { error: 'Full name must be at least 2 characters.' });
      }
      if (!validateEmail(email)) {
        return sendJson(res, 400, { error: 'Please enter a valid email address.' });
      }
      if (!validatePhone(phone)) {
        return sendJson(res, 400, { error: 'Please enter a valid phone number.' });
      }

      const dup = db
        .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(email, user.id);
      if (dup) {
        return sendJson(res, 409, {
          error: 'Another account is already using that email address.',
        });
      }

      if (body.newPassword) {
        const pwErr = validatePassword(body.newPassword);
        if (pwErr) return sendJson(res, 400, { error: pwErr });
        db.prepare(
          "UPDATE users SET name = ?, email = ?, phone = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(name, email, phone, hashPassword(body.newPassword), user.id);
      } else {
        db.prepare(
          "UPDATE users SET name = ?, email = ?, phone = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(name, email, phone, user.id);
      }

      const updated = db
        .prepare(
          'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?'
        )
        .get(user.id);
      return sendJson(res, 200, {
        user: {
          id: Number(updated.id),
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          role: updated.role,
          createdAt: updated.created_at,
        },
      });
    }

    /* ==============================================================
       CUSTOMER SHOPPING CART (/api/cart)
       ============================================================== */
    if (pathname === '/api/cart' && method === 'GET') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, { error: 'Authentication required for cloud cart.' });
      }
      return sendJson(res, 200, getCustomerCartDetails(db, user.id));
    }

    if (pathname === '/api/cart/merge' && method === 'POST') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, { error: 'Authentication required.' });
      }
      const body = await readJsonBody(req);
      withTransaction(db, () => {
        mergeGuestCartIntoCustomer(
          db,
          user.id,
          body.items || [],
          body.mode === 'add' ? 'add' : 'max'
        );
      });
      return sendJson(res, 200, getCustomerCartDetails(db, user.id));
    }

    if (pathname === '/api/cart' && (method === 'POST' || method === 'PUT')) {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, { error: 'Authentication required.' });
      }
      const body = await readJsonBody(req);
      let product = null;
      if (body.productId) {
        product = db
          .prepare("SELECT * FROM products WHERE id = ? AND availability != 'archived'")
          .get(Number(body.productId));
      }
      if (!product && body.slug) {
        product = db
          .prepare("SELECT * FROM products WHERE slug = ? AND availability != 'archived'")
          .get(String(body.slug));
      }
      if (!product) {
        return sendJson(res, 404, { error: 'Product not found.' });
      }

      let packSizes = ['250g'];
      try {
        packSizes = JSON.parse(product.pack_sizes_json || '["250g"]');
      } catch (_) {}
      const packSize = String(body.packSize || packSizes[0] || 'Standard');
      const requestedQty = parseInt(body.quantity, 10);

      if (method === 'PUT' && requestedQty <= 0) {
        db.prepare(
          'DELETE FROM carts WHERE customer_id = ? AND product_id = ? AND pack_size = ?'
        ).run(user.id, product.id, packSize);
        return sendJson(res, 200, getCustomerCartDetails(db, user.id));
      }

      if (
        Number(product.stock) <= 0 ||
        product.availability === 'out_of_stock'
      ) {
        return sendJson(res, 400, {
          error: `${product.name} is currently out of stock.`,
        });
      }

      const existing = db
        .prepare(
          'SELECT id, quantity FROM carts WHERE customer_id = ? AND product_id = ? AND pack_size = ?'
        )
        .get(user.id, product.id, packSize);

      const newQty =
        method === 'POST' && body.mode !== 'set' && existing
          ? Number(existing.quantity) + Math.max(1, requestedQty || 1)
          : Math.max(1, requestedQty || 1);

      if (newQty > Number(product.stock)) {
        return sendJson(res, 400, {
          error: `Only ${product.stock} unit(s) of ${product.name} are available in stock.`,
        });
      }

      if (existing) {
        db.prepare(
          "UPDATE carts SET quantity = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(newQty, existing.id);
      } else {
        db.prepare(
          'INSERT INTO carts (customer_id, product_id, pack_size, quantity) VALUES (?, ?, ?, ?)'
        ).run(user.id, product.id, packSize, newQty);
      }

      return sendJson(res, 200, getCustomerCartDetails(db, user.id));
    }

    if (pathname === '/api/cart' && method === 'DELETE') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, { error: 'Authentication required.' });
      }
      const cartId = urlObj.searchParams.get('id');
      const productId = urlObj.searchParams.get('productId');
      const packSize = urlObj.searchParams.get('packSize');

      if (cartId) {
        db.prepare('DELETE FROM carts WHERE id = ? AND customer_id = ?').run(
          Number(cartId),
          user.id
        );
      } else if (productId && packSize) {
        db.prepare(
          'DELETE FROM carts WHERE customer_id = ? AND product_id = ? AND pack_size = ?'
        ).run(user.id, Number(productId), packSize);
      } else if (productId) {
        db.prepare(
          'DELETE FROM carts WHERE customer_id = ? AND product_id = ?'
        ).run(user.id, Number(productId));
      } else {
        db.prepare('DELETE FROM carts WHERE customer_id = ?').run(user.id);
      }
      return sendJson(res, 200, getCustomerCartDetails(db, user.id));
    }

    /* ==============================================================
       CUSTOMER ORDERS & CHECKOUT (/api/orders)
       ============================================================== */
    if (pathname === '/api/orders' && method === 'GET') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, { error: 'Please sign in to view your orders.' });
      }
      const rows = db
        .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC')
        .all(user.id);
      return sendJson(res, 200, {
        orders: rows.map((r) => hydrateOrder(db, r)),
        settings: getStoreSettings(db),
      });
    }

    if (pathname === '/api/orders' && method === 'POST') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, {
          error: 'Please sign in or create an account before placing an order.',
        });
      }

      const body = await readJsonBody(req);
      const idempotencyKey = body.idempotencyKey
        ? String(body.idempotencyKey).trim()
        : null;

      if (idempotencyKey) {
        const existingOrder = db
          .prepare(
            'SELECT * FROM orders WHERE idempotency_key = ? AND customer_id = ?'
          )
          .get(idempotencyKey, user.id);
        if (existingOrder) {
          return sendJson(res, 200, {
            order: hydrateOrder(db, existingOrder),
            duplicatePrevented: true,
          });
        }
      }

      // Validate delivery address
      const addr = body.delivery || {};
      const fullName = String(addr.fullName || user.name || '').trim();
      const email = String(addr.email || user.email || '').trim();
      const phone = String(addr.phone || user.phone || '').trim();
      const addressLine1 = String(addr.addressLine1 || '').trim();
      const addressLine2 = String(addr.addressLine2 || '').trim();
      const city = String(addr.city || '').trim();
      const stateProvince = String(addr.stateProvince || '').trim();
      const postalCode = String(addr.postalCode || '').trim();
      const country = String(addr.country || 'Canada').trim();
      const notes = String(body.notes || '').trim();

      if (
        !fullName ||
        !validateEmail(email) ||
        !validatePhone(phone) ||
        !addressLine1 ||
        !city ||
        !stateProvince ||
        !postalCode ||
        !country
      ) {
        return sendJson(res, 400, {
          error:
            'Please fill in all required delivery address fields (Full Name, Email, Phone, Address, City, Province/State, Postal Code, Country).',
        });
      }

      const paymentMethod = String(
        body.paymentMethod || 'Cash on Delivery'
      ).trim();
      if (
        paymentMethod === 'Stripe' &&
        !process.env.STRIPE_SECRET_KEY
      ) {
        return sendJson(res, 400, {
          error:
            'Stripe payment gateway is not configured on this server. Please choose Cash on Delivery or Interac e-Transfer.',
        });
      }

      // Perform atomic order creation & stock deduction
      let createdOrder = null;
      try {
        createdOrder = withTransaction(db, () => {
          // If client submitted items alongside cart, sync them first if DB cart is empty
          let cartData = getCustomerCartDetails(db, user.id);
          if (
            cartData.items.length === 0 &&
            Array.isArray(body.items) &&
            body.items.length > 0
          ) {
            mergeGuestCartIntoCustomer(db, user.id, body.items, 'max');
            cartData = getCustomerCartDetails(db, user.id);
          }

          if (cartData.items.length === 0) {
            throw new Error('Your cart is empty.');
          }

          // Re-verify live stock & availability inside the transaction
          let verifiedSubtotal = 0;
          const verifiedItems = [];

          for (const item of cartData.items) {
            const productRow = db
              .prepare('SELECT * FROM products WHERE id = ?')
              .get(item.productId);
            if (
              !productRow ||
              productRow.availability !== 'available' ||
              Number(productRow.stock) <= 0
            ) {
              throw new Error(
                `${item.name} is currently out of stock and cannot be ordered.`
              );
            }
            if (item.quantity > Number(productRow.stock)) {
              throw new Error(
                `Only ${productRow.stock} unit(s) of ${productRow.name} are left in stock.`
              );
            }

            const unitPrice = roundCurrency(Number(productRow.price));
            const lineSubtotal = roundCurrency(unitPrice * item.quantity);
            verifiedSubtotal = roundCurrency(verifiedSubtotal + lineSubtotal);

            verifiedItems.push({
              productId: Number(productRow.id),
              slug: productRow.slug,
              nameSnapshot: productRow.name,
              imageSnapshot: productRow.image,
              packSizeSnapshot: item.packSize,
              unitPriceSnapshot: unitPrice,
              quantity: item.quantity,
              subtotal: lineSubtotal,
              newStock: Number(productRow.stock) - item.quantity,
            });
          }

          // Deduct stock atomically
          const deductStmt = db.prepare(`
            UPDATE products
            SET stock = ?,
                availability = CASE WHEN ? <= 0 THEN 'out_of_stock' ELSE availability END,
                updated_at = datetime('now')
            WHERE id = ?
          `);
          for (const vi of verifiedItems) {
            deductStmt.run(vi.newStock, vi.newStock, vi.productId);
          }

          const totals = computeTotals(db, verifiedSubtotal);
          const tempOrderNum = `HM-TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

          const orderInfo = db
            .prepare(
              `INSERT INTO orders (
                order_number, customer_id, idempotency_key,
                subtotal, shipping, taxes, total,
                payment_method, payment_status, order_status, stock_deducted, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Order Placed', 1, ?)`
            )
            .run(
              tempOrderNum,
              user.id,
              idempotencyKey,
              totals.subtotal,
              totals.shipping,
              totals.taxes,
              totals.total,
              paymentMethod,
              notes
            );

          const orderId = Number(orderInfo.lastInsertRowid);
          const finalOrderNumber = `HM${1000 + orderId}`;
          db.prepare('UPDATE orders SET order_number = ? WHERE id = ?').run(
            finalOrderNumber,
            orderId
          );

          const insertItem = db.prepare(`
            INSERT INTO order_items (
              order_id, product_id, product_slug, product_name_snapshot,
              product_image_snapshot, pack_size_snapshot, unit_price_snapshot,
              quantity, subtotal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const vi of verifiedItems) {
            insertItem.run(
              orderId,
              vi.productId,
              vi.slug,
              vi.nameSnapshot,
              vi.imageSnapshot,
              vi.packSizeSnapshot,
              vi.unitPriceSnapshot,
              vi.quantity,
              vi.subtotal
            );
          }

          db.prepare(`
            INSERT INTO shipping_addresses (
              customer_id, order_id, full_name, email, phone,
              address_line1, address_line2, city, state_province, postal_code, country
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            user.id,
            orderId,
            fullName,
            email,
            phone,
            addressLine1,
            addressLine2,
            city,
            stateProvince,
            postalCode,
            country
          );

          db.prepare(`
            INSERT INTO order_status_history (
              order_id, previous_status, new_status, updated_by_id, updated_by_name, note
            ) VALUES (?, NULL, 'Order Placed', ?, ?, 'Order placed by customer')
          `).run(orderId, user.id, fullName);

          // Clear customer's cart
          db.prepare('DELETE FROM carts WHERE customer_id = ?').run(user.id);

          const row = db
            .prepare('SELECT * FROM orders WHERE id = ?')
            .get(orderId);
          return hydrateOrder(db, row);
        });
      } catch (txErr) {
        return sendJson(res, 400, { error: txErr.message || 'Could not place order.' });
      }

      broadcastEvent('new_order', {
        orderNumber: createdOrder.orderNumber,
        customerName: createdOrder.customerName,
        total: createdOrder.total,
        orderStatus: createdOrder.orderStatus,
        orderDate: createdOrder.orderDate,
        order: createdOrder,
      });

      return sendJson(res, 201, { order: createdOrder });
    }

    if (pathname.startsWith('/api/orders/') && method === 'GET') {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, { error: 'Please sign in to view order details.' });
      }
      const orderNum = decodeURIComponent(
        pathname.slice('/api/orders/'.length)
      ).toUpperCase();
      const row = db
        .prepare(
          'SELECT * FROM orders WHERE UPPER(order_number) = ? AND customer_id = ?'
        )
        .get(orderNum, user.id);
      if (!row) {
        return sendJson(res, 404, { error: 'Order not found.' });
      }
      return sendJson(res, 200, {
        order: hydrateOrder(db, row),
        settings: getStoreSettings(db),
      });
    }

    if (
      pathname.startsWith('/api/orders/') &&
      pathname.endsWith('/cancel') &&
      method === 'POST'
    ) {
      const user = getAuthenticatedUser(db, req, 'customer');
      if (!user) {
        return sendJson(res, 401, { error: 'Please sign in.' });
      }
      const orderNum = decodeURIComponent(
        pathname.slice('/api/orders/'.length, -'/cancel'.length)
      ).toUpperCase();
      const body = await readJsonBody(req);
      const reason = String(body.reason || 'Cancelled by customer').trim();

      const row = db
        .prepare(
          'SELECT * FROM orders WHERE UPPER(order_number) = ? AND customer_id = ?'
        )
        .get(orderNum, user.id);
      if (!row) {
        return sendJson(res, 404, { error: 'Order not found.' });
      }

      const settings = getStoreSettings(db);
      const allowed = Array.isArray(settings.cancellable_statuses)
        ? settings.cancellable_statuses
        : ['Order Placed', 'Order Confirmed'];

      if (!allowed.includes(row.order_status)) {
        return sendJson(res, 400, {
          error: `Orders in "${row.order_status}" status can no longer be cancelled online. Please contact support.`,
        });
      }

      const updatedOrder = withTransaction(db, () => {
        if (Number(row.stock_deducted) === 1) {
          const items = db
            .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
            .all(row.id);
          for (const it of items) {
            db.prepare(`
              UPDATE products
              SET stock = stock + ?,
                  availability = CASE WHEN availability = 'out_of_stock' AND (stock + ?) > 0 THEN 'available' ELSE availability END,
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(it.quantity, it.quantity, it.product_id);
          }
        }

        db.prepare(`
          UPDATE orders
          SET order_status = 'Cancelled',
              stock_deducted = 0,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(row.id);

        db.prepare(`
          INSERT INTO order_status_history (
            order_id, previous_status, new_status, updated_by_id, updated_by_name, note
          ) VALUES (?, ?, 'Cancelled', ?, ?, ?)
        `).run(row.id, row.order_status, user.id, user.name, reason);

        const fresh = db
          .prepare('SELECT * FROM orders WHERE id = ?')
          .get(row.id);
        return hydrateOrder(db, fresh);
      });

      broadcastEvent('order_updated', {
        orderNumber: updatedOrder.orderNumber,
        orderStatus: updatedOrder.orderStatus,
        paymentStatus: updatedOrder.paymentStatus,
        order: updatedOrder,
      });

      return sendJson(res, 200, { order: updatedOrder });
    }

    /* ==============================================================
       ADMIN AUTHENTICATION (/api/admin/auth/*)
       ============================================================== */
    if (pathname === '/api/admin/auth/login' && method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!validateEmail(email) || !password) {
        return sendJson(res, 400, {
          error: 'Please enter administrator email and password.',
        });
      }

      const user = db
        .prepare('SELECT * FROM users WHERE email = ?')
        .get(email);

      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, {
          error: 'Invalid administrator credentials.',
        });
      }

      if (user.role !== 'admin') {
        return sendJson(res, 403, {
          error: 'Access denied. Customer accounts do not have administrator privileges.',
        });
      }

      const session = createSession(db, user, true);
      logAudit(db, user, 'ADMIN_LOGIN', 'user', user.id, { email: user.email });

      return sendJson(
        res,
        200,
        {
          admin: {
            id: Number(user.id),
            name: user.name,
            email: user.email,
            role: user.role,
          },
          token: session.rawToken,
        },
        {
          'Set-Cookie': buildCookie(
            'hm_admin_session',
            session.rawToken,
            session.maxAge
          ),
        }
      );
    }

    if (pathname === '/api/admin/auth/logout' && method === 'POST') {
      const admin = getAuthenticatedUser(db, req, 'admin');
      if (admin && admin.tokenHash) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(admin.tokenHash);
        logAudit(db, admin, 'ADMIN_LOGOUT', 'user', admin.id, {});
      }
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': buildCookie('hm_admin_session', '', 0) }
      );
    }

    if (pathname === '/api/admin/auth/me' && method === 'GET') {
      const admin = getAuthenticatedUser(db, req, 'admin');
      if (!admin) {
        return sendJson(res, 401, { error: 'Administrator authentication required.' });
      }
      return sendJson(res, 200, { admin });
    }

    /* ==============================================================
       PROTECTED ADMIN PORTAL ROUTES (/api/admin/*)
       ============================================================== */
    if (pathname.startsWith('/api/admin/')) {
      const admin = getAuthenticatedUser(db, req, 'admin');
      if (!admin) {
        return sendJson(res, 403, {
          error: 'Forbidden: Valid administrator authorization is required.',
        });
      }

      // 1. Admin Dashboard Overview & Analytics
      if (pathname === '/api/admin/dashboard' && method === 'GET') {
        const totalOrders = Number(
          db.prepare('SELECT COUNT(*) as c FROM orders').get().c
        );
        const newOrders = Number(
          db
            .prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'Order Placed'")
            .get().c
        );
        const confirmedOrders = Number(
          db
            .prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'Order Confirmed'")
            .get().c
        );
        const processingOrders = Number(
          db
            .prepare(
              "SELECT COUNT(*) as c FROM orders WHERE order_status IN ('Order Confirmed', 'Processing')"
            )
            .get().c
        );
        const shippedOrders = Number(
          db
            .prepare(
              "SELECT COUNT(*) as c FROM orders WHERE order_status IN ('Shipped', 'Out for Delivery')"
            )
            .get().c
        );
        const deliveredOrders = Number(
          db
            .prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'Delivered'")
            .get().c
        );
        const cancelledOrders = Number(
          db
            .prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'Cancelled'")
            .get().c
        );
        const refundedOrders = Number(
          db
            .prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'Refunded'")
            .get().c
        );
        const totalCustomers = Number(
          db
            .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'customer'")
            .get().c
        );
        const totalProducts = Number(
          db
            .prepare("SELECT COUNT(*) as c FROM products WHERE availability != 'archived'")
            .get().c
        );
        const revenueRow = db
          .prepare(
            "SELECT COALESCE(SUM(total), 0) as rev FROM orders WHERE order_status NOT IN ('Cancelled', 'Refunded')"
          )
          .get();
        const totalRevenue = roundCurrency(Number(revenueRow.rev || 0));

        const recentOrderRows = db
          .prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 10')
          .all();

        // Analytics: Orders & Revenue by day (last 14 active days)
        const ordersOverTime = db
          .prepare(
            `SELECT substr(order_date, 1, 10) as day,
                    COUNT(*) as order_count,
                    COALESCE(SUM(CASE WHEN order_status NOT IN ('Cancelled', 'Refunded') THEN total ELSE 0 END), 0) as revenue
             FROM orders
             GROUP BY substr(order_date, 1, 10)
             ORDER BY day ASC
             LIMIT 14`
          )
          .all()
          .map((r) => ({
            day: r.day,
            orderCount: Number(r.order_count),
            revenue: roundCurrency(Number(r.revenue)),
          }));

        // Analytics: Best-selling products
        const bestSellingProducts = db
          .prepare(
            `SELECT p.id, p.name, p.slug, p.category, p.image, p.price, p.stock,
                    COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.order_status NOT IN ('Cancelled', 'Refunded') THEN oi.quantity ELSE 0 END), 0) as units_sold,
                    COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.order_status NOT IN ('Cancelled', 'Refunded') THEN oi.subtotal ELSE 0 END), 0) as revenue
             FROM products p
             LEFT JOIN order_items oi ON oi.product_id = p.id
             LEFT JOIN orders o ON o.id = oi.order_id
             WHERE p.availability != 'archived'
             GROUP BY p.id
             ORDER BY units_sold DESC, revenue DESC`
          )
          .all()
          .map((r) => ({
            id: Number(r.id),
            name: r.name,
            slug: r.slug,
            category: r.category,
            image: r.image,
            price: Number(r.price),
            stock: Number(r.stock),
            unitsSold: Number(r.units_sold),
            revenue: roundCurrency(Number(r.revenue)),
          }));

        // Analytics: Recent customer registrations
        const recentCustomers = db
          .prepare(
            `SELECT u.id, u.name, u.email, u.phone, u.created_at,
                    COUNT(o.id) as order_count,
                    COALESCE(SUM(CASE WHEN o.order_status NOT IN ('Cancelled', 'Refunded') THEN o.total ELSE 0 END), 0) as total_spent
             FROM users u
             LEFT JOIN orders o ON o.customer_id = u.id
             WHERE u.role = 'customer'
             GROUP BY u.id
             ORDER BY u.id DESC
             LIMIT 8`
          )
          .all()
          .map((c) => ({
            id: Number(c.id),
            name: c.name,
            email: c.email,
            phone: c.phone,
            createdAt: c.created_at,
            totalOrders: Number(c.order_count),
            totalSpending: roundCurrency(Number(c.total_spent)),
          }));

        return sendJson(res, 200, {
          stats: {
            totalOrders,
            newOrders,
            confirmedOrders,
            processingOrders,
            shippedOrders,
            deliveredOrders,
            cancelledOrders,
            refundedOrders,
            totalCustomers,
            totalProducts,
            totalRevenue,
          },
          recentOrders: recentOrderRows.map((r) => hydrateOrder(db, r)),
          analytics: {
            ordersOverTime,
            bestSellingProducts,
            recentCustomers,
          },
        });
      }

      // 2. Admin Orders Management (/api/admin/orders)
      if (pathname === '/api/admin/orders' && method === 'GET') {
        const statusFilter = urlObj.searchParams.get('status') || '';
        const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
        const dateFilter = (urlObj.searchParams.get('date') || '').trim();
        const sort = urlObj.searchParams.get('sort') === 'oldest' ? 'ASC' : 'DESC';

        const rows = db
          .prepare(`SELECT * FROM orders ORDER BY id ${sort}`)
          .all();

        let orders = rows.map((r) => hydrateOrder(db, r));

        if (statusFilter && statusFilter !== 'All Orders' && statusFilter !== 'all') {
          const normalizedStatus =
            statusFilter === 'New Orders'
              ? 'Order Placed'
              : statusFilter === 'Confirmed'
              ? 'Order Confirmed'
              : statusFilter;
          orders = orders.filter((o) => o.orderStatus === normalizedStatus);
        }

        if (dateFilter) {
          orders = orders.filter((o) =>
            String(o.orderDate || '').startsWith(dateFilter)
          );
        }

        if (q) {
          orders = orders.filter(
            (o) =>
              o.orderNumber.toLowerCase().includes(q) ||
              o.customerName.toLowerCase().includes(q) ||
              o.customerEmail.toLowerCase().includes(q) ||
              o.customerPhone.toLowerCase().includes(q)
          );
        }

        return sendJson(res, 200, { orders });
      }

      if (
        pathname.startsWith('/api/admin/orders/') &&
        pathname.endsWith('/status') &&
        (method === 'PATCH' || method === 'PUT' || method === 'POST')
      ) {
        const orderNum = decodeURIComponent(
          pathname.slice('/api/admin/orders/'.length, -'/status'.length)
        ).toUpperCase();
        const body = await readJsonBody(req);
        const newStatus = body.orderStatus ? String(body.orderStatus).trim() : null;
        const newPaymentStatus = body.paymentStatus
          ? String(body.paymentStatus).trim()
          : null;
        const note = String(body.note || '').trim();

        const orderRow = db
          .prepare('SELECT * FROM orders WHERE UPPER(order_number) = ?')
          .get(orderNum);
        if (!orderRow) {
          return sendJson(res, 404, { error: 'Order not found.' });
        }

        if (newStatus && !VALID_ORDER_STATUSES.includes(newStatus)) {
          return sendJson(res, 400, { error: `Invalid order status: ${newStatus}` });
        }
        if (
          newPaymentStatus &&
          !VALID_PAYMENT_STATUSES.includes(newPaymentStatus)
        ) {
          return sendJson(res, 400, {
            error: `Invalid payment status: ${newPaymentStatus}`,
          });
        }

        let updatedOrder = null;
        try {
          updatedOrder = withTransaction(db, () => {
            const prevStatus = orderRow.order_status;
            const targetStatus = newStatus || prevStatus;
            let targetPaymentStatus = newPaymentStatus || orderRow.payment_status;
            if (targetStatus === 'Refunded') {
              targetPaymentStatus = 'Refunded';
            } else if (
              targetStatus === 'Delivered' &&
              orderRow.payment_method === 'Cash on Delivery' &&
              !newPaymentStatus
            ) {
              targetPaymentStatus = 'Paid';
            }

            let stockDeducted = Number(orderRow.stock_deducted);
            const items = db
              .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
              .all(orderRow.id);

            // Restore stock if transitioning to Cancelled or Refunded
            if (
              (targetStatus === 'Cancelled' || targetStatus === 'Refunded') &&
              stockDeducted === 1
            ) {
              for (const it of items) {
                db.prepare(`
                  UPDATE products
                  SET stock = stock + ?,
                      availability = CASE WHEN availability = 'out_of_stock' AND (stock + ?) > 0 THEN 'available' ELSE availability END,
                      updated_at = datetime('now')
                  WHERE id = ?
                `).run(it.quantity, it.quantity, it.product_id);
              }
              stockDeducted = 0;
            } else if (
              targetStatus !== 'Cancelled' &&
              targetStatus !== 'Refunded' &&
              stockDeducted === 0
            ) {
              // Re-deduct stock if reactivating a cancelled order
              for (const it of items) {
                const p = db
                  .prepare('SELECT name, stock FROM products WHERE id = ?')
                  .get(it.product_id);
                if (!p || Number(p.stock) < Number(it.quantity)) {
                  throw new Error(
                    `Insufficient stock to reactivate order for ${p ? p.name : 'product'}.`
                  );
                }
                const nextStock = Number(p.stock) - Number(it.quantity);
                db.prepare(`
                  UPDATE products
                  SET stock = ?,
                      availability = CASE WHEN ? <= 0 THEN 'out_of_stock' ELSE 'available' END,
                      updated_at = datetime('now')
                  WHERE id = ?
                `).run(nextStock, nextStock, it.product_id);
              }
              stockDeducted = 1;
            }

            db.prepare(`
              UPDATE orders
              SET order_status = ?,
                  payment_status = ?,
                  stock_deducted = ?,
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(targetStatus, targetPaymentStatus, stockDeducted, orderRow.id);

            if (targetStatus !== prevStatus || note || newPaymentStatus) {
              db.prepare(`
                INSERT INTO order_status_history (
                  order_id, previous_status, new_status, updated_by_id, updated_by_name, note
                ) VALUES (?, ?, ?, ?, ?, ?)
              `).run(
                orderRow.id,
                prevStatus,
                targetStatus,
                admin.id,
                admin.name,
                note ||
                  (newPaymentStatus
                    ? `Status: ${targetStatus} · Payment: ${targetPaymentStatus}`
                    : `Status updated to ${targetStatus}`)
              );
            }

            logAudit(db, admin, 'UPDATE_ORDER_STATUS', 'order', orderRow.order_number, {
              previousStatus: prevStatus,
              newStatus: targetStatus,
              paymentStatus: targetPaymentStatus,
              note,
            });

            const fresh = db
              .prepare('SELECT * FROM orders WHERE id = ?')
              .get(orderRow.id);
            return hydrateOrder(db, fresh);
          });
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }

        broadcastEvent('order_updated', {
          orderNumber: updatedOrder.orderNumber,
          orderStatus: updatedOrder.orderStatus,
          paymentStatus: updatedOrder.paymentStatus,
          updatedBy: admin.name,
          order: updatedOrder,
        });

        return sendJson(res, 200, { order: updatedOrder });
      }

      if (pathname.startsWith('/api/admin/orders/') && method === 'GET') {
        const orderNum = decodeURIComponent(
          pathname.slice('/api/admin/orders/'.length)
        ).toUpperCase();
        const row = db
          .prepare('SELECT * FROM orders WHERE UPPER(order_number) = ?')
          .get(orderNum);
        if (!row) {
          return sendJson(res, 404, { error: 'Order not found.' });
        }
        return sendJson(res, 200, { order: hydrateOrder(db, row) });
      }

      // 3. Admin Product Management (/api/admin/products)
      if (pathname === '/api/admin/products' && method === 'GET') {
        const rows = db
          .prepare(
            `SELECT p.*,
                    COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.order_status NOT IN ('Cancelled', 'Refunded') THEN oi.quantity ELSE 0 END), 0) as units_sold
             FROM products p
             LEFT JOIN order_items oi ON oi.product_id = p.id
             LEFT JOIN orders o ON o.id = oi.order_id
             WHERE p.availability != 'archived'
             GROUP BY p.id
             ORDER BY p.number ASC, p.id ASC`
          )
          .all();

        return sendJson(res, 200, {
          products: rows.map((r) => ({
            ...formatProductRow(r),
            unitsSold: Number(r.units_sold || 0),
          })),
        });
      }

      if (pathname === '/api/admin/products' && method === 'POST') {
        const body = await readJsonBody(req);
        const name = String(body.name || '').trim();
        const category = String(body.category || 'Pantry').trim();
        const price = Number(body.price);
        const stock = Math.max(0, parseInt(body.stock, 10) || 0);
        const lowStockThreshold = Math.max(
          1,
          parseInt(body.lowStockThreshold, 10) || 8
        );

        if (!name || Number.isNaN(price) || price < 0) {
          return sendJson(res, 400, {
            error: 'Product name and a valid non-negative price are required.',
          });
        }

        let slug = String(body.slug || name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        if (!slug) slug = `product-${Date.now()}`;

        const existingSlug = db
          .prepare('SELECT id FROM products WHERE slug = ?')
          .get(slug);
        if (existingSlug) {
          slug = `${slug}-${Date.now().toString().slice(-4)}`;
        }

        const countRow = db
          .prepare('SELECT COUNT(*) as c FROM products')
          .get();
        const number = String(
          body.number || String(Number(countRow.c) + 1).padStart(2, '0')
        );

        const packSizes = Array.isArray(body.packSizes)
          ? body.packSizes.map((s) => String(s).trim()).filter(Boolean)
          : String(body.packSizes || '250g')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
        if (packSizes.length === 0) packSizes.push('Standard');

        const availability =
          stock <= 0
            ? 'out_of_stock'
            : body.availability === 'out_of_stock'
            ? 'out_of_stock'
            : 'available';

        const description = String(body.description || '').trim();
        const cardSummary = String(
          body.cardSummary || description || `From Happy Monk's ${category} range.`
        ).trim();
        const kitchenHeading = String(
          body.kitchenHeading || 'From Happy Monk’s kitchen'
        ).trim();
        const kitchenCopy = String(
          body.kitchenCopy || description || cardSummary
        ).trim();
        const recipeHeading = String(
          body.recipeHeading || `Serving ${name}`
        ).trim();
        const recipeCopy = String(
          body.recipeCopy || description || cardSummary
        ).trim();
        const image = String(body.image || '/img/coffee.png').trim();
        const imageAlt = String(body.imageAlt || name).trim();
        const supplier = String(body.supplier || '[supplier]').trim();
        const certificateType = String(
          body.certificateType || '[certificate type]'
        ).trim();
        const issuingBody = String(body.issuingBody || '[issuing body]').trim();
        const certificateNumber = String(
          body.certificateNumber || '[number]'
        ).trim();

        const info = db
          .prepare(
            `INSERT INTO products (
              slug, number, category, name, description, card_summary,
              kitchen_heading, kitchen_copy, recipe_heading, recipe_copy,
              price, image, image_alt, pack_sizes_json, stock, low_stock_threshold,
              availability, supplier, certificate_type, issuing_body, certificate_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            slug,
            number,
            category,
            name,
            description,
            cardSummary,
            kitchenHeading,
            kitchenCopy,
            recipeHeading,
            recipeCopy,
            roundCurrency(price),
            image,
            imageAlt,
            JSON.stringify(packSizes),
            stock,
            lowStockThreshold,
            availability,
            supplier,
            certificateType,
            issuingBody,
            certificateNumber
          );

        const created = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(Number(info.lastInsertRowid));
        logAudit(db, admin, 'CREATE_PRODUCT', 'product', created.id, {
          name: created.name,
          price: created.price,
          stock: created.stock,
        });

        broadcastEvent('product_updated', { product: formatProductRow(created) });
        return sendJson(res, 201, { product: formatProductRow(created) });
      }

      if (pathname.startsWith('/api/admin/products/') && method === 'PUT') {
        const id = Number(pathname.slice('/api/admin/products/'.length));
        const existing = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(id);
        if (!existing) {
          return sendJson(res, 404, { error: 'Product not found.' });
        }

        const body = await readJsonBody(req);
        const name = String(body.name ?? existing.name).trim();
        const category = String(body.category ?? existing.category).trim();
        const price =
          body.price !== undefined ? Number(body.price) : Number(existing.price);
        const stock =
          body.stock !== undefined
            ? Math.max(0, parseInt(body.stock, 10) || 0)
            : Number(existing.stock);
        const lowStockThreshold =
          body.lowStockThreshold !== undefined
            ? Math.max(1, parseInt(body.lowStockThreshold, 10) || 8)
            : Number(existing.low_stock_threshold);

        if (!name || Number.isNaN(price) || price < 0) {
          return sendJson(res, 400, {
            error: 'Valid product name and non-negative price are required.',
          });
        }

        let packSizes = [];
        if (body.packSizes !== undefined) {
          packSizes = Array.isArray(body.packSizes)
            ? body.packSizes.map((s) => String(s).trim()).filter(Boolean)
            : String(body.packSizes)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        } else {
          try {
            packSizes = JSON.parse(existing.pack_sizes_json || '["250g"]');
          } catch (_) {}
        }
        if (packSizes.length === 0) packSizes.push('Standard');

        let availability = body.availability || existing.availability;
        if (stock <= 0 && availability !== 'archived') {
          availability = 'out_of_stock';
        } else if (
          stock > 0 &&
          body.availability === undefined &&
          existing.availability === 'out_of_stock'
        ) {
          availability = 'available';
        }

        const description = String(
          body.description ?? existing.description
        ).trim();
        const cardSummary = String(
          body.cardSummary ?? existing.card_summary
        ).trim();
        const kitchenHeading = String(
          body.kitchenHeading ?? existing.kitchen_heading
        ).trim();
        const kitchenCopy = String(
          body.kitchenCopy ?? existing.kitchen_copy
        ).trim();
        const recipeHeading = String(
          body.recipeHeading ?? existing.recipe_heading
        ).trim();
        const recipeCopy = String(body.recipeCopy ?? existing.recipe_copy).trim();
        const image = String(body.image ?? existing.image).trim();
        const imageAlt = String(body.imageAlt ?? existing.image_alt).trim();
        const supplier = String(body.supplier ?? existing.supplier).trim();
        const certificateType = String(
          body.certificateType ?? existing.certificate_type
        ).trim();
        const issuingBody = String(
          body.issuingBody ?? existing.issuing_body
        ).trim();
        const certificateNumber = String(
          body.certificateNumber ?? existing.certificate_number
        ).trim();

        db.prepare(`
          UPDATE products
          SET name = ?, category = ?, description = ?, card_summary = ?,
              kitchen_heading = ?, kitchen_copy = ?, recipe_heading = ?, recipe_copy = ?,
              price = ?, image = ?, image_alt = ?, pack_sizes_json = ?,
              stock = ?, low_stock_threshold = ?, availability = ?,
              supplier = ?, certificate_type = ?, issuing_body = ?, certificate_number = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(
          name,
          category,
          description,
          cardSummary,
          kitchenHeading,
          kitchenCopy,
          recipeHeading,
          recipeCopy,
          roundCurrency(price),
          image,
          imageAlt,
          JSON.stringify(packSizes),
          stock,
          lowStockThreshold,
          availability,
          supplier,
          certificateType,
          issuingBody,
          certificateNumber,
          id
        );

        const updated = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(id);
        logAudit(db, admin, 'UPDATE_PRODUCT', 'product', id, {
          name: updated.name,
          price: updated.price,
          stock: updated.stock,
          availability: updated.availability,
        });

        broadcastEvent('product_updated', { product: formatProductRow(updated) });
        return sendJson(res, 200, { product: formatProductRow(updated) });
      }

      if (pathname.startsWith('/api/admin/products/') && method === 'DELETE') {
        const id = Number(pathname.slice('/api/admin/products/'.length));
        const existing = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(id);
        if (!existing) {
          return sendJson(res, 404, { error: 'Product not found.' });
        }

        // Archive product so historical order_items referencing product_id remain intact
        db.prepare(
          "UPDATE products SET availability = 'archived', stock = 0, updated_at = datetime('now') WHERE id = ?"
        ).run(id);
        db.prepare('DELETE FROM carts WHERE product_id = ?').run(id);

        logAudit(db, admin, 'ARCHIVE_PRODUCT', 'product', id, {
          name: existing.name,
        });

        broadcastEvent('product_deleted', { id, slug: existing.slug });
        return sendJson(res, 200, { ok: true, id });
      }

      // 4. Admin Customer Management (/api/admin/customers)
      if (pathname === '/api/admin/customers' && method === 'GET') {
        const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
        const rows = db
          .prepare(
            `SELECT u.id, u.name, u.email, u.phone, u.created_at,
                    COUNT(o.id) as total_orders,
                    COALESCE(SUM(CASE WHEN o.order_status NOT IN ('Cancelled', 'Refunded') THEN o.total ELSE 0 END), 0) as total_spending
             FROM users u
             LEFT JOIN orders o ON o.customer_id = u.id
             WHERE u.role = 'customer'
             GROUP BY u.id
             ORDER BY u.id DESC`
          )
          .all();

        let customers = rows.map((r) => ({
          id: Number(r.id),
          customerCode: `CUST-${100 + Number(r.id)}`,
          name: r.name,
          email: r.email,
          phone: r.phone,
          createdAt: r.created_at,
          totalOrders: Number(r.total_orders),
          totalSpending: roundCurrency(Number(r.total_spending)),
        }));

        if (q) {
          customers = customers.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.email.toLowerCase().includes(q) ||
              c.phone.toLowerCase().includes(q) ||
              c.customerCode.toLowerCase().includes(q)
          );
        }

        return sendJson(res, 200, { customers });
      }

      if (pathname.startsWith('/api/admin/customers/') && method === 'GET') {
        const custId = Number(pathname.slice('/api/admin/customers/'.length));
        const userRow = db
          .prepare(
            "SELECT id, name, email, phone, created_at FROM users WHERE id = ? AND role = 'customer'"
          )
          .get(custId);
        if (!userRow) {
          return sendJson(res, 404, { error: 'Customer not found.' });
        }

        const orderRows = db
          .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC')
          .all(custId);
        const orders = orderRows.map((o) => hydrateOrder(db, o));
        const totalSpending = roundCurrency(
          orders
            .filter(
              (o) =>
                o.orderStatus !== 'Cancelled' && o.orderStatus !== 'Refunded'
            )
            .reduce((sum, o) => sum + o.total, 0)
        );

        return sendJson(res, 200, {
          customer: {
            id: Number(userRow.id),
            customerCode: `CUST-${100 + Number(userRow.id)}`,
            name: userRow.name,
            email: userRow.email,
            phone: userRow.phone,
            createdAt: userRow.created_at,
            totalOrders: orders.length,
            totalSpending,
            orders,
          },
        });
      }

      // 5. Admin Inventory Management (/api/admin/inventory)
      if (pathname === '/api/admin/inventory' && method === 'GET') {
        const rows = db
          .prepare(
            `SELECT p.*,
                    COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.order_status NOT IN ('Cancelled', 'Refunded') THEN oi.quantity ELSE 0 END), 0) as units_sold
             FROM products p
             LEFT JOIN order_items oi ON oi.product_id = p.id
             LEFT JOIN orders o ON o.id = oi.order_id
             WHERE p.availability != 'archived'
             GROUP BY p.id
             ORDER BY p.stock ASC, p.number ASC`
          )
          .all();

        const inventory = rows.map((r) => {
          const stock = Number(r.stock);
          const threshold = Number(r.low_stock_threshold);
          const stockStatus =
            stock <= 0 || r.availability === 'out_of_stock'
              ? 'Out of Stock'
              : stock <= threshold
              ? 'Low Stock'
              : 'In Stock';
          return {
            ...formatProductRow(r),
            unitsSold: Number(r.units_sold || 0),
            stockStatus,
            isLowStock: stock > 0 && stock <= threshold,
            isOutOfStock: stock <= 0 || r.availability === 'out_of_stock',
          };
        });

        return sendJson(res, 200, { inventory });
      }

      if (pathname.startsWith('/api/admin/inventory/') && method === 'PATCH') {
        const prodId = Number(pathname.slice('/api/admin/inventory/'.length));
        const body = await readJsonBody(req);
        const existing = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(prodId);
        if (!existing) {
          return sendJson(res, 404, { error: 'Product not found.' });
        }

        let nextStock = Number(existing.stock);
        if (body.stock !== undefined) {
          nextStock = Math.max(0, parseInt(body.stock, 10) || 0);
        } else if (body.delta !== undefined) {
          nextStock = Math.max(
            0,
            Number(existing.stock) + (parseInt(body.delta, 10) || 0)
          );
        }
        const threshold =
          body.lowStockThreshold !== undefined
            ? Math.max(1, parseInt(body.lowStockThreshold, 10) || 8)
            : Number(existing.low_stock_threshold);

        const nextAvailability =
          nextStock <= 0
            ? 'out_of_stock'
            : body.availability === 'out_of_stock'
            ? 'out_of_stock'
            : 'available';

        db.prepare(`
          UPDATE products
          SET stock = ?, low_stock_threshold = ?, availability = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(nextStock, threshold, nextAvailability, prodId);

        const updated = db
          .prepare('SELECT * FROM products WHERE id = ?')
          .get(prodId);
        logAudit(db, admin, 'ADJUST_INVENTORY', 'product', prodId, {
          name: updated.name,
          previousStock: existing.stock,
          newStock: nextStock,
          availability: nextAvailability,
        });

        broadcastEvent('product_updated', { product: formatProductRow(updated) });
        return sendJson(res, 200, { product: formatProductRow(updated) });
      }

      // 6. Admin Settings & Audit Logs (/api/admin/settings)
      if (pathname === '/api/admin/settings' && method === 'GET') {
        const settings = getStoreSettings(db);
        const auditLogs = db
          .prepare(
            'SELECT * FROM audit_logs ORDER BY id DESC LIMIT 40'
          )
          .all()
          .map((a) => ({
            id: Number(a.id),
            adminId: a.admin_id,
            adminEmail: a.admin_email,
            action: a.action,
            entityType: a.entity_type,
            entityId: a.entity_id,
            details: JSON.parse(a.details_json || '{}'),
            createdAt: a.created_at,
          }));
        return sendJson(res, 200, {
          settings: {
            ...settings,
            stripe_enabled: Boolean(process.env.STRIPE_SECRET_KEY),
          },
          auditLogs,
        });
      }

      if (pathname === '/api/admin/settings' && method === 'PUT') {
        const body = await readJsonBody(req);
        const patch = {};
        if (body.shipping_fee !== undefined) {
          patch.shipping_fee = Math.max(0, roundCurrency(Number(body.shipping_fee)));
        }
        if (body.free_shipping_threshold !== undefined) {
          patch.free_shipping_threshold = Math.max(
            0,
            roundCurrency(Number(body.free_shipping_threshold))
          );
        }
        if (body.tax_rate_percent !== undefined) {
          patch.tax_rate_percent = Math.max(
            0,
            roundCurrency(Number(body.tax_rate_percent))
          );
        }
        if (body.allow_cod !== undefined) {
          patch.allow_cod = Boolean(body.allow_cod);
        }
        if (body.allow_etransfer !== undefined) {
          patch.allow_etransfer = Boolean(body.allow_etransfer);
        }
        if (body.etransfer_instructions !== undefined) {
          patch.etransfer_instructions = String(
            body.etransfer_instructions
          ).trim();
        }
        if (Array.isArray(body.cancellable_statuses)) {
          patch.cancellable_statuses = body.cancellable_statuses;
        }

        const updated = updateStoreSettings(db, patch);
        logAudit(db, admin, 'UPDATE_STORE_SETTINGS', 'settings', 'config', patch);
        return sendJson(res, 200, { settings: updated });
      }
    }

    return sendJson(res, 404, { error: `API endpoint not found: ${method} ${pathname}` });
  } catch (err) {
    console.error('API Error:', err);
    return sendJson(res, 500, {
      error: err.message || 'Internal server error.',
    });
  }
}
