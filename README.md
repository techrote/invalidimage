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

IMC-003 adds a separate **Macro Mode** selector. The temporary migration default remains **legacy auto** so this issue does not silently replace the existing production behaviour before the final UX/default pass. Select **manual** to make the global transform state stationary and explicitly user-addressable.

Manual mode exposes:

- **Global Amount** (`0..1`) — master gain for the manual global transform. `0` neutralises row skew, address stride/destruction and feedback translation without stopping local texture evolution.
- **Skew Pan** (`-1..1`) — signed row-skew coordinate, mapped monotonically to the resolved `-48..48` skew range before Global Amount is applied.
- **Feedback X** (`-8..8`) and **Feedback Y** (`-4..4`) — explicit temporal-history translation in pixels. These no longer follow hidden frame/hash/router drift in Manual mode.
- **Address Amount** (`0..1`) — continuous destructive-address/XOR strength.
- **Stride Pan** (`-1..1`) — signed byte-stride coordinate, mapped against the current render width.
- **Address Identity** (`0..255`) — explicit deterministic XOR identity byte.

In Manual mode the address pass consumes only resolved macro transform values. Row skew, byte stride, destructive address strength/identity and feedback X/Y do not depend on `frame`, router drift, pulse, or route phase. Channel permutation and byte rotation are neutral in this transitional manual path so route changes cannot smuggle a second address-identity change back into the transform. Route and palette are still intentionally coupled to the legacy router until IMC-004 separates those theme dimensions.

`addressing` still acts as the high-level enable/disable switch for the address pass. Global Amount affects feedback translation as well, so `globalAmount = 0` is the stronger neutral-transform contract while local texture motion and temporal retention can remain active.

## Resolved modulation diagnostics

`src/engine/modulation.js` is the dependency-free resolver that classifies renderer state into explicit `micro` and `macro` sections. `renderFrame()` exposes that state as `result.modulation` for tests and diagnostics.

The field renderer consumes the resolved micro section directly. The micro contract includes `textureMotion`, `textureComplexity`, temporal field group/phase, effective `noiseAmount`, attraction, `swirl`, `localWarp`, directions, and temporal feedback amount. `warpAmount` remains as a compatibility alias for `localWarp` while downstream IMC work migrates.

The macro contract now also exposes `manualMode`, `globalAmount`, `skewPan`, resolved `rowSkew`, `stridePan`, resolved `byteStride`, `addressAmount`, XOR amount/identity diagnostics, and resolved feedback X/Y. In Manual mode those transform fields are frame-independent. The legacy-auto path remains deterministic and isolated for compatibility.

Theme compatibility coupling intentionally remains visible for IMC-004: route phase still determines both route identity and palette identity. IMC-004 owns that separation; IMC-005 then owns coordinated Macro Pan/sweep transport.

`modulationBounds(width)` documents the numeric range of every resolved field and normalises malformed inputs so numeric diagnostics remain finite. Byte-stride bounds depend on render width and are returned by `modulationBounds(width)`.

## Calm motion

`calm motion` is enabled by default. It reduces hard temporal discontinuities without removing the destructive/glitch character:

- resolved local field noise morphs continuously between temporal groups instead of replacing itself every four frames;
- legacy-auto address drift eases between targets and its destructive mask stays stable within a route;
- adaptive routes have a minimum dwell time before switching again;
- route transitions temporarily retain more of the previous frame;
- temporal retention is linear in calm mode, avoiding the brightness pumping of the legacy square-root hold.

Uncheck `calm motion` to recover the harsher stepped local-field timing and legacy transition behaviour. Texture Motion still controls the rate in either mode. In Manual macro mode calm continues to affect local field interpolation and temporal retention, but it does not reintroduce hidden global feedback/skew modulation.

## Development plans

The current modulation-control campaign is specified in:

- [docs/RAG-MODULATION-CONTROL.md](docs/RAG-MODULATION-CONTROL.md)
