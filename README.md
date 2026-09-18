# Invalid Image

A browser-native image transformation workbench for deterministic destructive rendering.

The runtime combines seeded source generation, vector displacement, channel/address transforms, palette quantisation, temporal accumulation, and pass routing. It can run without an input image, or an image can be dropped onto the canvas.

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

## Production control model

The control panel is organised around one core rule:

> Local texture may evolve continuously. Macro state moves only when an explicit macro source moves it.

The production startup state therefore keeps the local field alive while the broad visual identity remains stationary:

- **Macro Mode:** `manual`
- **Macro Pan:** `0`
- **Sweep Speed:** `0`
- **Global Transform Amount:** `0.10`
- stable route and palette until changed explicitly
- local texture motion, complexity, swirl, persistence and calm interpolation active
- no hidden frame-driven skew sweep, feedback drift, route replacement or palette replacement in Manual mode

The historical automated behaviour remains available under **Legacy Auto** rather than being the default.

## Local Texture

These controls shape motion and fine-grained structure without choosing the broad route/theme state:

- **Motion** (`0..2`) — field-phase evolution rate. `0` freezes field-phase advancement without pausing rendering or temporal history.
- **Complexity** (`0..1`) — continuous local hashed perturbation strength.
- **Swirl** (`0..1.5`) — rotational field component.
- **Local Warp** (`0..1`) — local sampling displacement amplitude.
- **Attraction** (`0..1`) — local field attraction strength. This is the renderer-facing meaning of the retained `pressure` state field.
- **Persistence** (`0..1`) — temporal history retention. This is the renderer-facing meaning of the retained `memory` state field.
- **Directions** (`4`, `8`, `16`) — explicit directional quantisation. It is never autonomously modulated.
- **calm interpolation** — smooths local temporal transitions and temporal retention without reintroducing hidden Manual-mode macro motion.

The production defaults keep Motion at `1`, Complexity at `0.5`, Swirl at `0.682`, Local Warp at `0.48`, Attraction at `0.37`, Persistence at `0.73`, Directions at `8`, and calm interpolation enabled.

## Global Transform

These controls define the stationary broad transform primitives used by Manual and Sweep modes:

- **Amount** (`0..1`) — master gain for row skew, stride/address destruction and feedback translation. The production default is deliberately low at `0.10`.
- **Skew** (`-1..1`) — signed row-skew coordinate.
- **Feedback X** (`-8..8`) and **Feedback Y** (`-4..4`) — explicit temporal-history translation in pixels.
- **Address Amount** (`0..1`) — destructive address/XOR strength.
- **Stride** (`-1..1`) — signed byte-stride coordinate.
- **Address Identity** (`0..255`) — deterministic XOR identity byte.
- **address transform** — high-level enable/disable switch for the address pass.

At `Amount = 0`, row skew, address stride/destruction and feedback translation resolve to neutral values while local texture and temporal retention can continue.

A stationary control means stationary resolved macro state. Manual-mode transform values do not derive from `frame`, router drift, pulse, energy latch or route phase.

## Theme

Theme is independent from pass order:

- **Palette Pan** (`0..2`) — continuous position across the three built-in palettes. Fractional positions deterministically interpolate remapped colours without rendering a second full route.
- **Theme Amount** (`0..1`) — palette remap strength.
- **Route** (`0..3`) — explicit discrete processing order.
- **alpha-led theme** — explicit alpha-driven palette variant.

Changing Route does not move Palette Pan or toggle the alpha variant. Changing Palette Pan does not change Route.

The production default starts at Route `0` and Palette Pan `0`, both stationary until the user changes them or explicitly enables Sweep/Legacy Auto.

## Macro Transport

Macro transport coordinates broad appearance without taking ownership of local texture motion.

- **Mode** — `manual`, `sweep`, or `legacy auto`.
- **Macro Pan** (`0..1`) — deterministic coordinate through six seeded macro keyframes. At `0`, explicit primitive controls are reproduced exactly.
- **Sweep Speed** (`-1..1`) — signed movement rate in normalized pan units per 60 rendered frames. `0` is stationary.
- **Hold Macro** — freezes Macro Pan transport while rendering, local texture, history and feedback continue.

Manual mode never advances Macro Pan automatically. Sweep advances it explicitly and wraps in `[0,1)`. Legacy Auto isolates the historical router/tape behaviour.

Continuous transported dimensions interpolate between keyframes: skew, stride, feedback X/Y, address amount/identity, palette position and theme amount. Route is the only discrete transported dimension and changes at documented segment midpoints. No full-route crossfade or second complete render path is used.

The exact transport contract is recorded in [docs/IMC-005-MACRO-TRANSPORT.md](docs/IMC-005-MACRO-TRANSPORT.md).

## Hold Macro vs Pause

These are intentionally different operations:

- **Hold Macro** freezes only explicit Sweep transport. The renderer continues, local field motion continues, temporal history continues, and feedback remains live.
- **Pause** stops rendering new frames.
- **Step** enters the paused state and renders exactly one frame. The Pause button changes to **resume**, so the UI remains consistent with the actual paused state.

## Reset, mutate and image loading

Existing workflows remain available:

- click the canvas or drop an image to load a source;
- **reset** restarts frame/history/router temporal state while preserving every explicit control value, including Macro Pan and Macro Mode;
- **step** renders one paused frame;
- **mutate** advances the seed and the retained attraction/pressure compatibility value, then restarts temporal state.

Changing ordinary modulation controls does not reset local field phase/history. Changing the seed deliberately resets because it changes the deterministic source and keyed state.

## Legacy compatibility

The collapsed **Legacy compatibility** section keeps the historical control surface needed by Legacy Auto:

- **Autonomy**
- **Displacement**
- **adaptive legacy routing**

The old `displacement` value no longer drives the explicit local field path when Local Warp and Swirl are present. It remains available for historical Legacy Auto behaviour. Manual and Sweep modes use the explicit Local Texture, Global Transform, Theme and Macro Transport controls instead.

`memory` and `pressure` are not hidden in this section because they still have live explicit meanings as **Persistence** and **Attraction**.

## Switching modes

Mode transitions are deterministic:

- **Manual → Sweep:** keeps the current Macro Pan and explicit primitive controls; Sweep advances only if Sweep Speed is non-zero and Hold Macro is off.
- **Sweep → Manual:** stops transport at the current Macro Pan coordinate.
- **Manual/Sweep → Legacy Auto:** leaves the explicit Macro Pan value stored but the historical compatibility path becomes authoritative.
- **Legacy Auto → Manual/Sweep:** returns to the same stored Macro Pan and explicit controls; there is no reseed or random transport jump.

Mode changes do not alter Directions or reset local field phase/history.

## Resolved modulation diagnostics

`src/engine/modulation.js` is the dependency-free resolver that classifies renderer state into explicit `micro` and `macro` sections. `renderFrame()` exposes that state as `result.modulation` for tests and diagnostics.

The micro contract includes texture motion/complexity, temporal field group/phase, effective noise amount, attraction, swirl, local warp, directions and temporal feedback retention.

The macro contract includes transport diagnostics plus global amount, skew/row skew, stride/byte stride, address amount and identity, feedback X/Y, route, palette position, theme amount and alpha variant.

In Manual and Sweep modes, resolved macro fields are deterministic functions of seed + explicit controls + Macro Pan. With a stationary pan they are frame/router independent. Legacy Auto remains deterministic but intentionally retains the historical hidden coupling inside that explicitly selected compatibility mode.

`modulationBounds(width)` documents numeric bounds and normalises malformed inputs so resolved numeric diagnostics remain finite.

## Development plans

The modulation-control campaign is specified in:

- [docs/RAG-MODULATION-CONTROL.md](docs/RAG-MODULATION-CONTROL.md)
- [docs/IMC-005-MACRO-TRANSPORT.md](docs/IMC-005-MACRO-TRANSPORT.md)

IMC-006 is the production UX/default integration pass. IMC-007 remains the final continuity, determinism and performance qualification pass.
