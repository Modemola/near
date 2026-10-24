import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // wallet-selector expects Node's `global`.
  define: { global: "globalThis" },
});
