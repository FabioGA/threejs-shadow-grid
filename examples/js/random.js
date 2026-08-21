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
