# IMC-007 — Final qualification record

Status: final campaign qualification for the Invalid Image modulation-control repair path.

This record qualifies the architecture delivered by IMC-001 through IMC-006. IMC-007 is deliberately an audit/test/documentation pass: it does not add a new creative dimension, change the renderer backend, alter the 384×384 production working resolution, or rewrite renderer hot paths merely for cleanup.

## Hidden macro-modulation audit

The Manual/Sweep renderer-facing macro path is now explicit end to end:

| Behaviour | Manual / Sweep source | Renderer consumer | Legacy Auto isolation |
| --- | --- | --- | --- |
| row skew | `skewPan` + `globalAmount` + Macro Pan | `addressTransform()` via resolved `rowSkew` | historical frame/hash skew remains only in `legacyMacroState()` |
| byte stride | `stridePan` + `globalAmount` + Macro Pan | `addressTransform()` via resolved `byteStride` | historical memory-derived stride remains only in `legacyMacroState()` |
| destructive address amount/identity | explicit address controls + Macro Pan | `addressTransform()` via resolved `addressAmount` / `xorIdentity` | historical phase/frame identity remains only in `legacyMacroState()` |
| feedback translation | explicit Feedback X/Y + `globalAmount` + Macro Pan | `mixFrames()` via resolved `feedbackX` / `feedbackY` | historical drift/hash translation remains only in `legacyMacroState()` |
| route/pass order | explicit Route + deterministic Macro Pan segment | `routeFor(resolved routeIndex)` | energy/tape/router phase drives route only in Legacy Auto |
| palette/theme position | explicit Palette Pan / Theme Amount + Macro Pan | `remapPalette()` via resolved palette/theme values | historical phase coupling remains only in Legacy Auto |
| alpha theme variant | explicit alpha-led theme control | `remapPalette()` via resolved alpha variant | phase-3 alpha behaviour remains only in Legacy Auto |

`address.js` has no frame/router inputs in its manual path. `palette.js` has no route/phase input. `pipeline.js` selects its route from the resolved macro route and sends resolved feedback translation to `mixFrames()`. The Manual/Sweep branch in `modulation.js` resolves macro state from seed + explicit controls + Macro Pan; frame, pulse, router drift, router transition and energy-latch state do not enter those macro calculations.

The router still evolves while Manual mode is active because Legacy Auto compatibility and local temporal retention use it. That does not constitute hidden macro modulation: the explicit macro signature remains unchanged. `feedbackAmount` is a micro/temporal-retention value, not feedback translation.

`directions` remains a direct user value resolved into the micro contract. No transport, router or time source changes it.

## Micro/macro independence audit

Campaign-level tests exercise sequential rendering rather than isolated resolver calls only.

They prove that:

- production Manual defaults preserve one resolved macro visual signature for 300 sequential rendered frames;
- local field group/phase changes over the same run and rendered pixels remain live;
- a held Sweep preserves Macro Pan and resolved macro state for 300 frames while local texture/history continue;
- Manual route and palette remain independent under adversarial frame/router inputs;
- same seed + controls + sweep inputs produce the same resolved macro sequence;
- returning Sweep Speed to zero returns the macro state to exact stability;
- `globalAmount = 0` neutralises row skew, byte stride/address destruction and feedback X/Y translation while micro time continues;
- `directions` remains unchanged throughout qualification fixtures.

Pause semantics remain separate: the application does not render or advance transport while paused. Step intentionally renders one frame while remaining paused.

## Production-default audit

The qualification tests derive the production defaults from `index.html` rather than duplicating a historical fixture. The required startup contract is therefore tested against the controls users actually receive:

- Macro Mode `manual`;
- Macro Pan `0`;
- Sweep Speed `0`;
- low Global Amount (`0.10` at qualification time);
- Route `0` and Palette Pan `0`;
- non-zero local Texture Motion;
- no frame/router-driven change to the resolved macro visual signature.

The application caches the generated source per seed before rendering it, so the production generated-source path is stationary unless the seed changes. Headless qualification mirrors that behaviour by creating one deterministic source and reusing it across the frame sequence.

## Continuity diagnostic

Run:

```text
npm run qualify
```

The diagnostic performs three deterministic headless continuity scenarios:

1. production Manual defaults;
2. an explicitly moving Sweep;
3. the same Sweep after speed is returned to zero.

For every scenario it reports:

- mean and maximum RGB frame delta;
- resolved macro-change count;
- route-change count;
- palette-position-change count;
- final Macro Pan.

The acceptance logic intentionally does **not** impose a universal pixel-delta ceiling. Pixel deltas are allowed—and required—to remain non-zero because local field motion/history should stay alive. Hidden macro motion is detected directly from the exact resolved macro visual signature. The stationary Manual and stopped-Sweep scenarios require zero macro changes; the explicit Sweep requires macro changes.

This separates aesthetic local motion from the regression class this campaign is intended to prevent.

## Performance qualification

`npm run qualify` also times representative dependency-free headless fixtures and reports mean frame time for:

- small: 64×64 for 60 frames;
- medium: 160×120 for 40 frames.

These timings are diagnostic evidence only. CI deliberately does not compare them with a brittle absolute frame-time threshold because hosted-runner load varies.

IMC-007 makes no changes to renderer hot-path modules. The qualified pipeline still renders exactly one selected route per frame, with one pass each through the selected field/address/palette ordering, followed by one temporal mix. Continuous palette movement remains the existing single-route colour-remap interpolation; there is no second complete route render or route crossfade.

Accordingly, the performance risk for this qualification pass is limited to tests/diagnostics executed outside the production render loop. CI runs the diagnostic so accidental future semantic or gross execution failures are visible without turning host timing noise into a pass/fail contract.

## Compatibility and provenance

No protected source/image semantics are changed by IMC-007. Source loading, cached generated-source behaviour, deterministic seeded generation, renderer state ownership and Legacy Auto compatibility remain unchanged.

Legacy Auto is intentionally retained. Its historical hidden modulation is acceptable only because it is an explicit compatibility mode and is not the production default.

No compatibility/dead code was removed during qualification because the audited legacy paths remain required by the documented Legacy Auto mode.

## Campaign success

The final implementation satisfies the canonical RAG success condition: a user can leave Invalid Image running with local swirling/textural motion while the broad theme, route and global transform remain stationary; directly control those macro dimensions; scrub or sweep deterministic Macro Pan; hold/stop macro transport without stopping local texture; and return to a stable zero-speed macro state without introducing a second render route or other severe architectural performance regression.
