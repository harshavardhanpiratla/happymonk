import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const DEFAULT_PRODUCTS = [
  {
    slug: 'pure-coffee',
    number: '01',
    category: 'Coffee',
    name: 'Pure Coffee',
    description:
      'Single-origin South Indian filter coffee roasted in small batches for a rich, aromatic decoction.',
    card_summary: 'The first pour into a steel davara.',
    kitchen_heading: 'From Happy Monk’s kitchen',
    kitchen_copy:
      'Let the decoction drip at its own pace. The kitchen can wait a few minutes.',
    recipe_heading: 'South Indian filter coffee',
    recipe_copy:
      'Brew a strong decoction in a filter. Pour it into hot milk and sweeten to taste.',
    price: 18.0,
    image: '/img/coffee.png',
    image_alt:
      'South Indian filter coffee being poured into a traditional steel filter coffee tumbler',
    pack_sizes: ['250g', '500g'],
    stock: 45,
    low_stock_threshold: 10,
    availability: 'available',
    supplier: 'Chikmagalur Estate Growers Co-op',
    certificate_type: 'Single-Origin Purity & Roast Grade',
    issuing_body: 'Coffee Board of India / CFIA Import Lot',
    certificate_number: 'HM-CF-2026-0104',
  },
  {
    slug: 'honey',
    number: '02',
    category: 'Honey',
    name: 'Honey',
    description:
      'Raw, unblended multifloral forest honey harvested ethically and tested for zero added syrups.',
    card_summary: 'A thin drizzle over warm breakfast toast.',
    kitchen_heading: 'From Happy Monk’s kitchen',
    kitchen_copy: 'A little on warm toast goes a long way.',
    recipe_heading: 'Honey toast',
    recipe_copy:
      'Toast the bread first. Add butter while it’s warm, then drizzle a thin line of honey.',
    price: 22.0,
    image: '/img/honey.png',
    image_alt:
      'Golden honey dripping from a wooden honey dipper into a glass jar',
    pack_sizes: ['350g', '700g'],
    stock: 32,
    low_stock_threshold: 8,
    availability: 'available',
    supplier: 'Nilgiri Apiary Collective',
    certificate_type: 'NMR Authenticity & C3/C4 Sugar-Free Test',
    issuing_body: 'Eurofins Food Integrity Lab',
    certificate_number: 'HM-HN-2026-0219',
  },
  {
    slug: 'chilli-powder',
    number: '03',
    category: 'Spices',
    name: 'Chilli Powder',
    description:
      'Sun-dried Guntur and Byadgi chillies stone-ground in small lots for deep colour and clean heat.',
    card_summary: 'A spoon of chilli powder for the Avakaya jar.',
    kitchen_heading: 'From Happy Monk’s kitchen',
    kitchen_copy: 'Went into this year’s Avakaya.',
    recipe_heading: 'Avakaya',
    recipe_copy:
      'Toss raw mango with mustard powder, chilli powder, salt and oil using your usual pickle recipe.',
    price: 14.5,
    image: '/img/spices.png',
    image_alt:
      'Traditional red chilli powder with dried red chillies in a wooden spoon',
    pack_sizes: ['200g', '500g'],
    stock: 60,
    low_stock_threshold: 12,
    availability: 'available',
    supplier: 'Guntur Spice Farmers Union',
    certificate_type: 'Sudan-Dye Free & Aflatoxin Screen',
    issuing_body: 'Spices Board Quality Evaluation Lab',
    certificate_number: 'HM-SP-2026-0308',
  },
  {
    slug: 'cooking-ghee',
    number: '04',
    category: 'Ghee',
    name: 'Cooking Ghee',
    description:
      'Slow-simmered cultured butter ghee with a granular texture and nutty aroma built for everyday Indian cooking.',
    card_summary: 'Ghee folded into the Mysorepak, a little at a time.',
    kitchen_heading: 'From Happy Monk’s kitchen',
    kitchen_copy:
      'A spoonful over warm Mysorepak dough is a good reminder to take your time.',
    recipe_heading: 'Mysorepak',
    recipe_copy:
      'Roast the besan gently, then add it to the sugar syrup and work in the warm ghee in stages.',
    price: 28.0,
    image: '/img/ghee.png',
    image_alt:
      'Golden melted ghee being poured from a spoon into a glass jar',
    pack_sizes: ['500ml', '1L'],
    stock: 28,
    low_stock_threshold: 8,
    availability: 'available',
    supplier: 'Anand Dairy Heritage Creamery',
    certificate_type: 'RM Value & Milk Fat Purity Assay',
    issuing_body: 'AGMARK / Accredited Dairy Lab',
    certificate_number: 'HM-GH-2026-0412',
  },
  {
    slug: 'puja-ghee',
    number: '05',
    category: 'Ghee',
    name: 'Puja Ghee',
    description:
      'Clarified cow ghee prepared specifically for steady, clean-burning cotton wicks in daily lamps.',
    card_summary: 'Made for lighting the lamp.',
    kitchen_heading: 'From Happy Monk’s kitchen',
    kitchen_copy: 'For lighting the lamp.',
    recipe_heading: 'Lighting a diya',
    recipe_copy:
      'Set the cotton wick in the diya and add a small amount of puja ghee.',
    price: 19.5,
    image: '/img/puja-ghee.png',
    image_alt: 'A traditional brass diya with a glowing flame',
    pack_sizes: ['250ml', '500ml'],
    stock: 38,
    low_stock_threshold: 8,
    availability: 'available',
    supplier: 'Kumbakonam Cow Ghee Cooperative',
    certificate_type: 'Pure Cow Milk Fat & Clean Burn Test',
    issuing_body: 'NABL Accredited Testing Lab',
    certificate_number: 'HM-PG-2026-0507',
  },
];

const DEFAULT_SETTINGS = {
  shipping_fee: 8.0,
  free_shipping_threshold: 75.0,
  tax_rate_percent: 13.0,
  currency: 'CAD',
  cancellable_statuses: ['Order Placed', 'Order Confirmed'],
  inventory_deduction_stage: 'Order Placed',
  allow_cod: true,
  allow_etransfer: true,
  etransfer_instructions:
    'Send Interac e-Transfer to orders@happymonk.ca with your Order Number in the message.',
};

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const derived = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

let dbInstance = null;

function resolveDbPath() {
  if (process.env.SQLITE_DB_PATH) {
    return resolve(process.env.SQLITE_DB_PATH);
  }
  if (process.env.VERCEL) {
    return '/tmp/happy-monk.sqlite';
  }
  return resolve(process.cwd(), 'data', 'happy-monk.sqlite');
}

export function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch (_) {}

  initSchema(db);
  seedInitialData(db);
  dbInstance = db;
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      remember_me INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL DEFAULT '01',
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      card_summary TEXT NOT NULL DEFAULT '',
      kitchen_heading TEXT NOT NULL DEFAULT 'From Happy Monk’s kitchen',
      kitchen_copy TEXT NOT NULL DEFAULT '',
      recipe_heading TEXT NOT NULL DEFAULT '',
      recipe_copy TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL CHECK (price >= 0),
      image TEXT NOT NULL DEFAULT '/img/coffee.png',
      image_alt TEXT NOT NULL DEFAULT '',
      pack_sizes_json TEXT NOT NULL DEFAULT '["250g"]',
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      low_stock_threshold INTEGER NOT NULL DEFAULT 8,
      availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'out_of_stock', 'archived')),
      supplier TEXT NOT NULL DEFAULT '[supplier]',
      certificate_type TEXT NOT NULL DEFAULT '[certificate type]',
      issuing_body TEXT NOT NULL DEFAULT '[issuing body]',
      certificate_number TEXT NOT NULL DEFAULT '[number]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      pack_size TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(customer_id, product_id, pack_size),
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_carts_customer ON carts(customer_id);

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      idempotency_key TEXT UNIQUE,
      order_date TEXT NOT NULL DEFAULT (datetime('now')),
      subtotal REAL NOT NULL CHECK (subtotal >= 0),
      shipping REAL NOT NULL CHECK (shipping >= 0),
      taxes REAL NOT NULL CHECK (taxes >= 0),
      total REAL NOT NULL CHECK (total >= 0),
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid', 'Refunded', 'Failed')),
      order_status TEXT NOT NULL DEFAULT 'Order Placed' CHECK (
        order_status IN (
          'Order Placed',
          'Order Confirmed',
          'Processing',
          'Shipped',
          'Out for Delivery',
          'Delivered',
          'Cancelled',
          'Refunded'
        )
      ),
      stock_deducted INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_slug TEXT NOT NULL DEFAULT '',
      product_name_snapshot TEXT NOT NULL,
      product_image_snapshot TEXT NOT NULL,
      pack_size_snapshot TEXT NOT NULL DEFAULT '',
      unit_price_snapshot REAL NOT NULL CHECK (unit_price_snapshot >= 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      subtotal REAL NOT NULL CHECK (subtotal >= 0),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

    CREATE TABLE IF NOT EXISTS shipping_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL,
      state_province TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Canada',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_shipping_order ON shipping_addresses(order_id);

    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      updated_by_id INTEGER,
      updated_by_name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_history_order ON order_status_history(order_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seedInitialData(db) {
  // 1. Seed default products if none exist
  const countRow = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (!countRow || Number(countRow.c) === 0) {
    const insertProduct = db.prepare(`
      INSERT INTO products (
        slug, number, category, name, description, card_summary,
        kitchen_heading, kitchen_copy, recipe_heading, recipe_copy,
        price, image, image_alt, pack_sizes_json, stock, low_stock_threshold,
        availability, supplier, certificate_type, issuing_body, certificate_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of DEFAULT_PRODUCTS) {
      insertProduct.run(
        p.slug,
        p.number,
        p.category,
        p.name,
        p.description,
        p.card_summary,
        p.kitchen_heading,
        p.kitchen_copy,
        p.recipe_heading,
        p.recipe_copy,
        p.price,
        p.image,
        p.image_alt,
        JSON.stringify(p.pack_sizes),
        p.stock,
        p.low_stock_threshold,
        p.availability,
        p.supplier,
        p.certificate_type,
        p.issuing_body,
        p.certificate_number
      );
    }
  }

  // 2. Seed store settings if none exist
  const settingCheck = db
    .prepare('SELECT key FROM store_settings WHERE key = ?')
    .get('config');
  if (!settingCheck) {
    db.prepare(
      'INSERT INTO store_settings (key, value_json) VALUES (?, ?)'
    ).run('config', JSON.stringify(DEFAULT_SETTINGS));
  }

  // 3. Provision initial administrator account from environment variables or default setup config
  const adminEmail = (
    process.env.ADMIN_EMAIL || 'admin@happymonk.ca'
  ).trim().toLowerCase();
  const adminPassword =
    process.env.ADMIN_PASSWORD || 'HappyMonk@Admin2026!';
  const adminName = process.env.ADMIN_NAME || 'Happy Monk Administrator';

  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get();
  if (!existingAdmin) {
    db.prepare(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`
    ).run(adminName, adminEmail, '+1 (416) 555-0100', hashPassword(adminPassword));
  } else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    // Keep env-configured admin synchronized if explicitly set in environment
    const byEmail = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(adminEmail);
    if (!byEmail) {
      db.prepare(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES (?, ?, ?, ?, 'admin')`
      ).run(adminName, adminEmail, '+1 (416) 555-0100', hashPassword(adminPassword));
    }
  }
}

export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch (_) {}
    throw err;
  }
}

export function getStoreSettings(db) {
  const row = db
    .prepare('SELECT value_json FROM store_settings WHERE key = ?')
    .get('config');
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value_json) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateStoreSettings(db, patch) {
  const current = getStoreSettings(db);
  const updated = { ...current, ...patch };
  db.prepare(
    `INSERT INTO store_settings (key, value_json, updated_at)
     VALUES ('config', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
  ).run(JSON.stringify(updated));
  return updated;
}

export function formatProductRow(row) {
  if (!row) return null;
  let packSizes = ['250g'];
  try {
    const parsed = JSON.parse(row.pack_sizes_json || '["250g"]');
    if (Array.isArray(parsed) && parsed.length > 0) packSizes = parsed;
  } catch (_) {}
  const effectiveAvailability =
    row.availability === 'archived'
      ? 'archived'
      : Number(row.stock) <= 0 || row.availability === 'out_of_stock'
      ? 'out_of_stock'
      : 'available';
  return {
    id: Number(row.id),
    slug: row.slug,
    number: row.number,
    name: row.name,
    category: row.category,
    description: row.description,
    cardSummary: row.card_summary,
    kitchenHeading: row.kitchen_heading,
    kitchenCopy: row.kitchen_copy,
    recipeHeading: row.recipe_heading,
    recipeCopy: row.recipe_copy,
    price: Number(row.price),
    image: row.image,
    imageAlt: row.image_alt,
    packSizes,
    stock: Number(row.stock),
    lowStockThreshold: Number(row.low_stock_threshold),
    availability: effectiveAvailability,
    rawAvailability: row.availability,
    supplier: row.supplier,
    certificateType: row.certificate_type,
    issuingBody: row.issuing_body,
    certificateNumber: row.certificate_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
