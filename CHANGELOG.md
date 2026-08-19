# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-19

Initial public release.

### Added

- `ShadowGrid` class: an infinitely-tiling grid of STL models with a mouse/touch-driven shadow-casting light.
- Grid configuration: `cellSize`, `objectSize`, `arrangement`, `jitter`, `rowOffset`, `rotation`, `overscan`, `maxInstances`.
- Appearance configuration: `colors` (single, random array, or weighted palette), `hardness`, `backgroundColor` (including a `"transparent"` shadow-only mode), `matchBackground`, `seed`.
- Light configuration: `soft` / `medium` / `hard` presets, plus fine-grained control via `intensity`, `autoSweepOnTouch`, `sweepSpeed`, `ambient`, `easing`, `color`, `hardness`, `shadowMapSize`, and `mode`.
- ESM + CJS + TypeScript type builds via tsup.
