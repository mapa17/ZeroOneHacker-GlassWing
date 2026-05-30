import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, join(__dirname, '..'), '')
  const openaiKey = env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || ''

  return {
    plugins: [
      react(),
      {
        name: 'coach-chat-api',
        configureServer(server) {
          server.middlewares.use('/api/coach-chat', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end('Method not allowed')
              return
            }
            if (!openaiKey) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'OPENAI_API_KEY missing in .env' }))
              return
            }
            let body = ''
            req.on('data', (c) => { body += c })
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body)
                // Match the model the persona pipeline uses (proven to work with this key/gateway).
                const model = env.OPENAI_MODEL || env.VITE_OPENAI_MODEL || 'gpt-5.4-mini'
                const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${openaiKey}`,
                  },
                  body: JSON.stringify({
                    model,
                    temperature: payload.temperature ?? 0.75,
                    response_format: { type: 'json_object' },
                    messages: payload.messages,
                  }),
                })
                const data = await upstream.text()
                res.statusCode = upstream.status
                res.setHeader('Content-Type', 'application/json')
                res.end(data)
              } catch (e) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: e.message }))
              }
            })
          })
        },
      },
    ],
    envDir: join(__dirname, '..'),
  }
})
