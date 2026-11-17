import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const PRESET = process.env.VITE_PRESET ?? "sowmya";
const BRAND_DIR = new URL(`./brands/${PRESET}/`, import.meta.url);

/** Ships brands/<preset>/ (icons, favicon, manifest) at the site root and brands index.html. */
function brand(): Plugin {
  const files: string[] = [];
  const walk = (dir: string, rel = "") => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, `${rel}${f}/`);
      else files.push(`${rel}${f}`);
    }
  };
  const root = decodeURIComponent(BRAND_DIR.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  if (!existsSync(root)) throw new Error(`Missing brand assets: run "node scripts/make-icons.mjs --brand ${PRESET}"`);
  walk(root);
  const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf-8"));
  return {
    name: "clinic-brand",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0]!.replace(/^\//, "");
        if (!files.includes(path)) return next();
        if (path.endsWith(".png")) res.setHeader("Content-Type", "image/png");
        if (path.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
        res.end(readFileSync(join(root, path)));
      });
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: "asset", fileName: f, source: readFileSync(join(root, f)) });
    },
    transformIndexHtml(html) {
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${manifest.name}</title>`)
        .replace(/(name="theme-color" content=")[^"]*/, `$1${manifest.theme_color}`)
        .replace(/(name="apple-mobile-web-app-title" content=")[^"]*/, `$1${manifest.short_name}`)
        .replace(/(name="description" content=")[^"]*/, `$1${manifest.description}`)
        .replace(/html, body \{ background: #[0-9a-f]+; \}/i, `html, body { background: ${manifest.background_color}; }`);
    },
  };
}

const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

// base "./" so the same build works at a domain root, a GitHub Pages sub-path,
// and inside the Android APK (Capacitor serves it from https://localhost/).
export default defineConfig({
  base: "./",
  plugins: [react(), brand()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: "es" },
  // same cross-origin isolation as the phones get (iPhone/web: sw.js)
  server: { headers: ISOLATION },
  preview: { headers: ISOLATION },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});
