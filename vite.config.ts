import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path for hosted deploys (e.g. GitHub Pages project sites).
// Local/dev defaults to ./ so preview works without env.
const base = process.env.VITE_BASE_PATH ?? './'

export default defineConfig({
  plugins: [react()],
  base,
})
