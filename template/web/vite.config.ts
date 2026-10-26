import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Preload the fonts the first screen uses, so text doesn't reflow when they
 * arrive. Their file names carry a content hash, so they're found in the
 * finished bundle. Change the patterns if you change fonts.
 */
function preloadFonts(patterns: RegExp[]): Plugin {
  return {
    name: "preload-fonts",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        return Object.keys(ctx.bundle)
          .filter((f) => f.endsWith(".woff2") && patterns.some((p) => p.test(f)))
          .map((f) => ({ tag: "link", attrs: { rel: "preload", as: "font", type: "font/woff2", href: `/${f}`, crossorigin: "" }, injectTo: "head" as const }));
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadFonts([/fraunces-latin-300-normal/, /geist-latin-400-normal/])],
  build: { sourcemap: true },
});
