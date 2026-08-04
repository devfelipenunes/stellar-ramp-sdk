
const SCALE = 10n ** 9n;

export function toN(s: string): bigint {
  const [intPart = "0", fracPart = ""] = s.trim().split(".");
  const frac = fracPart.slice(0, 9).padEnd(9, "0");
  const abs = BigInt(intPart.replace(/\D/g, "") || "0") * SCALE + BigInt(frac);
  return s.trim().startsWith("-") ? -abs : abs;
}

export function fromN(n: bigint): string {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(9, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

export const add = (a: string, b: string): string => fromN(toN(a) + toN(b));
export const sub = (a: string, b: string): string => fromN(toN(a) - toN(b));
export const mul = (a: string, b: string): string =>
  fromN((toN(a) * toN(b)) / SCALE);
export const div = (a: string, b: string): string =>
  fromN((toN(a) * SCALE) / toN(b));
export const lt = (a: string, b: string): boolean => toN(a) < toN(b);
export const gte = (a: string, b: string): boolean => toN(a) >= toN(b);
