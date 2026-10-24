import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0', proxy: { '/api': 'http://localhost:5000', '/socket.io': { target: 'http://localhost:5000', ws: true } } },
  build: {
    // Option A: split big vendor chunks (recommended)
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          socket: ["socket.io-client"],
          state: ["zustand"],
          axios: ["axios"],
        },
      },
    },

    // Option B (optional): increase warning limit if you still see it
    chunkSizeWarningLimit: 1000,
  },
});
