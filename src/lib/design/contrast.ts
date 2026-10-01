export type Oklch = { l: number; c: number; h: number };
export type Srgb = { r: number; g: number; b: number };

const OKLCH_PATTERN = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

export function parseOklch(value: string): Oklch {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) throw new Error(`Not a plain oklch(L C H) colour: "${value}"`);
  const [, lightness = "", percent, chroma = "", hue = ""] = match;
  return {
    l: percent === "%" ? Number(lightness) / 100 : Number(lightness),
    c: Number(chroma),
    h: Number(hue),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function encodeSrgb(linear: number): number {
  const clamped = clamp01(linear);
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

/** OKLCH to gamma-encoded sRGB in 0..1 (Ottosson's OKLab matrices), clamped into the sRGB gamut. */
export function oklchToSrgb({ l, c, h }: Oklch): Srgb {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);

  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: encodeSrgb(4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube),
    g: encodeSrgb(-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube),
    b: encodeSrgb(-0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube),
  };
}

function decodeSrgb(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: Srgb): number {
  return 0.2126 * decodeSrgb(r) + 0.7152 * decodeSrgb(g) + 0.0722 * decodeSrgb(b);
}

/** WCAG 2 contrast ratio between two gamma-encoded sRGB colours (1 to 21). */
export function contrastRatio(first: Srgb, second: Srgb): number {
  const [lighter = 0, darker = 0] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** Euclidean distance in OKLab, where about 0.02 is the smallest difference people notice side by side. */
export function oklabDistance(first: Oklch, second: Oklch): number {
  const toLab = ({ l, c, h }: Oklch) => {
    const hue = (h * Math.PI) / 180;
    return { l, a: c * Math.cos(hue), b: c * Math.sin(hue) };
  };
  const one = toLab(first);
  const two = toLab(second);
  return Math.hypot(one.l - two.l, one.a - two.a, one.b - two.b);
}
