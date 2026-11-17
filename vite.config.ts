import { defineConfig, type Plugin } from "vite";
import fs from "fs";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Capturas del manual para el centro de ayuda (/capturas-manual/…): se sirven en desarrollo y se copian a dist/.
function capturasManual(): Plugin {
  const origen = path.resolve(__dirname, "docs/manual/capturas");
  return {
    name: "capturas-manual",
    configureServer(server) {
      server.middlewares.use("/capturas-manual", (req, res, next) => {
        const f = path.join(origen, path.basename(decodeURIComponent((req.url || "").split("?")[0])));
        if (!f.endsWith(".jpg") || !fs.existsSync(f)) return next();
        res.setHeader("Content-Type", "image/jpeg");
        fs.createReadStream(f).pipe(res);
      });
    },
    writeBundle(opciones) {
      fs.cpSync(origen, path.join(opciones.dir || "dist", "capturas-manual"), { recursive: true });
    },
  };
}

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
  plugins: [react(), capturasManual()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src"), "@shared": path.resolve(__dirname, "./shared") },
  },
});
