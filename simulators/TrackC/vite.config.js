import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      proxy: {
        // Forward /api/openai/* → https://api.openai.com/* with the key injected
        // server-side so it never appears in the browser bundle.
        '/api/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openai/, ''),
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
        },
      },
    },
  };
});
