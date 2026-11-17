import { defineConfig } from 'vite';
import { resolve } from 'path';

const PRODUCT_SLUGS = new Set([
  'pure-coffee',
  'honey',
  'chilli-powder',
  'cooking-ghee',
  'puja-ghee',
]);

function cleanUrlRewrite() {
  const rewrite = (req, _res, next) => {
    if (req.url) {
      const [rawPath, search] = req.url.split('?');
      const pathname = rawPath.replace(/\/+$/, '') || '/';
      const qs = search ? `?${search}` : '';

      if (pathname === '/our-story') {
        req.url = `/our-story.html${qs}`;
      } else if (pathname === '/shop' || pathname === '/shop-the-range') {
        req.url = `/shop.html${qs}`;
      } else if (pathname.startsWith('/products/')) {
        const slug = pathname.slice('/products/'.length).replace(/\.html$/i, '');
        if (PRODUCT_SLUGS.has(slug)) {
          req.url = `/products/${slug}.html${qs}`;
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
    name: 'clean-url-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [cleanUrlRewrite()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ourStory: resolve(import.meta.dirname, 'our-story.html'),
        shop: resolve(import.meta.dirname, 'shop.html'),
        product: resolve(import.meta.dirname, 'product.html'),
        pureCoffee: resolve(import.meta.dirname, 'products/pure-coffee.html'),
        honey: resolve(import.meta.dirname, 'products/honey.html'),
        chilliPowder: resolve(import.meta.dirname, 'products/chilli-powder.html'),
        cookingGhee: resolve(import.meta.dirname, 'products/cooking-ghee.html'),
        pujaGhee: resolve(import.meta.dirname, 'products/puja-ghee.html'),
      },
    },
  },
});
