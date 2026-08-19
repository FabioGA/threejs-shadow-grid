# threejs-shadow-grid

A configurable, infinitely-tiling grid of 3D objects for site backgrounds, built on [Three.js](https://threejs.org). Drop in one or more STL models; the library tiles them to completely fill whatever container you give it, and lights them with a single shadow-casting "sun" that follows the mouse (or sweeps automatically on touch devices), so the shadows shift as people move their cursor around the page.

It's framework-agnostic - a plain TypeScript class with no React/Vue/etc dependency - so it drops into any site.

## Features

- Fills its container completely and re-fills automatically on resize (auto-computed columns/rows based on a cell-size you set, not a fixed count).
- Works as a full-page fixed background or as a smaller contained box; either way the grid stays full-bleed while page/container content scrolls over it.
- Mouse-driven shadow: a single directional light follows the pointer. On touch devices (or before the first pointer move) it drifts naturally between randomized waypoints (speed configurable) instead of sitting static or looping a fixed path.
- Three simplified light presets (`soft` / `medium` / `hard`) so you never have to touch raw Three.js lighting values.
- Physically-based material from soft matte rubber to hard, glossy, and reflective, dialed with a single `hardness` knob.
- Grid or randomized (jittered position) arrangement, plus independent rotation and size controls (fixed or randomized), and per-row horizontal offset for brick/masonry/cascade layouts.
- Single color, or a palette that's randomly assigned per object.
- Loads one or more STL files; each grid cell randomly picks one when you pass several.
- Ships as ESM + CJS + full TypeScript types.

## Install

```bash
npm install threejs-shadow-grid three
```

`three` is a peer dependency (`>=0.150.0`) - install it alongside so your bundler dedupes a single copy.

## Quick start

### Recipe A: full-page fixed background

```html
<div id="bg" style="position: fixed; inset: 0; z-index: -1;"></div>
```

```ts
import { ShadowGrid } from "threejs-shadow-grid";

const grid = new ShadowGrid({
  container: "#bg", // element or CSS selector
  models: "/models/logo-mark.stl",
  cellSize: 220, // px between object centers
  objectSize: 100, // px, each model's largest dimension
  colors: "#8fb8ff",
  backgroundColor: "#0a0a0f",
  light: "medium",
});

// later, e.g. on route change / unmount:
grid.destroy();
```

The wrapper div is given `position: fixed; inset: 0` in your own CSS - that's what makes it a pinned, full-viewport background that stays in place while the rest of the page scrolls over it (`z-index: -1` keeps it behind your content). The library itself only cares about filling *that* element; how you position the element on the page is ordinary CSS, which keeps the library unopinionated about your layout.

### Recipe B: a contained box (e.g. a hero panel, a card)

```html
<div id="hero-visual" style="position: relative; width: 100%; height: 480px; overflow: hidden;"></div>
```

```ts
new ShadowGrid({
  container: "#hero-visual",
  models: ["/models/a.stl", "/models/b.stl"],
  arrangement: "random",
  jitter: 0.5,
  colors: ["#ff9d5c", "#ff5c8a", "#5cc8ff"],
  light: "hard",
});
```

Same class, same API - it just fills whatever box you give it. If that box scrolls internally (`overflow: auto`) the grid stays put behind the scrolling content, the same way the full-page recipe does.

### React

There's no React wrapper package (by design - see "Why framework-agnostic" below), but wrapping it is a few lines:

```tsx
function ShadowGridBackground(props: GridConfig) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const grid = new ShadowGrid({ ...props, container: ref.current });
    return () => grid.destroy();
  }, []);
  return <div ref={ref} style={{ position: "absolute", inset: 0 }} />;
}
```

## Config reference

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | required | Element, or CSS selector, to fill completely. |
| `models` | `string \| string[]` | required | STL URL(s). Multiple models are randomly distributed across cells. |
| `cellSize` | `number` (px) | `220` | Distance between neighboring object centers. Columns/rows are always auto-computed from this + the container size - this is what makes the grid "infinite" (it always fills the space). |
| `objectSize` | `number \| { min, max }` (px) | `120` | Each model is centered and scaled so its largest bounding-box dimension equals this. Lets you mix STL files of wildly different native scales. A fixed number gives every object the same size; `{ min, max }` gives each object an independent random size in that range. |
| `arrangement` | `"grid" \| "random"` | `"grid"` | `"random"` jitters position per cell (amount controlled by `jitter`). |
| `jitter` | `number` (0-1) | `0.4` | Only used when `arrangement` is `"random"`. |
| `rowOffset` | `number` | `0` | Horizontal offset per row, as a fraction of `cellSize` (can be negative). Row `r` shifts by `(r * rowOffset) mod 1` cell widths - `0.5` gives a brick/masonry pattern, `0.25` a 4-row diagonal cascade, `0` a plain grid. Independent of `arrangement`. |
| `rotation` | `number \| "random" \| { x?, y?, z? }` (degrees) | `0` | A bare number/`"random"` rotates only around the vertical (Y) axis. Pass `{ x, y, z }` to control each axis independently - each can itself be a fixed number or `"random"`; omitted axes stay at 0. Independent of `arrangement`. |
| `overscan` | `number` (0-1) | `0.15` | Extra rows/columns rendered past the edges, to avoid pop-in. Rarely needs changing. |
| `maxInstances` | `number` | `4000` | Safety cap on total rendered objects (perf guard for very small cell sizes / huge containers). |
| `colors` | `string \| string[] \| { color, weight }[]` | `"#c9ccd6"` | A single CSS color applies to every object. A plain array (e.g. `["#ff4d4d", "#4d79ff"]`) makes each object independently pick one color at random with equal odds. An array of `{ color, weight }` instead partitions the *exact* current instance count proportionally to weight (e.g. weights 70/30 -> ~70%/30% split, not just a 70/30 chance per object) - see "Weighted palettes" below. Ignored if `matchBackground` is `true`. |
| `hardness` | `number` (0-1) | `0` | Object surface hardness/reflectivity - `0` is soft matte rubber, `1` is hard, glossy, and more reflective. Continuously blends roughness, metalness, and clearcoat. |
| `backgroundColor` | `string \| "transparent"` | `"#0a0a0f"` | `"transparent"` lets the page background show through (objects then only shadow each other slightly, since there's no backdrop to catch shadows). |
| `matchBackground` | `boolean` | `false` | When `true`, forces object color to exactly match `backgroundColor` (ignoring `colors`), so objects are only revealed by their cast shadows. No effect if `backgroundColor` is `"transparent"`. |
| `seed` | `number` | fixed internal default | Seeds the "random" choices (arrangement jitter, palette pick, model pick) so results are reproducible instead of using `Math.random()`. |
| `light` | `LightStyle \| LightConfig` | `"medium"` | See below. |
| `maxPixelRatio` | `number` | `2` | Caps `devicePixelRatio` for performance on high-DPI screens. |
| `shadows` | `boolean` | `true` | Turn off to skip shadow-map rendering entirely (cheaper, flatter look). |

### Weighted palettes

```ts
colors: [
  { color: "#ff4d4d", weight: 50 },
  { color: "#4d79ff", weight: 30 },
  { color: "#4dff88", weight: 20 },
]
```

Weights are relative, not required to sum to 100 - `{ weight: 2 }` next to `{ weight: 1 }` just means twice as many objects get that color. Each rebuild (initial render, resize, or `update()`) partitions that render's *exact* instance count across colors proportionally to weight, then shuffles the assignment across cells - so, unlike a plain `string[]` palette (where each object independently rolls the dice and the split is only approximately even over a large enough count), a weighted palette's split is exact for every render, including small grids.

### Light

Pass a preset string, or an object for finer control - but the raw Three.js lighting API is never exposed, so there's nothing here that requires lighting knowledge:

```ts
light: "soft" // "soft" | "medium" | "hard"

// or:
light: {
  style: "hard",       // soft | medium | hard - default "medium"
  intensity: 1,         // 0-1+, how far the shadow swings with the pointer - default 1
  autoSweepOnTouch: true,  // auto-drift when there's no pointer activity - default true
  sweepSpeed: 1,         // speed multiplier for that drift (higher = faster, more frequent waypoint changes) - default 1
  ambient: 0.45,          // ambient fill light (0-1) so shadows aren't pure black - default 0.45
  easing: 4,              // how quickly the light eases toward the pointer/sweep target - higher = snappier - default 4
  color: "#ffffff",       // tints the light and the shadows it casts - default "#ffffff"
  hardness: 0.5,          // 0 (very soft) - 1 (very crisp) shadow edge; overrides the softness `style` implies - default depends on `style`
  mode: "auto",           // "auto" | "pointer" | "sweep" - pin pointer-follow or auto-sweep instead of the default hybrid - default "auto"
}
```

- **soft**: large, diffuse, low-contrast shadows - gentle and ambient.
- **medium**: balanced, the default.
- **hard**: small, crisp, high-contrast shadows - punchy and graphic.

`hardness` gives continuous control over shadow crispness beyond the three presets - set only `style` and it picks a sensible default hardness (soft: 0.15, medium: 0.5, hard: 0.9); set `hardness` explicitly to fine-tune independently of `style`.

The light starts in "auto sweep" mode and switches to following the pointer the moment it detects real pointer movement (mouse, pen, or a touch drag); moving the pointer off the container drops back to sweeping rather than freezing the shadow in its last spot. That also means touch-only visitors - who typically never fire a hover-style pointer move - simply get the sweep the whole time. The sweep is a continuous drift (layered sine waves at incommensurate frequencies, not a "pick a point and stop there" scheme), so it's always in motion - it never pauses at any point along its path and never repeats an obvious fixed loop; `sweepSpeed` scales how fast it drifts. Set `mode: "pointer"` or `mode: "sweep"` to pin one of those two behaviors instead of the automatic hybrid - handy for previewing the touch experience on a desktop.

## Interactive playground

`examples/demo.html` includes a collapsible "Config playground" panel (top-right) exposing every option in the table above as a live control, plus a generated-code panel that always mirrors the current state - tweak values, watch the background update, then copy the exact `ShadowGrid` config to paste into your own project. To run it locally:

```bash
npm run build   # or npm run dev, in a separate terminal, to rebuild on change
npx http-server . -p 8080   # any static file server serving the repo root works
# open http://localhost:8080/examples/demo.html
```

## Getting STL models

Any binary or ASCII STL works. Good free sources: [Thingiverse](https://www.thingiverse.com), [Printables](https://www.printables.com), or exporting a simple shape from Blender/Figma-to-3D tools. Keep files small (a few hundred KB) since they load in the browser - decimate/simplify highly detailed prints before using them as a tiled background element.

## Performance notes

- Each unique model renders as a single `InstancedMesh`, so a grid of hundreds of objects is one draw call per model, not one per object.
- `maxInstances` caps total objects if a very small `cellSize` on a very large container would otherwise generate an excessive count.
- `maxPixelRatio` (default 2) keeps very high-DPI displays from rendering more pixels than the effect needs.
- Shadows use a single directional light with one shadow map (not a shadow-casting light per object), which is what makes this affordable even with a large grid.

## Roadmap / current scope

v1 ships with STL support only (via `STLLoader`) and auto-fill grid sizing (cell-size driven, not a fixed row/column count) - these were deliberate scope choices to ship a well-tested core first. The internal loader/grid modules are structured so glTF/OBJ support and a fixed-count grid mode can be added without a breaking change to the public API.

## License

MIT
