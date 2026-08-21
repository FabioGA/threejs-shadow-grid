// Small deterministic-enough random helpers for the "Randomize" demo button
// and the "+ Add color" palette editor - not used by the library itself.

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

export function randChoice(options) {
  return options[Math.floor(Math.random() * options.length)];
}

export function randColor() {
  return (
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
  );
}

export function randAxisRotation() {
  return Math.random() < 0.35 ? "random" : randInt(0, 360);
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h * 60, s, l];
}

function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + hue / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/** A color that visually contrasts with `hex` - opposite hue, small jitter so it isn't a flat complementary mirror. */
function contraryColor(hex) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + 180 + randRange(-20, 20), s, l);
}

/** A lighter/darker variant of `hex` - same hue and saturation, shifted lightness. */
function shadeColor(hex) {
  const [h, s, l] = hexToHsl(hex);
  const direction = Math.random() < 0.5 ? -1 : 1;
  return hslToHex(h, s, clamp01(l + direction * randRange(0.15, 0.35)));
}

/** Biases toward a color that relates to the palette (contrary hue or a shade of one entry) rather than fully independent. */
function biasedLightColor(palette) {
  if (palette.length && Math.random() < 0.7) {
    const base = randChoice(palette);
    return Math.random() < 0.5 ? contraryColor(base) : shadeColor(base);
  }
  return randColor();
}

// Scheme generator by TheColorAPI (thecolorapi.com), created by Josh Beckman - thanks, Josh!
const SCHEME_MODES = ["monochrome", "analogic", "complement", "analogic-complement", "triad", "quad"];

async function fetchColorScheme(seedHex, mode, count) {
  const url = `https://www.thecolorapi.com/scheme?hex=${seedHex.replace("#", "")}&mode=${mode}&count=${count}&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`thecolorapi responded with ${response.status}`);
  const data = await response.json();
  const colors = data?.colors?.map((c) => c.hex.value);
  if (!Array.isArray(colors) || colors.length < count) throw new Error("thecolorapi returned an incomplete scheme");
  return colors;
}

/**
 * Requests a `count`-color palette from TheColorAPI's scheme generator, seeded
 * by a random color, for better-curated randomness than picking hexes independently.
 * Falls back to independent random colors (today's behavior) if the API is
 * unreachable or errors, so randomization never breaks offline.
 */
export async function randomPalette(count) {
  try {
    return await fetchColorScheme(randColor(), randChoice(SCHEME_MODES), count);
  } catch {
    return Array.from({ length: count }, randColor);
  }
}

/**
 * A fully randomized GridConfig-shaped object, shared by both "Randomize"
 * buttons (full-page background and contained box).
 */
export async function randomGridConfig(models) {
  const arrangement = randChoice(["grid", "random"]);
  const objectSizeIsRange = Math.random() < 0.5;
  const colorsMode = randChoice(["single", "palette", "weighted"]);

  let objectSize;
  if (objectSizeIsRange) {
    const a = randInt(30, 130);
    const b = randInt(30, 130);
    objectSize = { min: Math.min(a, b), max: Math.max(a, b) + randInt(10, 40) };
  } else {
    objectSize = randInt(50, 140);
  }

  // Palette covers every element color plus the background, so the whole
  // scene's colors come from one coherent scheme rather than independent picks.
  const elementColorCount = colorsMode === "single" ? 1 : 3;
  const palette = await randomPalette(elementColorCount + 1);
  const elementColors = palette.slice(0, elementColorCount);
  const backgroundColor = palette[elementColorCount];

  let colors;
  if (colorsMode === "single") {
    colors = elementColors[0];
  } else if (colorsMode === "palette") {
    colors = elementColors;
  } else {
    colors = elementColors.map((color) => ({ color, weight: randInt(1, 10) }));
  }

  return {
    models: models.map((model) => ({ model, weight: randInt(1, 10) })),
    cellSize: randInt(90, 260),
    objectSize,
    arrangement,
    jitter: arrangement === "random" ? randRange(0.15, 0.9) : 0.4,
    rowOffset: randChoice([0, 0, 0, 0.25, 0.5, -0.5, 1 / 3]),
    rotation: { x: randAxisRotation(), y: randAxisRotation(), z: randAxisRotation() },
    colors,
    backgroundColor,
    matchBackground: Math.random() < 0.15,
    hardness: randRange(0, 1),
    shadows: true,
    light: {
      type: randChoice(["sun", "cursor"]),
      cursorHeight: randInt(80, 1200),
      mode: randChoice(["auto", "pointer", "sweep"]),
      style: randChoice(["soft", "medium", "hard"]),
      intensity: randRange(0.5, 1.6),
      autoSweepOnTouch: true,
      sweepSpeed: randRange(0.3, 3),
      ambient: randRange(0.2, 0.7),
      easing: randRange(1, 8),
      color: biasedLightColor(palette),
      hardness: randRange(0, 1),
    },
  };
}
