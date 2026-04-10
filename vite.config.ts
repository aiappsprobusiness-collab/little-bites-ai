import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

const PLACEHOLDER = "__APP_BUILD_VERSION__";

function getBuildVersion(): string {
  let gitHash = "";
  try {
    gitHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    gitHash = "nobuild";
  }
  return `${gitHash}-${Date.now()}`;
}

/** Подставляет версию билда в sw.js при production build, чтобы браузер видел новый SW после каждого деплоя. */
function swVersionPlugin() {
  return {
    name: "sw-version",
    apply: "build",
    writeBundle(options: { dir?: string }) {
      const outDir = options.dir ?? "dist";
      const swPath = path.resolve(outDir, "sw.js");
      try {
        let content = readFileSync(swPath, "utf-8");
        if (content.includes(PLACEHOLDER)) {
          content = content.replace(PLACEHOLDER, getBuildVersion());
          writeFileSync(swPath, content);
        }
      } catch (e) {
        console.warn("[sw-version] Could not patch sw.js:", e);
      }
    },
  };
}

/**
 * GitHub Pages отдаёт только статические файлы: запросы вида /auth/reset-password без файла на диске
 * должны получить копию index.html как 404.html (см. GitHub Pages custom 404).
 */
function githubPagesSpaFallbackPlugin() {
  return {
    name: "github-pages-spa-fallback",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      const indexPath = path.join(outDir, "index.html");
      const notFoundPath = path.join(outDir, "404.html");
      try {
        if (existsSync(indexPath)) {
          copyFileSync(indexPath, notFoundPath);
          console.log("[github-pages-spa-fallback] wrote 404.html (SPA shell)");
        }
      } catch (e) {
        console.warn("[github-pages-spa-fallback] could not copy index.html to 404.html:", e);
      }
    },
  };
}

// https://vitejs.dev/config/
// base MUST be "/" for GitHub Pages custom domain (not "./" or "/little-bites-ai/") — avoids black screen and manifest.json returning HTML
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    fs: {
      // Исключаем папки Capacitor из сканирования
      deny: ['**/android/**', '**/ios/**', '**/.capacitor/**'],
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    // sourcemap: true — для диагностики TDZ в проде; после проверки можно отключить
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'framer-motion': ['framer-motion'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
          ],
          'supabase-vendor': ['@supabase/supabase-js'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    react(),
    swVersionPlugin(),
    githubPagesSpaFallbackPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  // Оптимизация зависимостей
  optimizeDeps: {
    include: ['@emotion/is-prop-valid'],
  },
}));
