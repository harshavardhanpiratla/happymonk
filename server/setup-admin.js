import { getDb, hashPassword } from './db.js';

const db = getDb();
const email = (
  process.argv[2] ||
  process.env.ADMIN_EMAIL ||
  'admin@happymonk.ca'
)
  .trim()
  .toLowerCase();
const password =
  process.argv[3] || process.env.ADMIN_PASSWORD || 'HappyMonk@Admin2026!';
const name =
  process.argv[4] || process.env.ADMIN_NAME || 'Happy Monk Administrator';

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare(
    "UPDATE users SET name = ?, password_hash = ?, role = 'admin', updated_at = datetime('now') WHERE id = ?"
  ).run(name, hashPassword(password), existing.id);
  console.log(`Updated existing administrator account: ${email}`);
} else {
  db.prepare(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES (?, ?, '+1 (416) 555-0100', ?, 'admin')`
  ).run(name, email, hashPassword(password));
  console.log(`Created administrator account: ${email}`);
}
