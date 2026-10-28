import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // VexFlow embarque la police musicale Bravura (~800 ko) : normal pour une appli locale.
    chunkSizeWarningLimit: 1200,
  },
})
