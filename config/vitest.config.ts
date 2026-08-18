import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

// Sem @vitejs/plugin-react: o esbuild do Vite ja compila TSX com o runtime
// automatico. O plugin so acrescenta Fast Refresh, que teste nao usa.
export default defineConfig({
  root, // globs de `include` sao relativos a raiz do projeto, nao a config/
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": resolve(root, "src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["config/vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
});
