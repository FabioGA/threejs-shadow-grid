# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-08-25

### Added

- `rotationOrder` config to control the order the three `rotation` axes combine in (one of Three.js's six `Euler` orders, default `"XYZ"`). The axis applied last (outermost, the first letter) always spins around its own true world axis regardless of what the other two axes are doing - fixed or `"random"` - so e.g. `"ZYX"` keeps a Z (roll/tilt-toward-viewer) rotation reading clean no matter how Y or X vary. Demo: exposed as an `order` control in the playground's rotation section, and the x/y/z axis labels now show their on-screen meaning (pitch/yaw/roll) relative to the fixed camera.

### Security

- Pinned the transitive `esbuild` devDependency (via `tsup`/`vitest`) to `^0.28.1` via `overrides`, fixing a low-severity arbitrary file read advisory in esbuild's dev server ([GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)). Dev-only; not part of the published package.

### Changed

- Releases now publish via a tag-triggered GitHub Actions workflow with npm provenance (`npm publish --provenance`), replacing manual `npm publish` from a local machine.

## [1.4.0] - 2026-08-25

### Added

- GLTF/GLB models, mixable with STL in the same `models` list. A GLTF model keeps its own baked material(s)/textures by default - including full fidelity for multi-material models (e.g. body/wheels/glass), each rendered via its own `InstancedMesh` sharing one per-cell transform - or renders flat-colored via a new per-model `color` override (`{ model, color }`/`{ model, weight, color }`). Format is auto-detected from the URL extension or a `.glb`'s magic bytes; `format` forces it for the one case that can't be sniffed (a raw, non-`.glb`, `.gltf` `ArrayBuffer`).
- `shadowDistance` config to stop objects clipping through the shadow-catching backdrop. Objects previously sat a fixed 1 world-unit in front of it, so a model whose real depth (after scale/rotation) exceeded that gap would visually clip through. Defaults to `"auto"`, sizing the gap to the deepest loaded model's bounding radius plus arrangement jitter, or can be pinned to an explicit CSS-px value.
- Demo: a dev-only error-log overlay (press <kbd>E</kbd>), mirroring `console.error`/`console.warn` on-page - not shipped in the published package.

### Changed

- Demo: bumped the default shadow quality from 1024px to 2048px for crisper out-of-the-box shadows, and dropped the redundant `matchBackground` playground control since the demo already lets you set object colors manually (the library's `matchBackground` option itself is unchanged).

### Fixed

- A single model failing to load (bad URL, unsupported GLTF extension, etc.) no longer blanks the entire grid - that model's grid cells are simply left empty while every other model keeps rendering normally.

## [1.3.0] - 2026-08-24

### Changed

- `maxInstances` now defaults to `"auto"`, sizing the grid to exactly what the container needs (rows x columns it fits, plus `overscan`) instead of a flat `4000` cap - which could under-fill a large container with a small `cellSize` (a visible gap) or hold onto unused headroom on a small one. Pass a number for the previous explicit-hard-cap behavior.

## [1.2.0] - 2026-08-24

### Added

- `adaptivePixelRatio` (default `true`): automatically lowers the live pixel ratio (down to 1x) under sustained frame-time pressure, and raises it back toward `maxPixelRatio` once there's headroom again. A no-op on hardware that never struggles.

### Changed

- The shadow filter now follows `light.style`: `"soft"` keeps `PCFSoftShadowMap`, `"medium"`/`"hard"` switch to the cheaper `PCFShadowMap`, since at their tighter shadow radius the two look effectively the same.
- Antialiasing is now skipped automatically once the effective pixel ratio (`devicePixelRatio` capped by `maxPixelRatio`) reaches 2x or higher, where the framebuffer is already supersampled enough that it buys little.
- Default `light.easing` raised from `4` to `8` for a noticeably snappier, less trailing pointer-follow feel.
- At the default `hardness: 0`, the object material's clearcoat lobe is now fully disabled (was a low nonzero value) for lower GPU cost with no perceptible visual difference on typical low-poly models.
- Rendering now pauses automatically when the tab is backgrounded or the container scrolls out of view, resuming cleanly when either becomes true again.
- A container resize still updates the camera/shadow bounds immediately, but the (potentially expensive) instance grid rebuild is now debounced (~120ms) so an interactive drag-resize or CSS transition doesn't rebuild it on every intermediate frame.
- Demo: added a dev-only frame-time overlay (press <kbd>P</kbd>) for benchmarking; not shipped in the published package.

### Fixed

- Fixed a demo playground bug where a control's displayed value could silently diverge from its actual default on load, so an unrelated change (e.g. tweaking a color) could apply a batch of stale values and visibly "jump" the grid layout.

## [1.1.2] - 2026-08-21

### Changed

- Demo "Randomize" palettes are now generated via [TheColorAPI](https://www.thecolorapi.com) for more coherent color schemes, falling back to the previous independent random pick if the API is unavailable.

## [1.1.1] - 2026-08-21

### Changed

- Updated the hero demo GIF.

## [1.1.0] - 2026-08-21

### Added

- `light.type` ("sun" | "cursor"): an alternative cursor-following spotlight that hovers over the exact pointer/sweep position, so shadows vary per object by distance instead of looking uniform everywhere. `light.cursorHeight` controls how dramatic the effect is.
- Weighted STL model selection: `models` now also accepts `{ model, weight }` entries, mirroring weighted color palettes, so each render's exact instance count is partitioned across models proportionally to weight.

### Changed

- The light now resumes auto-sweep after the pointer idles in `"auto"` mode instead of staying put.
- Smoother transitions between pointer-follow and auto-sweep light behavior.

## [1.0.0] - 2026-08-19

Initial public release.

### Added

- `ShadowGrid` class: an infinitely-tiling grid of STL models with a mouse/touch-driven shadow-casting light.
- Grid configuration: `cellSize`, `objectSize`, `arrangement`, `jitter`, `rowOffset`, `rotation`, `overscan`, `maxInstances`.
- Appearance configuration: `colors` (single, random array, or weighted palette), `hardness`, `backgroundColor` (including a `"transparent"` shadow-only mode), `matchBackground`, `seed`.
- Light configuration: `soft` / `medium` / `hard` presets, plus fine-grained control via `intensity`, `autoSweepOnTouch`, `sweepSpeed`, `ambient`, `easing`, `color`, `hardness`, `shadowMapSize`, and `mode`.
- ESM + CJS + TypeScript type builds via tsup.
