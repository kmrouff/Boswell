import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import claudeProxyHandler from './api/claude.js'
import feedbackHandler from './api/feedback.js'

// Camera access requires a secure context on real devices, so dev serves over
// HTTPS (self-signed) by default. Automated preview tooling can't click through
// a self-signed cert warning, so it opts out via VITE_DISABLE_HTTPS.
const useHttps = process.env.VITE_DISABLE_HTTPS !== 'true'

// Vite only auto-exposes VITE_-prefixed .env vars (to import.meta.env, for
// client code) — ANTHROPIC_API_KEY is deliberately unprefixed so it never
// reaches the client bundle, which means it has to be loaded into
// process.env by hand here for the dev-server-side proxy plugin to read it.
// (No equivalent is needed for the deployed Vercel function — Vercel
// injects its own configured env vars into process.env automatically.)
Object.assign(process.env, loadEnv('development', process.cwd(), ''))

// Mounts the same handlers the api/*.js files export as Vercel functions
// onto Vite's own dev server, so local dev (including phone testing over
// the LAN) proxies through them too instead of calling Anthropic/Slack
// directly from the client — one implementation per endpoint, two runtimes.
const apiProxyDevPlugin = (routes) => ({
  name: 'api-proxy-dev',
  configureServer(server) {
    for (const [path, handler] of Object.entries(routes)) {
      server.middlewares.use(path, (req, res) => {
        handler(req, res).catch((err) => {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || 'Proxy error' }))
        })
      })
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    apiProxyDevPlugin({ '/api/claude': claudeProxyHandler, '/api/feedback': feedbackHandler }),
    ...(useHttps ? [basicSsl()] : []),
  ],
  server: {
    https: useHttps,
  },
})
