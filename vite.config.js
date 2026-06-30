import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl()
  ],
  server: {
    host: true, // Listen on all local network interfaces (so phone can connect)
    port: 5173,
    https: true // Enable local HTTPS for WebXR context requirements
  }
})
