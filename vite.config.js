import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'  // Tailwind v4

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),  // Keeps your beautiful styles
    
  ],
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})