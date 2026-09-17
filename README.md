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
