import { defineConfig } from "vite";

// Ports are allocated in C:\Claude\PORTS.md (frontend 5186, backend 4315).
export default defineConfig({
  base: process.env.VOYAGER_BASE ?? "/", // "/Voyager/" for GitHub Pages
  server: {
    host: "127.0.0.1",
    port: 5186,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${process.env.VOYAGER_API_PORT ?? 4315}` }, // override only for a throwaway test server
  },
  build: {
    rollupOptions: { input: { main: "index.html", studio: "studio.html" } },
  },
});
