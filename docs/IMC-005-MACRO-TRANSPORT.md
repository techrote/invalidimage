# IMC-005 — Macro Pan transport contract

This document records the implemented transport semantics for IMC-005. The canonical campaign architecture remains in `RAG-MODULATION-CONTROL.md`.

## Modes

- **Manual** — `macroPan` is user-owned and stationary until explicitly changed.
- **Sweep** — the application advances `macroPan` using `macroSpeed`; the renderer itself never derives sweep position from `frame`.
- **Legacy Auto** — preserves the historical router/tape/energy-driven macro path. Macro Pan coordinates are diagnostic only and do not alter the legacy visual state.

Manual and Sweep both resolve macro appearance from the same deterministic seed + Macro Pan path layered over the explicit IMC-003/004 primitives.

## Macro Pan path

`macroPan` is clamped to `0..1` for resolution. Each seed produces exactly six deterministic macro keyframes, which create five equal pan segments.

Keyframe zero is a neutral trim. Therefore `macroPan = 0` preserves the explicit controls exactly. Later keyframes contain deterministic offsets for:

- skew pan;
- stride pan;
- feedback X/Y;
- address amount;
- address/XOR identity;
- palette position;
- theme amount;
- route offset.

Continuous values interpolate linearly between neighbouring keyframes and are clamped to their normal primitive bounds. Route is discrete and switches at the exact midpoint of each segment. There is no full-route crossfade and no second complete render path.

`paletteAlphaVariant`, `globalAmount`, and `directions` are not automated by Macro Pan. They remain explicit controls.

The resolver exposes `macroPan`, segment position, keyframe indices, mode index, speed, and hold state in `result.modulation.macro` for diagnostics and tests.

## Sweep rule

`macroSpeed` is signed and clamped to `-1..1`. Its unit is **normalized pan units per 60 rendered frames**.

The application advances Sweep transport after each rendered frame:

`nextPan = wrap01(macroPan + macroSpeed * renderedFrames / 60)`

Sweep wraps in `[0,1)`. Positive values move forward; negative values move in reverse; zero is stationary. Manual and Legacy Auto do not advance Macro Pan through this transport helper.

Because transport advancement is explicit application state, the renderer remains deterministic for a given seed + controls + Macro Pan and cannot hide a frame-driven macro sweep.

## Hold rule

`macroHold` stops Sweep advancement at the current coordinate. It does not pause rendering, local field time, temporal history, or feedback. Releasing hold continues from the same held coordinate using the same seeded path; there is no reseed or random jump.

The global **pause** button remains the separate exact-frame/render pause.

## Compatibility and source semantics

Legacy Auto is intentionally retained and isolated. Existing source loading/generation, framebuffer history, external-image handling, and destructive-render provenance semantics are unchanged by IMC-005.
