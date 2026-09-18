# Invalid Image — Modulation Control RAG

Status: canonical implementation plan  
Campaign: IMC — Invalid Image Modulation Control  
Repository: `techrote/invalidimage`  
Baseline reviewed: `main` at `c7cf008db5a978355d70eb947a912dd1c8c84982`

## Contents

- [1. Intent](#1-intent) — Defines the desired local-texture / explicit-macro-control behaviour.
- [2. Evidence from the current implementation](#2-evidence-from-the-current-implementation) — Maps the hidden and overloaded modulation sources in current code.
- [3. Initial plan](#3-initial-plan) — Records the first-pass control strategy.
- [4. Plan review](#4-plan-review) — Identifies coupling, performance, hold-semantics and reproducibility risks.
- [5. Revised architecture](#5-revised-architecture) — Defines base controls, the modulation resolver and renderer consumers.
- [6. Macro Pan contract](#6-macro-pan-contract) — Specifies deterministic manual scrubbing and seeded macro keyframes.
- [7. Default behaviour after the campaign](#7-default-behaviour-after-the-campaign) — Sets the intended living-micro / stationary-macro startup state.
- [8. UX structure](#8-ux-structure) — Groups controls into Local Texture, Global Transform, Theme and Macro Transport.
- [9. Testing and acceptance strategy](#9-testing-and-acceptance-strategy) — Defines resolver, renderer, continuity and performance checks.
- [10. Non-goals](#10-non-goals) — Prevents scope expansion into snapshots, timelines, backend rewrites and unrelated features.
- [11. Revised implementation DAG](#11-revised-implementation-dag) — Orders IMC-001 through IMC-007 and their dependencies.
- [12. Autonomous issue execution contract](#12-autonomous-issue-execution-contract) — Defines branch, PR, CI, merge and blocker handling.
- [13. Definition of campaign success](#13-definition-of-campaign-success) — States the user-visible completion criteria.

## Issue tracker

- [#5 — IMC-001: explicit modulation-state contract and diagnostics](https://github.com/techrote/invalidimage/issues/5)
- [#6 — IMC-002: local texture dynamics](https://github.com/techrote/invalidimage/issues/6)
- [#7 — IMC-003: global transform/address modulation](https://github.com/techrote/invalidimage/issues/7)
- [#8 — IMC-004: palette/theme and route identity](https://github.com/techrote/invalidimage/issues/8)
- [#9 — IMC-005: deterministic Macro Pan and sweep transport](https://github.com/techrote/invalidimage/issues/9)
- [#10 — IMC-006: control-panel UX and production defaults](https://github.com/techrote/invalidimage/issues/10)
- [#11 — IMC-007: continuity, determinism and performance qualification](https://github.com/techrote/invalidimage/issues/11)

## 1. Intent

The target is **not** to make Invalid Image generally slower or less complex.

The desired visual character is:

- retain local, swirling, textural complexity;
- retain fine-grained evolving field motion, grain, interference and temporal texture;
- make whole-screen skew/transform motion explicitly controllable;
- make palette/theme changes explicitly controllable;
- stop hidden automation from unexpectedly replacing the entire visual identity;
- allow the user to set and scrub through the macro states that previously appeared autonomously;
- keep optional automation, but make it an explicit source that can be disabled, held, or swept deliberately.

The governing rule for the revised architecture is:

> **Micro state may evolve continuously. Macro state must only evolve from an explicit macro modulation source.**

A default session should therefore be able to remain in one broad visual family indefinitely while local texture continues to move.

## 2. Evidence from the current implementation

The current UI exposes:

- `seed`
- `autonomy`
- `displacement`
- `memory`
- `pressure`
- `directions`
- `addressing`
- `adaptive`
- `calm`

However, several visible behaviours are still controlled by hidden or overloaded state.

### 2.1 Local field motion

`src/engine/field.js` currently derives:

- field temporal state from `frame`;
- vector-field noise from temporal hash groups;
- attraction from `pressure`;
- spin from `displacement`;
- warp amplitude from `displacement`;
- directional quantisation from `directions`.

This contains the local swirling behaviour the user wants to preserve.

The main architectural problem is that `displacement` simultaneously means both local warp magnitude and local spin strength, so it is not yet a clean creative axis.

### 2.2 Address/global transform behaviour

`src/engine/address.js` currently derives:

- channel order from `seed + phase`;
- byte stride from `memory`;
- row skew from hidden time/hash state plus `pressure`;
- XOR mask identity/strength from hidden route phase plus `pressure`;
- byte rotation from route phase plus `autonomy`.

These are macro/global changes but are not represented as explicit macro controls.

The existing calm implementation eases some of these changes, but it does not make them user-addressable coordinates.

### 2.3 Route and feedback motion

`src/engine/pipeline.js` currently derives:

- pass order from `router.phase`;
- route changes from an energy-driven legacy latch/tape;
- feedback drift from hidden hashed temporal targets in calm mode;
- temporal retention from `memory`;
- palette phase from the **same route phase** used to choose pass order.

That last coupling is particularly important: a route change can also become a whole-screen palette/theme change even if the user only wanted a different processing order.

### 2.4 Palette/theme behaviour

`src/engine/palette.js` selects a palette with:

`PALETTES[phase % PALETTES.length]`

and has additional phase-specific alpha behaviour.

Therefore palette identity is not independently controllable and is tied to hidden router state.

### 2.5 History dependence

Temporal feedback means the exact pixels at a given moment depend partly on previous frames. This campaign does **not** promise that a slider coordinate alone reproduces an identical framebuffer from arbitrary history.

Instead, the required contract is:

- macro controls determine the broad transform/theme state deterministically;
- local animation and history may continue within that broad state;
- `pause` remains the exact-frame freeze;
- a future snapshot/preset feature may capture history if exact visual recall becomes necessary.

## 3. Initial plan

The first-pass plan was:

1. add local texture controls;
2. add a Global Sweep slider;
3. add a Theme Sweep slider;
4. add manual route and palette controls;
5. add a Macro Pan slider that coordinates them;
6. add Hold Theme and Auto Macro;
7. reorganise the UI.

This direction is correct, but implementing it directly in the existing state object would leave the underlying coupling intact.

## 4. Plan review

The initial plan was reviewed against the current code and the following risks were identified.

### 4.1 Risk: a master Macro Pan too early would conceal rather than solve coupling

If `macroPan` directly writes existing `pressure`, `memory`, `phase`, and `displacement`, the user gains another opaque control without gaining independent control of the underlying phenomena.

**Improvement:** define an explicit resolved modulation contract first. Macro Pan becomes a convenience source layered on top of independent macro coordinates.

### 4.2 Risk: current controls are semantically overloaded

Examples:

- `displacement` controls both warp amplitude and spin;
- `pressure` affects field attraction, row skew, XOR strength and palette interpolation;
- `memory` affects temporal persistence and address byte stride;
- `autonomy` affects router behaviour and byte rotation.

**Improvement:** new controls must map to named phenomena. Existing controls can remain as compatibility aliases during migration but must stop being the only source of truth.

### 4.3 Risk: route crossfading is expensive

Rendering multiple full routes simultaneously would approximately multiply CPU work during transitions. The project already required substantial CPU optimisation to become interactive.

**Improvement:** manual route choice remains discrete. Continuous panning should preferentially operate on numeric macro axes such as palette blend, skew, drift, mask amount and transform strength. Any route crossfade must be optional, measured, and budgeted rather than assumed.

### 4.4 Risk: “hold” could accidentally freeze the desired local motion

The user wants a broad look to remain stable while the internal texture continues moving.

**Improvement:** define hold semantics as **macro hold**, not framebuffer pause. Hold freezes resolved macro coordinates while local field phase/history continue.

### 4.5 Risk: frame/time must not remain the hidden source in manual mode

A slider that merely scales an unseen time sweep does not satisfy “pan through at will”.

**Improvement:** in manual macro mode, resolved macro outputs must be deterministic functions of visible controls and seed, not of frame number.

### 4.6 Risk: discrete controls can produce unavoidable jumps

Route order and direction quantisation are discrete dimensions.

**Improvement:** do not auto-modulate `directions` in this campaign. Expose route as a deliberate discrete choice. Use continuous panning for continuous macro dimensions.

### 4.7 Risk: exact visual recall is history-dependent

A “preset” containing only controls would not necessarily reproduce identical pixels after a different feedback history.

**Improvement:** do not conflate macro-state control with exact-frame snapshots. The campaign may expose resolved-state diagnostics, but full framebuffer/history capture is explicitly deferred unless later requested.

## 5. Revised architecture

### 5.1 Explicit modulation layers

Introduce three conceptual layers.

#### A. Base/user controls

Values read from the UI.

These should include, after the campaign:

**Local texture**
- `textureMotion` — rate at which field noise phase advances;
- `textureComplexity` — amplitude/mix of local hashed perturbation without changing topology abruptly;
- `swirl` — local rotational component;
- `localWarp` — local sampling displacement amplitude;
- existing `directions` remains a deliberate user choice.

**Global transform**
- `globalAmount` — master amount for whole-screen/address transforms;
- `skewPan` — signed manual coordinate for row skew;
- `feedbackX` and `feedbackY` — signed global temporal-feedback translation;
- `addressAmount` — destructive address/mask intensity;
- optionally `stridePan` if byte stride proves visually distinct enough to justify a separate control.

**Theme**
- `palettePan` — continuous coordinate through palette space;
- `routeIndex` — explicit discrete route choice;
- `themeAmount` — strength of palette/theme remapping where useful.

**Transport/modulation source**
- `macroMode`: manual / sweep / legacy-auto;
- `macroPan`: 0..1 coordinated macro state coordinate;
- `macroSpeed`: signed sweep speed; zero means stationary;
- `macroHold`: freezes resolved macro state while local texture continues;
- optional sweep mode: forward / reverse / ping-pong can be added only if it remains simple.

Names may be adjusted for UI clarity, but the semantic separation is mandatory.

#### B. Modulation resolver

Add a dependency-free module such as:

`src/engine/modulation.js`

It should convert base controls plus allowed automation state into a resolved structure.

Example shape:

```js
{
  micro: {
    fieldPhase,
    noiseAmount,
    swirl,
    warpAmount
  },
  macro: {
    rowSkew,
    byteStride,
    xorAmount,
    xorIdentity,
    feedbackX,
    feedbackY,
    routeIndex,
    palettePosition,
    themeAmount
  }
}
```

Exact names can differ, but downstream rendering modules should consume resolved values rather than independently inventing hidden modulation from `frame`, `phase`, or overloaded legacy sliders.

The resolver must be deterministic for a given:

- seed;
- explicit controls;
- explicit macro transport state.

Manual macro mode must not depend on frame time.

#### C. Rendering consumers

- `field.js` consumes resolved micro field parameters.
- `address.js` consumes resolved macro transform parameters.
- `palette.js` consumes explicit palette position/theme parameters.
- `pipeline.js` consumes explicit route and feedback translation.
- `app.js` owns UI state and transport advancement.

This makes modulation source selection testable independently of rendering.

### 5.2 Backward compatibility strategy

Do not attempt a single destructive rewrite.

During migration:

- keep current controls readable;
- map old controls into defaults for the new contract where necessary;
- maintain current deterministic tests;
- preserve the current “calm” path until replacement controls are complete;
- remove/deprecate hidden modulation only after equivalent explicit control exists.

The final default may supersede `calm`, but the campaign should not delete working behaviour prematurely.

## 6. Macro Pan contract

`macroPan` is a **coordinated macro-state navigator**, not the sole macro control.

It should operate on top of explicit macro primitives.

Recommended first contract:

- range: `0..1`;
- deterministic for seed + pan;
- manual movement immediately updates macro state;
- stationary pan produces stationary macro outputs;
- moving the pan does not alter local field phase;
- route can change at documented segment boundaries;
- palette should interpolate continuously where practical;
- skew/drift/address values should interpolate continuously;
- no random full-screen theme replacement may occur while `macroPan` is stationary and macro automation is disabled.

The implementation should use stable interpolation between deterministic macro keyframes derived from the seed.

For example:

1. derive a small fixed sequence of macro keyframes from `seed`;
2. each keyframe contains numeric macro coordinates plus a route index;
3. interpolate numeric dimensions between neighbouring keyframes;
4. switch the route only at an intentional boundary or midpoint;
5. expose the currently resolved macro coordinates for debugging/tests.

This preserves generative variety while making the state space scrub-able.

## 7. Default behaviour after the campaign

Recommended defaults:

- local texture animation: ON;
- macro mode: manual;
- macro speed: 0;
- macro hold: effectively true because manual pan is stationary;
- global transform amount: low, around 0.05–0.15;
- theme automation: OFF;
- route: stable;
- palette: stable unless the user moves `palettePan` or `macroPan`;
- current calm temporal retention: ON or folded into the new defaults;
- `directions`: never autonomously modulated.

The renderer should therefore start in a living local texture without whole-screen sweep behaviour.

## 8. UX structure

Reorganise the control panel into explicit groups.

### Local Texture

- Motion
- Complexity
- Swirl
- Local Warp
- Directions
- Memory/persistence if it remains primarily a texture control

### Global Transform

- Amount
- Skew
- Feedback X
- Feedback Y
- Address amount

### Theme

- Palette
- Theme amount
- Route

### Macro Transport

- Macro Pan
- Mode: Manual / Sweep / Legacy Auto
- Sweep Speed
- Hold Macro

The exact CSS/layout is secondary to clarity. Controls should remain compact and usable at the existing viewport sizes.

## 9. Testing and acceptance strategy

### 9.1 Resolver unit tests

The modulation resolver must have direct tests proving:

- manual macro state is frame-independent;
- changing only `textureMotion` does not change resolved macro values;
- changing only `macroPan` does not reset/alter local field phase unexpectedly;
- stationary manual macro controls remain stable for many simulated frames;
- deterministic seed + controls produce deterministic resolved values;
- numeric outputs stay within documented bounds.

### 9.2 Renderer contract tests

Add or extend headless tests proving:

- global amount zero suppresses row skew/global feedback translation/address sweep while local field output can still change;
- palette position is no longer implicitly tied to route phase;
- route choice is explicit when macro automation is disabled;
- legacy mode remains deterministic while it exists.

### 9.3 Temporal continuity tests

Provide a simple frame-delta metric over a short headless run.

The goal is not to enforce one aesthetic number globally; the metric should catch obvious regressions such as:

- a default stationary macro state suddenly changing route;
- a stationary palette changing identity;
- global skew changing while its manual coordinate is unchanged.

### 9.4 Performance

Do not restore the original multi-second-per-frame behaviour.

Any implementation that adds a second complete render path or expensive full-frame blend must include measured justification.

Existing CI remains:

- `npm test`
- `npm run check`

New tests must run within the existing CI environment without browsers or external dependencies unless an issue explicitly justifies an additional lightweight test dependency.

## 10. Non-goals

This campaign does not require:

- WebGL/WebGPU conversion;
- exact framebuffer/history snapshots;
- a full preset library;
- timeline/keyframe editing;
- arbitrary automation graphs;
- MIDI/OSC input;
- new image codecs;
- changing the 384×384 working resolution;
- removing the destructive/glitch aesthetic;
- automatically changing `directions`.

These can be future work if the manual modulation model proves useful.

## 11. Revised implementation DAG

### IMC-001 — Establish explicit modulation-state contract and diagnostics

Foundation. Add `modulation.js` (or equivalent), define micro/macro resolved state, add unit tests and observable resolved values. Preserve current output as closely as practical.

Dependencies: none.

### IMC-002 — Decouple and expose local texture dynamics

Move field motion rate, local noise/complexity, swirl and local warp onto explicit micro controls/resolved values. Preserve the desirable local animated texture with macro state stationary.

Dependencies: IMC-001.

### IMC-003 — Manualise global transform/address modulation

Move row skew, byte stride/transform amount, feedback translation and destructive address amount off hidden frame/hash modulation in manual mode. Introduce explicit global transform controls and zero/low-safe defaults.

Dependencies: IMC-001. May proceed in parallel with IMC-002.

### IMC-004 — Decouple palette/theme and route identity

Make palette position independent from route phase; add continuous palette position/blend where practical and explicit route selection. Macro automation must not change either while manual mode is stationary.

Dependencies: IMC-001. May proceed in parallel with IMC-002/003.

### IMC-005 — Implement deterministic Macro Pan and sweep transport

Build seeded macro keyframes from the primitives introduced by IMC-003/004. Add manual scrub, explicit sweep speed/mode, and macro hold semantics. Local animation remains independent.

Dependencies: IMC-003 and IMC-004.

### IMC-006 — Integrate the control-panel UX and production defaults

Group controls into Local Texture / Global Transform / Theme / Macro Transport, establish defaults matching this document, define reset behaviour, retain a clear route to legacy-auto behaviour if still present, and update user documentation.

Dependencies: IMC-002, IMC-003, IMC-004, IMC-005.

### IMC-007 — Final continuity, determinism and performance qualification

Add campaign-level headless acceptance tests/metrics, audit hidden frame-based macro sources, confirm default macro stability with continuing local motion, verify performance, and remove only superseded compatibility code that is demonstrably no longer required.

Dependencies: IMC-006.

## 12. Autonomous issue execution contract

Every IMC implementation issue must be executable by an autonomous coding agent without needing the original chat.

Each issue must:

1. read this document in full;
2. inspect current `main`, not assume file contents from the issue text;
3. inspect the issue dependency list and verify dependencies are merged;
4. create a focused branch;
5. implement only the issue scope plus strictly necessary repairs;
6. add/modify tests for every behavioural contract changed;
7. run the repository checks locally when execution tooling allows;
8. open a PR with a precise summary and verification evidence;
9. inspect the complete PR diff;
10. repair failures or unintended changes;
11. wait for required automated checks to pass;
12. merge only after required checks pass;
13. verify the merge commit is present on `main`;
14. close the issue only when its acceptance criteria are genuinely satisfied;
15. if blocked, record the exact blocker and evidence in the issue/PR and stop rather than weakening acceptance criteria.

No issue should silently broaden into unrelated renderer redesign.

## 13. Definition of campaign success

The campaign is complete when a user can:

- leave Invalid Image running with rich local swirling/textural motion;
- keep the broad theme/route/global transform effectively stationary indefinitely;
- directly move global transform coordinates with sliders;
- directly choose/scrub palette/theme state;
- explicitly choose route order;
- scrub a deterministic Macro Pan control through broad macro looks;
- optionally auto-sweep that macro coordinate at a user-set rate;
- stop/hold macro evolution without stopping local texture animation;
- return the macro sweep to zero speed and have the macro state remain stable;
- do all of the above without reintroducing severe frame-time regressions or rapid full-screen visual jumps by default.
