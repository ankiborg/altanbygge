# MVP Plan – Iteration 1: Grundvisualisering

## Scope

The user fills in a form (wall length, direction, deck width/depth, height,
board direction) and sees a live 2D top-down plan with dimension lines and a
3D perspective view. No save, no export, no multi-corner shapes.

Everything needed is already modelled in `DeckConfig` and `deckStore.ts`.

---

## What to build

### 1. ControlPanel (`src/components/ui/ControlPanel.tsx`)

A vertical form connected to the Zustand store. All changes are instant (no
submit button — the views update live).

| Field | Type | Unit | Component |
|-------|------|------|-----------|
| Vägglängd | number | m | `Input` |
| Väggrikting | enum N/S/E/W | – | `RadioGroup` |
| Altanbredd | number | m | `Input` |
| Altandjup | number | m | `Input` |
| Höjd över mark | number | cm | `Input` (store in m) |
| Brädornas riktning | enum | – | `RadioGroup` |

Shadcn/ui components needed: `Label`, `Input`, `RadioGroup` / `RadioGroupItem`.
Add these with `npx shadcn@latest add label input radio-group`.

---

### 2. Geometry utilities (`src/utils/geometry.ts`)

Pure functions, no React, no Three.js imports.

```ts
// Returns deck corners in world-space metres (origin = wall midpoint)
getDeckCorners(config: DeckConfig): [Point, Point, Point, Point]

// Returns an array of board line segments across the deck surface
getBoardLines(config: DeckConfig, spacingM?: number): [Point, Point][]

// Maps a world-space point to canvas pixel coords given a scale + offset
toCanvas(p: Point, scale: number, offset: Point): Point
```

Board spacing default: 0.145 m (28 mm board + 5 mm gap, standard SW decking).
Wall direction only affects the 3D scene orientation — the 2D canvas always
draws the wall at the top.

---

### 3. PlanView (`src/components/canvas/PlanView.tsx`)

HTML Canvas, redraws on every store change via `useDeckStore`.

**Draw order:**
1. Clear canvas
2. Compute auto-scale to fit canvas with ~10% padding
3. House wall — thick grey line at top centre, spanning `wallLength`
4. Deck outline — grey rectangle below wall
5. Board lines — parallel thin lines inside deck
6. Dimension arrows + labels:
   - width arrow along the top of the deck (= wallLength visual reference)
   - depth arrow on the right side
   - small "↑ N" compass rose in corner

Use a `ResizeObserver` to keep the canvas resolution in sync with its container.

---

### 4. PerspectiveView (`src/components/three/PerspectiveView.tsx`)

Three.js scene initialised once in `useEffect`, rebuilt when store changes.

**Scene objects:**
| Object | Geometry | Material |
|--------|----------|----------|
| Ground | `PlaneGeometry` 20×20 m | `MeshLambertMaterial` light green |
| House wall | `BoxGeometry` wallLength × 3 m × 0.2 m | `MeshLambertMaterial` white |
| Deck platform | `BoxGeometry` deckWidth × height × deckDepth | `MeshLambertMaterial` wood brown |
| Board lines | `LineSegments` on top face | `LineBasicMaterial` dark brown |

**Camera & controls:**
- `PerspectiveCamera` at a 45° isometric-ish angle to start
- `OrbitControls` for free rotation/zoom
- `AmbientLight` + `DirectionalLight`

Wall direction rotates the entire scene group around Y-axis:
`north=0, east=π/2, south=π, west=3π/2`

Cleanup on unmount: `renderer.dispose()`, remove canvas child.
Use a `ResizeObserver` to call `renderer.setSize` when the container resizes.

---

## File changes

```
src/
  components/
    canvas/PlanView.tsx         ← implement
    three/PerspectiveView.tsx   ← implement
    ui/ControlPanel.tsx         ← implement
  utils/
    geometry.ts                 ← new
  types/
    deck.ts                     ← no change needed
  store/
    deckStore.ts                ← no change needed
  App.tsx                       ← minor: add title bar / padding if needed
```

Shadcn/ui components to add (written into `src/components/ui/`):
```
npx shadcn@latest add label input radio-group
```

---

## Build order

1. `geometry.ts` — pure functions, testable in isolation
2. `ControlPanel` — get live state flowing before building views
3. `PlanView` — 2D canvas, verify dimensions are correct
4. `PerspectiveView` — 3D scene last (most setup, least blocking)

---

## Open decisions

| Question | Decision |
|----------|----------|
| Board spacing | 0.145 m (fixed, standard SW 28mm board + 5mm gap) |
| 2D orientation | Wall always at top; `wallDirection` only affects 3D scene rotation |
| 3D starting camera | Perspective from above-right at ~30° elevation, `OrbitControls` from there |
| Height unit in form | Display and enter in **cm**, convert to metres before storing |
| Deck width vs wall length | They are independent: deck can be wider or narrower than the wall |
