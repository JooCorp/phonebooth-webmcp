import { readFile } from 'node:fs/promises';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

function localFeaturedActions(): Plugin {
  return {
    name: 'phonebooth-local-featured-actions',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/.local/featured-actions.json', async (request, response) => {
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.end();
          return;
        }
        try {
          const body = await readFile(new URL('./.local/featured-actions.json', import.meta.url), 'utf8');
          response.statusCode = 200;
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.setHeader('cache-control', 'no-store');
          response.end(body);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [localFeaturedActions(), tailwindcss(), sveltekit()],
  server: {
    host: true,
    port: 5180,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 5180,
    strictPort: true,
  },
});
