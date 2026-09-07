import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { dockerControlPlugin } from './vite-plugins/dockerControl.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dockerControlPlugin()],
})
