/**
 * Per-clinic customisation. Each build is made for one clinic (VITE_PRESET=<key>);
 * everything here is only a starting value — the dentist can change details in Settings.
 */
import type { ClinicProfile } from "./types";

export interface Theme {
  primary: string;
  primaryDark: string; // pressed / headings accent
  primarySoft: string; // tinted backgrounds, chips
  bg: string;
  text: string;
  accent: string;
  surface2: string;
  border: string;
  muted: string;
  // dark-mode variants
  darkPrimary: string;
  darkPrimarySoft: string;
  darkBg: string;
  darkSurface: string;
  darkInk: string; // text on primary buttons in dark mode
  darkSurface2: string;
  darkBorder: string;
  darkMuted: string;
  gradient: [string, string, string]; // logo / icon gradient
  font?: string;
}

export interface Preset {
  key: string;
  appName: string;
  tagline: string;
  welcome?: string;
  specialty: "general" | "orthodontics";
  profile: Partial<ClinicProfile>;
  theme: Theme;
}

const TEAL: Theme = {
  primary: "#0d9488",
  primaryDark: "#0f766e",
  primarySoft: "#ccfbf1",
  bg: "#f4f7fb",
  text: "#0f172a",
  accent: "#2563eb",
  surface2: "#eef2f7",
  border: "#dbe3ec",
  muted: "#5b6b80",
  darkPrimary: "#14b8a6",
  darkPrimarySoft: "#0f3b38",
  darkBg: "#0b1220",
  darkSurface: "#111a2e",
  darkInk: "#04201d",
  darkSurface2: "#17223a",
  darkBorder: "#24314d",
  darkMuted: "#94a3b8",
  gradient: ["#2dd4bf", "#0d9488", "#0f5f59"],
};

// Brace Place brand: lavender & white (from braceplace.in — #5A409B, #4A2C8F, #EFE8FA, gold #F4C542, DM Sans)
const LAVENDER: Theme = {
  primary: "#5a409b",
  primaryDark: "#4a2c8f",
  primarySoft: "#efe8fa",
  bg: "#faf8fd",
  text: "#281e2d",
  accent: "#7a4cb3",
  surface2: "#f3eef9",
  border: "#e4dbf0",
  muted: "#6b5f78",
  darkPrimary: "#b9a8d9",
  darkPrimarySoft: "#33264d",
  darkBg: "#16111e",
  darkSurface: "#211a2c",
  darkInk: "#1b1424",
  darkSurface2: "#2b2238",
  darkBorder: "#3a2f4a",
  darkMuted: "#a99bb8",
  gradient: ["#a68bdc", "#5a409b", "#3b1f66"],
  font: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const PRESETS: Record<string, Preset> = {
  sowmya: {
    key: "sowmya",
    appName: "SmilePilot",
    tagline: "Your AI dental clinic assistant",
    welcome: "Made for Dr. Sowmya B.",
    specialty: "general",
    profile: {
      doctorName: "Dr. Sowmya B.",
      qualification: "BDS",
      clinicName: "Dr. Sowmya B. Dental Care & Oral Surgery Clinic",
      currency: "₹",
      countryCode: "91",
      patientLanguage: "English",
    },
    theme: TEAL,
  },
  abhidnya: {
    key: "abhidnya",
    appName: "Brace Place",
    tagline: "Your smile. Our passion. Our pride.",
    welcome: "Made for Dr. Abhidnya Yeole",
    specialty: "orthodontics",
    profile: {
      doctorName: "Dr. Abhidnya Yeole",
      qualification: "BDS, MDS (Orthodontics & Dentofacial Orthopaedics)",
      clinicName: "Brace Place — Orthodontics & Dental Care",
      address: "Sneh Symphony, 2nd Floor, Balewadi High Street, Baner-Balewadi, Pune 411045",
      phone: "+91 78757 90609",
      email: "braceplace101@gmail.com",
      currency: "₹",
      countryCode: "91",
      patientLanguage: "English",
    },
    theme: LAVENDER,
  },
  generic: {
    key: "generic",
    appName: "SmilePilot",
    tagline: "Your AI dental clinic assistant",
    specialty: "general",
    profile: {},
    theme: TEAL,
  },
};

export const PRESET: Preset = PRESETS[import.meta.env.VITE_PRESET ?? "sowmya"] ?? PRESETS.generic!;
export const IS_ORTHO_PRESET = PRESET.specialty === "orthodontics";

/** Inject the clinic's colours (light + dark) as CSS variables. */
export function applyPresetTheme() {
  const t = PRESET.theme;
  const css = `
:root{--primary:${t.primary};--primary-dark:${t.primaryDark};--primary-soft:${t.primarySoft};--bg:${t.bg};--text:${t.text};--accent:${t.accent};--surface-2:${t.surface2};--border:${t.border};--muted:${t.muted};--brand-1:${t.gradient[0]};--brand-2:${t.gradient[1]};--brand-3:${t.gradient[2]};${t.font ? `--font:${t.font};` : ""}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--primary:${t.darkPrimary};--primary-soft:${t.darkPrimarySoft};--bg:${t.darkBg};--surface:${t.darkSurface};--text:#ece7f3;--primary-ink:${t.darkInk};--surface-2:${t.darkSurface2};--border:${t.darkBorder};--muted:${t.darkMuted};}}
:root[data-theme="dark"]{--primary:${t.darkPrimary};--primary-soft:${t.darkPrimarySoft};--bg:${t.darkBg};--surface:${t.darkSurface};--text:#ece7f3;--primary-ink:${t.darkInk};--surface-2:${t.darkSurface2};--border:${t.darkBorder};--muted:${t.darkMuted};}`;
  const el = document.createElement("style");
  el.id = "preset-theme";
  el.textContent = css;
  document.head.appendChild(el);
}
