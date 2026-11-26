import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { handleApiRequest } from './server/api.js';

const PRODUCT_SLUGS = new Set([
  'pure-coffee',
  'honey',
  'chilli-powder',
  'cooking-ghee',
  'puja-ghee',
]);

const PAGE_REWRITES = {
  '/our-story': '/our-story.html',
  '/shop': '/shop.html',
  '/shop-the-range': '/shop.html',
  '/signin': '/signin.html',
  '/login': '/signin.html',
  '/signup': '/signup.html',
  '/register': '/signup.html',
  '/account': '/account.html',
  '/cart': '/cart.html',
  '/checkout': '/checkout.html',
  '/order-success': '/order-success.html',
  '/track-order': '/track-order.html',
  '/admin/login': '/admin-login.html',
  '/admin': '/admin.html',
  '/product': '/product.html',
};

function cleanUrlAndApiPlugin() {
  const middleware = (req, res, next) => {
    if (req.url && req.url.startsWith('/api/')) {
      handleApiRequest(req, res);
      return;
    }
    if (req.url) {
      const [rawPath, search] = req.url.split('?');
      const pathname = rawPath.replace(/\/+$/, '') || '/';
      const qs = search ? `?${search}` : '';

      if (PAGE_REWRITES[pathname]) {
        req.url = `${PAGE_REWRITES[pathname]}${qs}`;
      } else if (pathname.startsWith('/products/')) {
        const slug = pathname.slice('/products/'.length).replace(/\.html$/i, '');
        if (PRODUCT_SLUGS.has(slug)) {
          req.url = `/products/${slug}.html${qs}`;
        } else {
          req.url = `/product.html?product=${encodeURIComponent(slug)}${search ? `&${search}` : ''}`;
        }
      } else {
        const bare = pathname.slice(1).replace(/\.html$/i, '');
        if (PRODUCT_SLUGS.has(bare)) {
          req.url = `/products/${bare}.html${qs}`;
        }
      }
    }
    next();
  };

  return {
    name: 'clean-url-and-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    closeBundle() {
      const distDir = resolve(import.meta.dirname, 'dist');
      const staticMirrors = [
        ['our-story.html', 'our-story/index.html'],
        ['shop.html', 'shop/index.html'],
        ['shop.html', 'shop-the-range/index.html'],
        ['signin.html', 'signin/index.html'],
        ['signup.html', 'signup/index.html'],
        ['account.html', 'account/index.html'],
        ['cart.html', 'cart/index.html'],
        ['checkout.html', 'checkout/index.html'],
        ['order-success.html', 'order-success/index.html'],
        ['track-order.html', 'track-order/index.html'],
        ['admin.html', 'admin/index.html'],
        ['admin-login.html', 'admin/login/index.html'],
        ...[...PRODUCT_SLUGS].flatMap((slug) => [
          [`products/${slug}.html`, `products/${slug}/index.html`],
          [`products/${slug}.html`, `${slug}/index.html`],
        ]),
      ];

      for (const [srcRel, destRel] of staticMirrors) {
        const srcPath = resolve(distDir, srcRel);
        const destPath = resolve(distDir, destRel);
        if (existsSync(srcPath)) {
          mkdirSync(resolve(destPath, '..'), { recursive: true });
          copyFileSync(srcPath, destPath);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [cleanUrlAndApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ourStory: resolve(import.meta.dirname, 'our-story.html'),
        shop: resolve(import.meta.dirname, 'shop.html'),
        product: resolve(import.meta.dirname, 'product.html'),
        signin: resolve(import.meta.dirname, 'signin.html'),
        signup: resolve(import.meta.dirname, 'signup.html'),
        account: resolve(import.meta.dirname, 'account.html'),
        cart: resolve(import.meta.dirname, 'cart.html'),
        checkout: resolve(import.meta.dirname, 'checkout.html'),
        orderSuccess: resolve(import.meta.dirname, 'order-success.html'),
        trackOrder: resolve(import.meta.dirname, 'track-order.html'),
        adminLogin: resolve(import.meta.dirname, 'admin-login.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        pureCoffee: resolve(import.meta.dirname, 'products/pure-coffee.html'),
        honey: resolve(import.meta.dirname, 'products/honey.html'),
        chilliPowder: resolve(import.meta.dirname, 'products/chilli-powder.html'),
        cookingGhee: resolve(import.meta.dirname, 'products/cooking-ghee.html'),
        pujaGhee: resolve(import.meta.dirname, 'products/puja-ghee.html'),
      },
    },
  },
});
