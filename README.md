# Invalid Image

A small browser-native image transformation workbench for deterministic destructive rendering.

The current runtime combines seeded source generation, vector displacement, channel/address transforms, palette quantisation, temporal accumulation, and an adaptive pass scheduler. It can run without an input image, or an image can be dropped onto the canvas.

## Run

Requires Node.js 20+.

```text
npm run dev
```

Open the printed local URL in a modern browser.

## Checks

```text
npm test
npm run check
```

The project intentionally keeps the rendering core dependency-free. Browser state is disposable; reproducible state is represented by seed plus control values.
