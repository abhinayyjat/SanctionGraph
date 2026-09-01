import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    watch: {
      usePolling: true,   // Docker bind mounts often don't forward inotify events —
      interval: 300,      // polling makes Vite actually notice file saves on disk.
    },
  },
})