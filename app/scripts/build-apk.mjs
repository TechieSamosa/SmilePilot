// Builds the signed release APK and copies it to app/release/SmilePilot-<version>.apk
// Usage: npm run android:apk   (runs web build + cap sync first)
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const env = { ...process.env };
const home = os.homedir();
if (!env.ANDROID_HOME) {
  for (const p of ["C:/Android/sdk", join(home, "AppData/Local/Android/Sdk"), join(home, "Android/Sdk"), join(home, "Library/Android/sdk")])
    if (existsSync(p)) {
      env.ANDROID_HOME = p;
      break;
    }
}
if (!env.JAVA_HOME) {
  const guess = join(home, "AppData/Local/Programs/Eclipse Adoptium/jdk-21.0.6.7-hotspot");
  if (existsSync(guess)) env.JAVA_HOME = guess;
}
// local.properties is machine-specific (gitignored): create it from ANDROID_HOME when missing
if (env.ANDROID_HOME && !existsSync("android/local.properties")) {
  writeFileSync("android/local.properties", `sdk.dir=${env.ANDROID_HOME.replace(/\\/g, "/")}\n`);
}
const gradlew = process.platform === "win32" ? join(process.cwd(), "android", "gradlew.bat") : "./gradlew";
execSync(`"${gradlew}" assembleRelease --no-daemon`, { cwd: "android", stdio: "inherit", env });

const src = "android/app/build/outputs/apk/release/app-release.apk";
const unsigned = "android/app/build/outputs/apk/release/app-release-unsigned.apk";
mkdirSync("release", { recursive: true });
const out = `release/SmilePilot-${pkg.version}.apk`;
if (existsSync(src)) {
  copyFileSync(src, out);
  console.log(`\n✓ Signed APK: app/${out}`);
} else if (existsSync(unsigned)) {
  copyFileSync(unsigned, out.replace(".apk", "-UNSIGNED.apk"));
  console.log("\n! No keystore found (~/.dentalos/keystore.properties) — produced an UNSIGNED APK that cannot be installed.");
} else {
  throw new Error("APK not found");
}
