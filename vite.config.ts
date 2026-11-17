import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    // changeOrigin: false keeps the browser's Host header so the server's CSRF origin check matches
    proxy: {
      "/api": { target: "http://localhost:9100", changeOrigin: false },
      "/plugins": { target: "http://localhost:9100", changeOrigin: false },
    },
  },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src"), "@shared": path.resolve(__dirname, "./shared") },
  },
});
