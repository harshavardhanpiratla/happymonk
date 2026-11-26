import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { handleApiRequest } from './server/api.js';

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const DIST_DIR = resolve(ROOT, 'dist');
const PUBLIC_DIR = resolve(ROOT, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const CLEAN_ROUTE_MAP = {
  '/': 'index.html',
  '/our-story': 'our-story.html',
  '/shop': 'shop.html',
  '/shop-the-range': 'shop.html',
  '/product': 'product.html',
  '/signin': 'signin.html',
  '/login': 'signin.html',
  '/signup': 'signup.html',
  '/register': 'signup.html',
  '/account': 'account.html',
  '/cart': 'cart.html',
  '/checkout': 'checkout.html',
  '/order-success': 'order-success.html',
  '/track-order': 'track-order.html',
  '/admin': 'admin.html',
  '/admin/login': 'admin-login.html',
};

function findStaticFile(pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';

  if (CLEAN_ROUTE_MAP[clean]) {
    const rel = CLEAN_ROUTE_MAP[clean];
    for (const base of [DIST_DIR, ROOT, PUBLIC_DIR]) {
      const candidate = resolve(base, rel);
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
  }

  if (clean.startsWith('/products/')) {
    const slug = clean.slice('/products/'.length).replace(/\.html$/i, '');
    for (const base of [DIST_DIR, ROOT]) {
      const specific = resolve(base, 'products', `${slug}.html`);
      if (existsSync(specific) && statSync(specific).isFile()) return specific;
      const fallback = resolve(base, 'product.html');
      if (existsSync(fallback) && statSync(fallback).isFile()) return fallback;
    }
  }

  const relPath = clean.replace(/^\/+/, '');
  for (const base of [PUBLIC_DIR, DIST_DIR, ROOT]) {
    const direct = resolve(base, relPath);
    if (existsSync(direct) && statSync(direct).isFile()) return direct;
    const withHtml = resolve(base, `${relPath}.html`);
    if (existsSync(withHtml) && statSync(withHtml).isFile()) return withHtml;
    const indexHtml = resolve(base, relPath, 'index.html');
    if (existsSync(indexHtml) && statSync(indexHtml).isFile()) return indexHtml;
  }

  return null;
}

const server = createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  if (pathname.startsWith('/api/')) {
    return handleApiRequest(req, res);
  }

  const filePath = findStaticFile(pathname);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(content);
});

server.listen(PORT, () => {
  console.log(`Happy Monk E-Commerce Platform running at http://localhost:${PORT}`);
});
