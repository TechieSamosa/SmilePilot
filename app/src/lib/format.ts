import type { Patient } from "../types";

export function ageOf(p: Pick<Patient, "dob" | "age">): number | undefined {
  if (p.dob) {
    const d = new Date(p.dob);
    if (!isNaN(d.getTime())) {
      const n = new Date();
      let a = n.getFullYear() - d.getFullYear();
      if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
      return a;
    }
  }
  return p.age;
}

export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export const fmtTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export const fmtDateTime = (t: number) => `${fmtDate(t)}, ${fmtTime(t)}`;

export function fmtMoney(n: number, currency: string): string {
  return `${currency}${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;
}

/** jsPDF's built-in fonts have no ₹ glyph. */
export function pdfCurrency(c: string): string {
  return c === "₹" ? "Rs. " : c;
}

export function startOfDay(t = Date.now()): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function toLocalInput(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

/** Normalise a phone number into international digits for wa.me / tel links. */
export function intlPhone(phone: string, countryCode: string): string {
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.slice(1);
  d = d.replace(/^0+/, "");
  if (d.length <= 10 && countryCode) return countryCode + d;
  return d;
}

export function whatsappUrl(phone: string, countryCode: string, text: string): string {
  return `https://wa.me/${intlPhone(phone, countryCode)}?text=${encodeURIComponent(text)}`;
}

export function safeFileName(s: string): string {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "file";
}
