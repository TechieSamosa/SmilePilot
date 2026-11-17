import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyPresetTheme, PRESET } from "./preset";

applyPresetTheme();
if (PRESET.theme.font) {
  import("@fontsource/dm-sans/400.css");
  import("@fontsource/dm-sans/600.css");
  import("@fontsource/dm-sans/700.css");
}
document.title = PRESET.appName;
import { isNative } from "./lib/platform";

createRoot(document.getElementById("root")!).render(<App />);

// Offline support for the iPhone / browser install (the Android app ships everything inside the APK).
if ("serviceWorker" in navigator && !isNative() && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW registration failed", e));
  });
}

if (isNative()) {
  import("@capacitor/status-bar")
    .then(({ StatusBar, Style }) => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      StatusBar.setBackgroundColor({ color: dark ? "#0b1220" : "#f4f7fb" }).catch(() => {});
    })
    .catch(() => {});
}
