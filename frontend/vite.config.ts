/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local solver bridge (see ../bridge)
const BRIDGE_URL = process.env.BRIDGE_URL ?? 'http://localhost:4000';

export default defineConfig({
    base: './',
    plugins: [react()],
    server: {
        port: 3000,
        // inotify does not cross Docker bind mounts from /mnt/c
        ...(process.env.VITE_POLLING === '1' && { watch: { usePolling: true, interval: 300 } }),
        proxy: {
            '/api': BRIDGE_URL,
        },
    },
    worker: {
        format: 'iife',
    },
    build: {
        outDir: 'dist',
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
    },
});
