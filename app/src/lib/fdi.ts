/** FDI two-digit tooth notation helpers. */

export const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

/** Class id -> FDI number for the tooth-numbering model (32 permanent teeth). */
export const TEETH_MODEL_FDI = [1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((t) => q * 10 + t));

const NAMES: Record<number, string> = {
  1: "central incisor",
  2: "lateral incisor",
  3: "canine",
  4: "first premolar",
  5: "second premolar",
  6: "first molar",
  7: "second molar",
  8: "third molar",
};
const PRIMARY_NAMES: Record<number, string> = {
  1: "central incisor",
  2: "lateral incisor",
  3: "canine",
  4: "first molar",
  5: "second molar",
};
const QUAD: Record<number, string> = {
  1: "upper right",
  2: "upper left",
  3: "lower left",
  4: "lower right",
  5: "upper right",
  6: "upper left",
  7: "lower left",
  8: "lower right",
};

export function toothName(fdi: number): string {
  const q = Math.floor(fdi / 10);
  const t = fdi % 10;
  const primary = q >= 5;
  const n = (primary ? PRIMARY_NAMES : NAMES)[t];
  if (!n || !QUAD[q]) return `Tooth ${fdi}`;
  return `${QUAD[q]} ${primary ? "primary " : ""}${n}`;
}

export function isValidTooth(fdi: number): boolean {
  const q = Math.floor(fdi / 10);
  const t = fdi % 10;
  if (q >= 1 && q <= 4) return t >= 1 && t <= 8;
  if (q >= 5 && q <= 8) return t >= 1 && t <= 5;
  return false;
}
