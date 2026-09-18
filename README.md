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

Do **not** open `index.html` directly from Explorer. The application uses browser ES modules, which Chromium browsers block when loaded through `file://`. If that happens, the page now reports the problem instead of silently remaining at `booting`.

## Checks

```text
npm test
npm run check
```

The rendering core is dependency-free. Browser state is disposable; reproducible state is represented by the seed plus control values.

The interactive viewport uses a 384×384 internal render surface and scales it to the available browser space. This keeps the CPU renderer responsive while preserving the deliberately pixel-oriented presentation.

## Resolved modulation diagnostics

IMC-001 introduces `src/engine/modulation.js`, a dependency-free compatibility resolver that classifies the current overloaded renderer state into explicit `micro` and `macro` sections. `renderFrame()` exposes that resolved state as `result.modulation` for tests and diagnostics; it does not add UI or change the renderer-facing control path yet.

The current compatibility contract intentionally records existing coupling rather than hiding it. For example, `pressure` still contributes to local attraction, address skew/XOR strength, and palette interpolation; route phase still determines both route identity and palette identity. Later IMC issues replace those compatibility sources with independent controls.

`modulationBounds(width)` documents the numeric range of every resolved field. The resolver normalises malformed diagnostic inputs so all numeric outputs remain finite; ordinary UI-valid inputs reproduce the current derived state. The principal fixed ranges are: field blend `0..1`, noise amount `0.17`, attraction/warp/theme amount `0..1`, swirl `0.25..1.15`, row skew `-48..48`, XOR identity/amount/mask `0..255`, feedback X `-8..8`, feedback Y `-4..4`, route `0..3`, palette position `0..2`, and byte rotation `0..7`. Byte-stride bounds depend on render width and are returned by `modulationBounds(width)`.

## Calm motion

`calm motion` is enabled by default. It reduces hard temporal discontinuities without removing the destructive/glitch character:

- displacement noise morphs continuously instead of replacing itself every four frames;
- address drift eases between targets and its destructive mask stays stable within a route;
- adaptive routes have a minimum dwell time before switching again;
- route transitions temporarily retain more of the previous frame;
- temporal retention is linear in calm mode, avoiding the brightness pumping of the legacy square-root hold.

Uncheck `calm motion` to recover the original harsher stepping behaviour.

## Development plans

The current modulation-control campaign is specified in:

- [docs/RAG-MODULATION-CONTROL.md](docs/RAG-MODULATION-CONTROL.md)
