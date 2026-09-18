# Invalid Image

A small browser-native image transformation workbench for deterministic destructive rendering.

The runtime combines seeded source generation, vector displacement, channel/address transforms, palette quantisation, temporal accumulation, and an adaptive pass scheduler. It can run without an input image, or an image can be dropped onto the canvas.

## Run on Windows

Requires Node.js 20+.

Double-click:

```text
0Play.cmd
```

The launcher starts the local server and opens Invalid Image in your default browser. Keep the launcher terminal open while using the app.

## Run from a terminal

```text
npm start
```

or:

```text
npm run dev
```

The local URL is printed in the terminal and normally opens automatically. Set `NO_OPEN=1` if you do not want the dev server to launch a browser.

Do **not** open `index.html` directly from Explorer. The application uses browser ES modules, which Chromium browsers block when loaded through `file://`. If that happens, the page reports the problem instead of silently remaining at `booting`.

## Checks

```text
npm test
npm run check
```

The rendering core is dependency-free. Browser state is disposable; reproducible state is represented by the seed plus control values.

The interactive viewport uses a 384×384 internal render surface and scales it to the available browser space. This keeps the CPU renderer responsive while preserving the deliberately pixel-oriented presentation.

## Local texture controls

IMC-002 makes the local vector-field path consume explicit resolved micro state instead of reading the overloaded legacy displacement control directly.

The temporary pre-final-UX panel exposes:

- **Texture Motion** (`0..2`) — rate of field-phase evolution. `0` stops field-phase advancement without pausing rendering or temporal feedback.
- **Texture Complexity** (`0..1`) — continuous strength of the local hashed perturbation. It changes amplitude, not the discrete field topology/cell count.
- **Swirl** (`0..1.5`) — local rotational vector strength.
- **Local Warp** (`0..1`) — local sampling displacement amplitude.
- **Directions** (`4`, `8`, `16`) — explicit discrete directional quantisation; time/automation does not alter it.

The current defaults intentionally reproduce the previous local field closely: motion `1`, complexity `0.5` (effective noise amplitude `0.17`), swirl `0.682`, and local warp `0.48`. Legacy/headless callers that omit these new fields receive equivalent compatibility defaults from the resolver.

The old `displacement` control remains temporarily because legacy-auto feedback/drift compatibility still uses it. In Manual macro mode it no longer drives global feedback translation, and with explicit local controls present it does not drive the field pass either.

## Manual global transform controls

IMC-003 adds a separate **Macro Mode** selector. The temporary migration default remains **legacy auto** so the campaign does not silently replace the existing production behaviour before the final UX/default pass. Select **manual** to make the global transform, route, and theme state stationary and explicitly user-addressable.

Manual mode exposes:

- **Global Amount** (`0..1`) — master gain for the manual global transform. `0` neutralises row skew, address stride/destruction and feedback translation without stopping local texture evolution.
- **Skew Pan** (`-1..1`) — signed row-skew coordinate, mapped monotonically to the resolved `-48..48` skew range before Global Amount is applied.
- **Feedback X** (`-8..8`) and **Feedback Y** (`-4..4`) — explicit temporal-history translation in pixels. These no longer follow hidden frame/hash/router drift in Manual mode.
- **Address Amount** (`0..1`) — continuous destructive-address/XOR strength.
- **Stride Pan** (`-1..1`) — signed byte-stride coordinate, mapped against the current render width.
- **Address Identity** (`0..255`) — explicit deterministic XOR identity byte.

In Manual mode the address pass consumes only resolved macro transform values. Row skew, byte stride, destructive address strength/identity and feedback X/Y do not depend on `frame`, router drift, pulse, or route phase. Channel permutation and byte rotation are neutral in this transitional manual path so changing Route cannot smuggle a second address-identity change back into the transform.

`addressing` still acts as the high-level enable/disable switch for the address pass. Global Amount affects feedback translation as well, so `globalAmount = 0` is the stronger neutral-transform contract while local texture motion and temporal retention can remain active.

## Manual theme and route controls

IMC-004 separates pass order from palette/theme identity. In **manual** Macro Mode the temporary panel exposes:

- **Route** (`0..3`) — one of the four existing processing orders. It is discrete by design; the renderer does not crossfade complete routes.
- **Palette Pan** (`0..2`) — continuous coordinate across the three built-in palettes. Fractional positions remap through each neighbouring palette independently and then blend the remapped RGB values, so palettes with different numbers of colour stops interpolate deterministically without rendering a second full route.
- **Theme Amount** (`0..1`) — the palette interpolation-strength control formerly inherited implicitly from `pressure`.
- **alpha-led theme** — explicit alpha-driven palette/alpha variant. When disabled, palette control comes from RGB luminance. Route selection never toggles this variant.

A stationary manual Palette Pan and Route remain stationary across frame advancement even while the local field continues evolving. Changing Route alone cannot move Palette Pan, Theme Amount, or the alpha variant; changing Palette Pan alone cannot change Route.

At integer Palette Pan positions the remapper preserves the prior palette sampling behaviour. The explicit alpha-led variant likewise preserves the old phase-3 alpha behaviour when selected with the same Theme Amount. This keeps the legacy visual vocabulary available while removing route identity as its hidden selector.

**Legacy auto** deliberately keeps the historical router-phase coupling for compatibility until the final transport/default integration work. The manual controls are authoritative only in Manual or Sweep mode; the legacy router may continue evolving internally without affecting their explicit route/theme primitives.

## Macro Pan and sweep transport

IMC-005 adds deterministic coordinated navigation over the explicit global/theme primitives without re-coupling them to renderer time.

- **Macro Pan** (`0..1`) selects a deterministic macro coordinate derived from the seed. Six seeded keyframes create five equal segments. The first keyframe is neutral, so `macroPan = 0` reproduces the explicit primitive controls exactly.
- **Macro Mode** now supports **manual**, **sweep**, and **legacy auto**. Manual leaves Macro Pan under direct user control. Sweep advances the same coordinate explicitly. Legacy Auto preserves the historical router/tape path.
- **Macro Speed** (`-1..1`) is signed. Its unit is normalized pan units per 60 rendered frames. Positive values move forward, negative values reverse, and zero is stationary.
- **hold macro** freezes Sweep transport at the current coordinate while rendering, local texture motion, temporal history, and feedback continue.

Macro Pan linearly interpolates skew, stride, feedback X/Y, address amount/identity, palette position, and theme amount between seeded keyframes. Route is the only discrete transported dimension and switches at each segment midpoint. No full-route crossfade or second complete render path is introduced. `globalAmount`, `paletteAlphaVariant`, and `directions` remain explicit and are not automated by Macro Pan.

Sweep wraps in `[0,1)`. The renderer itself never derives Sweep position from `frame`; `app.js` advances explicit transport state after rendered frames. Releasing hold therefore resumes from the exact held coordinate on the same seeded path, without a reseed or random jump.

The exact transport contract and boundary rules are recorded in [docs/IMC-005-MACRO-TRANSPORT.md](docs/IMC-005-MACRO-TRANSPORT.md).

## Resolved modulation diagnostics

`src/engine/modulation.js` is the dependency-free resolver that classifies renderer state into explicit `micro` and `macro` sections. `renderFrame()` exposes that state as `result.modulation` for tests and diagnostics.

The field renderer consumes the resolved micro section directly. The micro contract includes `textureMotion`, `textureComplexity`, temporal field group/phase, effective `noiseAmount`, attraction, `swirl`, `localWarp`, directions, and temporal feedback amount. `warpAmount` remains as a compatibility alias for `localWarp` while downstream IMC work migrates.

The macro contract exposes transport diagnostics (`macroModeIndex`, `macroPan`, speed, hold, segment position, and keyframe indices) plus `manualMode`, `globalAmount`, `skewPan`, resolved `rowSkew`, `stridePan`, resolved `byteStride`, `addressAmount`, XOR amount/identity diagnostics, resolved feedback X/Y, `routeIndex`, `palettePosition`, `themeAmount`, and `paletteAlphaVariant`. In Manual and Sweep modes all resolved macro fields are frame/router independent for a stationary Macro Pan. The pipeline chooses its pass order from resolved `routeIndex` and the palette pass consumes the three resolved theme fields directly.

Legacy Auto remains deterministic and isolated for compatibility: it can still derive route/theme state from the historical router phase, but Macro Pan transport fields are diagnostic only in that mode and cannot alter the legacy visual path.

`modulationBounds(width)` documents the numeric range of every resolved field and normalises malformed inputs so numeric diagnostics remain finite. Byte-stride bounds depend on render width and are returned by `modulationBounds(width)`.

## Calm motion

`calm motion` is enabled by default. It reduces hard temporal discontinuities without removing the destructive/glitch character:

- resolved local field noise morphs continuously between temporal groups instead of replacing itself every four frames;
- legacy-auto address drift eases between targets and its destructive mask stays stable within a route;
- adaptive routes have a minimum dwell time before switching again;
- route transitions temporarily retain more of the previous frame;
- temporal retention is linear in calm mode, avoiding the brightness pumping of the legacy square-root hold.

Uncheck `calm motion` to recover the harsher stepped local-field timing and legacy transition behaviour. Texture Motion still controls the rate in either mode. In Manual or Sweep macro mode calm continues to affect local field interpolation and temporal retention, but it does not reintroduce hidden global feedback/skew/route/theme modulation.

## Development plans

The current modulation-control campaign is specified in:

- [docs/RAG-MODULATION-CONTROL.md](docs/RAG-MODULATION-CONTROL.md)
- [docs/IMC-005-MACRO-TRANSPORT.md](docs/IMC-005-MACRO-TRANSPORT.md)
