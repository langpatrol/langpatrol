import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: true,
  dts: false,
  clean: true,
  target: 'es2021',
  outDir: 'dist'
});

