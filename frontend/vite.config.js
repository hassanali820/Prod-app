import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` proxies /api to a backend running on localhost:4000.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:4000" } }
});
