import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// relative base so the build works both locally and at <user>.github.io/<repo>/
export default defineConfig({ base: './', plugins: [react()] })
