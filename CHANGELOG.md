# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
