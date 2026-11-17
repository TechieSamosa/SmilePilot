import { Capacitor } from "@capacitor/core";
import { PRESET } from "../preset";

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalonePWA = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) s += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(s);
}

/**
 * Share or save a generated file (PDF, backup, dataset).
 * Android app: writes to cache and opens the system share sheet (WhatsApp, Drive, Gmail, Files…).
 * iPhone / browsers: Web Share API with files, falling back to a download.
 */
export async function shareFile(blob: Blob, fileName: string, title: string): Promise<void> {
  if (isNative()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = await blobToBase64(blob);
    const res = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    await Share.share({ title, files: [res.uri], dialogTitle: title });
    return;
  }
  const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  downloadBlob(blob, fileName);
}

/** Save a file into the phone's Documents (Android) or download it (web). */
export async function saveFile(blob: Blob, fileName: string): Promise<string> {
  if (isNative()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: `${PRESET.appName.replace(/\s+/g, "")}/${fileName}`, data, directory: Directory.Documents, recursive: true });
    return `Documents/${PRESET.appName.replace(/\s+/g, "")}/${fileName}`;
  }
  downloadBlob(blob, fileName);
  return fileName;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Open an external link (WhatsApp, phone dialer, maps) outside the app. */
export function openExternal(url: string) {
  if (isNative()) {
    // Capacitor hands non-app URLs to Android (WhatsApp, dialer, browser).
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export async function shareText(text: string, title = PRESET.appName) {
  if (isNative()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text });
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  await navigator.clipboard?.writeText(text);
  alert("Copied to clipboard.");
}
