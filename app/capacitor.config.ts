import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.dentalos.clinic",
  appName: "SmilePilot",
  webDir: "dist",
  android: {
    backgroundColor: "#0b1220",
    // Only for testing release builds (DENTALOS_DEBUG_WEBVIEW=1). Never ship with this on.
    webContentsDebuggingEnabled: process.env.DENTALOS_DEBUG_WEBVIEW === "1",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_tooth",
      iconColor: "#14b8a6",
    },
  },
};

export default config;
