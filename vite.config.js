import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  root: 'src-ui',
  base: './',
  build: {
    outDir: '../dist-ui',
    emptyOutDir: true,
  },
});
