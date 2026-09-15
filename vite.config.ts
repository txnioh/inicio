import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function gitValue(format: string, fallback: string) {
  try {
    return execFileSync('git', ['log', '-1', `--format=${format}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

export default defineConfig({
  plugins: [react(), {
    name: 'preview-client-routes',
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const path = request.url?.split('?')[0];
        if (request.headers.accept?.includes('text/html') && path !== '/' && path !== '/index.html') {
          request.url = '/app.html';
        }
        next();
      });
    },
  }],
  define: {
    __BUILD_INFO__: JSON.stringify({
      hash: gitValue('%h', 'local'),
      message: gitValue('%s', 'Local build'),
      date: gitValue('%cI', new Date().toISOString()),
    }),
  },
});
