import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Camera access requires a secure context on real devices, so dev serves over
// HTTPS (self-signed) by default. Automated preview tooling can't click through
// a self-signed cert warning, so it opts out via VITE_DISABLE_HTTPS.
const useHttps = process.env.VITE_DISABLE_HTTPS !== 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    https: useHttps,
  },
})
