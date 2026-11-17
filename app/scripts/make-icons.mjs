// Generates every icon for one clinic brand from a single vector design:
// web/PWA (into brands/<brand>/), and optionally the native Android and iOS projects.
//   node scripts/make-icons.mjs --brand sowmya   [--android] [--ios]
//   node scripts/make-icons.mjs --brand abhidnya [--android] [--ios]
import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BRANDS = {
  sowmya: {
    name: "SmilePilot",
    short: "SmilePilot",
    description: "AI dental clinic assistant — patients, X-ray AI, prescriptions and reports.",
    gradient: ["#2dd4bf", "#0d9488", "#0f5f59"],
    shadow: "#042f2c",
    spark: "#ccfbf1",
    bg: "#f4f7fb",
    theme: "#0d9488",
    braces: false,
  },
  abhidnya: {
    name: "Brace Place",
    short: "Brace Place",
    description: "Brace Place clinic app — patients, aligners & braces, X-ray AI, prescriptions.",
    gradient: ["#a68bdc", "#5a409b", "#3b1f66"],
    shadow: "#1f1236",
    spark: "#f1eaff",
    bg: "#faf8fd",
    theme: "#5a409b",
    braces: true,
    wire: "#f4c542",
  },
};

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const key = arg("--brand") ?? "sowmya";
const B = BRANDS[key];
if (!B) throw new Error(`Unknown brand ${key}`);

// Smooth molar silhouette in a 100x100 box.
const TOOTH =
  "M50 24 C43 18.5 31 15.5 24.5 21.5 C17.5 28 18.5 40.5 22 50 C25 58 26.8 66 27.8 75 C28.8 84 31.5 90.5 36 90.5 C41 90.5 42.2 82.5 43.2 74.5 C44.1 67.6 46.2 63 50 63 C53.8 63 55.9 67.6 56.8 74.5 C57.8 82.5 59 90.5 64 90.5 C68.5 90.5 71.2 84 72.2 75 C73.2 66 75 58 78 50 C81.5 40.5 82.5 28 75.5 21.5 C69 15.5 57 18.5 50 24 Z";
const SPARK = (cx, cy, r) =>
  `M${cx} ${cy - r} C${cx + r * 0.16} ${cy - r * 0.16} ${cx + r * 0.16} ${cy - r * 0.16} ${cx + r} ${cy} C${cx + r * 0.16} ${cy + r * 0.16} ${cx + r * 0.16} ${cy + r * 0.16} ${cx} ${cy + r} C${cx - r * 0.16} ${cy + r * 0.16} ${cx - r * 0.16} ${cy + r * 0.16} ${cx - r} ${cy} C${cx - r * 0.16} ${cy - r * 0.16} ${cx - r * 0.16} ${cy - r * 0.16} ${cx} ${cy - r} Z`;

const DEFS = `<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${B.gradient[0]}"/><stop offset="0.55" stop-color="${B.gradient[1]}"/><stop offset="1" stop-color="${B.gradient[2]}"/>
  </linearGradient>
  <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="${B.shadow}" flood-opacity="0.35"/></filter>
</defs>`;

/** tooth (+ orthodontic bracket & archwire for Brace Place) (+ AI sparkle) */
function glyph(scale, color = "#ffffff", { spark = true, shadow = true, mono = false } = {}) {
  const s = scale;
  const o = (100 - 100 * s) / 2;
  const braces = B.braces
    ? mono
      ? `<rect x="42" y="36.5" width="16" height="13" rx="2.6" fill="none" stroke="#000" stroke-width="2.4" opacity="0.0"/>`
      : `<line x1="2" y1="43" x2="98" y2="43" stroke="${B.wire}" stroke-width="2.6" stroke-linecap="round"/>
         <rect x="41.5" y="36" width="17" height="14" rx="2.8" fill="${B.gradient[1]}"/>
         <rect x="44" y="41.6" width="12" height="2.8" rx="1" fill="${B.wire}"/>`
    : "";
  const sparkColor = color === "#ffffff" ? B.spark : color;
  return `<g transform="translate(${o} ${o + 2 * s}) scale(${s})" ${shadow ? 'filter="url(#s)"' : ""}>
    <path d="${TOOTH}" fill="${color}"/>
    ${braces}
    ${spark ? `<path d="${SPARK(83, 15, 9)}" fill="${sparkColor}"/><path d="${SPARK(93, 31, 4.5)}" fill="${sparkColor}"/>` : ""}
  </g>`;
}

const svg = (body, { bg = true, rx = 0 } = {}) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">${DEFS}${bg ? `<rect width="100" height="100" rx="${rx}" fill="url(#g)"/>` : ""}${body}</svg>`,
  );

const png = (buf, size, out) => {
  mkdirSync(join(out, ".."), { recursive: true });
  return sharp(buf, { density: 600 }).resize(size, size).png().toFile(out);
};

const full = svg(glyph(0.6));
const rounded = svg(glyph(0.6), { rx: 22 });
const maskable = svg(glyph(0.48));
const fgOnly = svg(glyph(0.5), { bg: false });
const bgOnly = svg("", { bg: true });
const mono = svg(glyph(0.5, "#ffffff", { shadow: false, mono: true }), { bg: false });
const notif = svg(glyph(0.86, "#ffffff", { spark: false, shadow: false, mono: true }), { bg: false });

const jobs = [];

// ---- web / PWA → brands/<brand>/
const W = `brands/${key}`;
jobs.push(png(rounded, 192, `${W}/icons/icon-192.png`), png(rounded, 512, `${W}/icons/icon-512.png`));
jobs.push(png(maskable, 512, `${W}/icons/icon-maskable-512.png`));
jobs.push(sharp(full, { density: 600 }).resize(180, 180).flatten({ background: B.theme }).png().toFile(`${W}/icons/apple-touch-icon.png`));
jobs.push(png(rounded, 64, `${W}/favicon.png`));
mkdirSync(W, { recursive: true });
writeFileSync(
  `${W}/manifest.webmanifest`,
  JSON.stringify(
    {
      name: B.name,
      short_name: B.short,
      description: B.description,
      start_url: "./",
      scope: "./",
      display: "standalone",
      orientation: "portrait",
      background_color: B.bg,
      theme_color: B.theme,
      categories: ["medical", "health", "productivity"],
      icons: [
        { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  ),
);

// ---- iOS (native project)
if (process.argv.includes("--ios") && existsSync("ios/App/App/Assets.xcassets")) {
  jobs.push(
    sharp(full, { density: 600 }).resize(1024, 1024).flatten({ background: B.theme }).png().toFile("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
  );
  const splash = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="2732" height="2732">${DEFS}<rect width="100" height="100" fill="url(#g)"/>${glyph(0.3)}</svg>`,
  );
  for (const n of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"])
    jobs.push(sharp(splash, { density: 300 }).resize(2732, 2732).png().toFile(`ios/App/App/Assets.xcassets/Splash.imageset/${n}`));
  const { readFileSync } = await import("node:fs");
  const plist = "ios/App/App/Info.plist";
  writeFileSync(plist, readFileSync(plist, "utf-8").replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${B.short}$2`));
}

// ---- Android (native project)
const RES = "android/app/src/main/res";
if (process.argv.includes("--android") && existsSync(RES)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = `${RES}/mipmap-${d}`;
    jobs.push(png(rounded, 48 * k, `${dir}/ic_launcher.png`));
    jobs.push(
      sharp(full, { density: 600 })
        .resize(48 * k, 48 * k)
        .composite([{ input: Buffer.from(`<svg width="${48 * k}" height="${48 * k}"><circle cx="${24 * k}" cy="${24 * k}" r="${24 * k}"/></svg>`), blend: "dest-in" }])
        .png()
        .toFile(`${dir}/ic_launcher_round.png`),
    );
    jobs.push(png(fgOnly, 108 * k, `${dir}/ic_launcher_foreground.png`));
    jobs.push(png(bgOnly, 108 * k, `${dir}/ic_launcher_background.png`));
    jobs.push(png(mono, 108 * k, `${dir}/ic_launcher_monochrome.png`));
    jobs.push(png(notif, 24 * k, `${RES}/drawable-${d}/ic_stat_tooth.png`));
  }
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  writeFileSync(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, adaptive);
  writeFileSync(`${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive);
  writeFileSync(
    `${RES}/values/ic_launcher_background.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${B.theme.toUpperCase()}</color>\n</resources>\n`,
  );
  for (const dir of readdirSync(RES).filter((x) => x.startsWith("drawable"))) {
    const f = `${RES}/${dir}/splash.png`;
    if (!existsSync(f)) continue;
    jobs.push(
      sharp(f)
        .metadata()
        .then(async ({ width, height }) => {
          const g = Math.round(Math.min(width, height) * 0.38);
          const glyphPng = await sharp(svg(glyph(0.9), { bg: false }), { density: 600 }).resize(g, g).png().toBuffer();
          const bgPng = await sharp(
            Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${DEFS.replace('x2="1" y2="1"', 'x2="0" y2="1"')}<rect width="100%" height="100%" fill="url(#g)"/></svg>`),
          )
            .png()
            .toBuffer();
          await sharp(bgPng).composite([{ input: glyphPng, gravity: "center" }]).png().toFile(f + ".tmp");
          renameSync(f + ".tmp", f);
        }),
    );
  }
  // launcher label
  const strings = `${RES}/values/strings.xml`;
  if (existsSync(strings)) {
    const { readFileSync } = await import("node:fs");
    writeFileSync(
      strings,
      readFileSync(strings, "utf-8")
        .replace(/<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${B.short}</string>`)
        .replace(/<string name="title_activity_main">[^<]*<\/string>/, `<string name="title_activity_main">${B.short}</string>`),
    );
  }
}

await Promise.all(jobs);
console.log(`✓ ${key}: ${jobs.length} icon files written`);
