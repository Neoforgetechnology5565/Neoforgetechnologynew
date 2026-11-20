import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// During development the UI (port 5173) talks to the engine on 8765; the packaged app serves the built UI from the engine itself.
export default defineConfig({ plugins: [react()], base: "./", server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8765" } }, build: { chunkSizeWarningLimit: 1500 } });
