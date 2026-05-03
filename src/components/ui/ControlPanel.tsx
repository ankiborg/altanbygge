import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useDeckStore } from '@/store/deckStore'
import { getEdgeDims } from '@/utils/polygon'
import { isWallEdge, numSteps } from '@/utils/stairPlanter'
import { getDeckCorners } from '@/utils/geometry'
import type { WallDirection, BoardDirection } from '@/types/deck'

const WALL_DIRECTIONS: { value: WallDirection; label: string }[] = [
  { value: 'north', label: 'Norr' },
  { value: 'south', label: 'Söder' },
  { value: 'east',  label: 'Öster' },
  { value: 'west',  label: 'Väster' },
]

const BOARD_DIRECTIONS: { value: BoardDirection; label: string }[] = [
  { value: 'perpendicular', label: 'Vinkelrätt mot väggen' },
  { value: 'parallel',      label: 'Parallellt med väggen' },
]

function EdgeLengthInput({ length, onCommit }: { length: number; onCommit: (v: number) => void }) {
  const [val, setVal] = React.useState(length.toFixed(2))
  // Track whether the last length change came from this input so we don't
  // overwrite the field while the user is still typing.
  const selfCommitted = React.useRef(false)

  React.useEffect(() => {
    if (!selfCommitted.current) setVal(length.toFixed(2))
    selfCommitted.current = false
  }, [length])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setVal(raw)
    const n = parseFloat(raw)
    if (!isNaN(n) && n >= 0.1) {
      selfCommitted.current = true
      onCommit(n)
    }
  }

  function handleBlur() {
    const n = parseFloat(val)
    if (isNaN(n) || n < 0.1) setVal(length.toFixed(2))
  }

  return (
    <Input
      type="number" min={0.1} step={0.1}
      value={val}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  )
}

export default function ControlPanel() {
  const store = useDeckStore()

  const shape = store.customShape ?? getDeckCorners({
    wallLength: store.wallLength,
    wallDirection: store.wallDirection,
    deckWidth: store.deckWidth,
    deckDepth: store.deckDepth,
    heightAboveGround: store.heightAboveGround,
    boardDirection: store.boardDirection,
  })
  const edges = getEdgeDims(shape)
  const steps = numSteps(store.heightAboveGround)

  function onNumber(setter: (v: number) => void, min = 0.01) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value)
      if (!isNaN(v) && v >= min) setter(v)
    }
  }

  return (
    <div className="p-5 space-y-6">
      <h1 className="text-base font-semibold tracking-tight">Altanplaneraren</h1>

      {/* Husvägg */}
      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Husvägg
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="wallLength">Vägglängd (m)</Label>
          <Input
            id="wallLength"
            type="number" min={1} max={20} step={0.1}
            value={store.wallLength}
            onChange={onNumber(store.setWallLength, 0.5)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Väggrikting</Label>
          <RadioGroup
            value={store.wallDirection}
            onValueChange={(v) => store.setWallDirection(v as WallDirection)}
            className="grid grid-cols-2 gap-x-4 gap-y-1"
          >
            {WALL_DIRECTIONS.map(({ value, label }) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`wr-${value}`} />
                <Label htmlFor={`wr-${value}`}>{label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </section>

      <hr className="border-border" />

      {/* Altanmått */}
      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Altanmått
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="deckWidth">Bredd (m)</Label>
          <Input
            id="deckWidth"
            type="number" min={0.5} max={20} step={0.1}
            value={store.deckWidth}
            onChange={onNumber(store.setDeckWidth, 0.5)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deckDepth">Djup (m)</Label>
          <Input
            id="deckDepth"
            type="number" min={0.5} max={10} step={0.1}
            value={store.deckDepth}
            onChange={onNumber(store.setDeckDepth, 0.5)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="height">Höjd över mark (cm)</Label>
          <Input
            id="height"
            type="number" min={10} max={300} step={5}
            value={Math.round(store.heightAboveGround * 100)}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 10) store.setHeightAboveGround(v / 100)
            }}
          />
        </div>
      </section>

      <hr className="border-border" />

      {/* Brädor */}
      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Brädor
        </h2>
        <div className="space-y-1.5">
          <Label>Brädriktning</Label>
          <RadioGroup
            value={store.boardDirection}
            onValueChange={(v) => store.setBoardDirection(v as BoardDirection)}
            className="space-y-1"
          >
            {BOARD_DIRECTIONS.map(({ value, label }) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`bd-${value}`} />
                <Label htmlFor={`bd-${value}`}>{label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </section>

      <hr className="border-border" />

      {/* Anpassad form */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Form
        </h2>

        {!store.isDrawingMode && !store.customShape && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Rektangulär form. Rita en anpassad form för L- eller T-former.
            </p>
            <button
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={store.startDrawing}
            >
              Rita anpassad form
            </button>
          </div>
        )}

        {store.isDrawingMode && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Klicka i planvyn för att placera hörn. Snäpper mot 25&nbsp;cm-rutnätet.
              Klicka på väggen (eller nära startpunkten) för att stänga formen.
            </p>
            <p className="text-xs font-medium">
              {store.drawingPoints.length === 0
                ? 'Placera första hörnet…'
                : `${store.drawingPoints.length} hörn placerade`}
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-40"
                disabled={store.drawingPoints.length === 0}
                onClick={store.undoDrawingPoint}
              >
                ← Ångra
              </button>
              <button
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-40"
                disabled={store.drawingPoints.length < 3}
                onClick={store.finishDrawing}
              >
                Stäng formen
              </button>
            </div>
            <button
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              onClick={store.clearCustomShape}
            >
              Avbryt
            </button>
          </div>
        )}

        {!store.isDrawingMode && store.customShape && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Anpassad form · {store.customShape.length} hörn
            </p>

            <div className="space-y-1.5">
              {edges.map((edge, i) => {
                if (edge.from.y < 0.001 && edge.to.y < 0.001) return null
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-14 shrink-0">Sida {i + 1}</span>
                    <EdgeLengthInput
                      length={edge.length}
                      onCommit={v => store.updateCustomShapeEdge(i, v)}
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                  </div>
                )
              })}
            </div>

            <button
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={store.startDrawing}
            >
              Rita om formen
            </button>
            <button
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              onClick={store.clearCustomShape}
            >
              Återställ rektangel
            </button>
          </div>
        )}
      </section>

      <hr className="border-border" />

      {/* Trappor */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Trappor
        </h2>

        <p className="text-xs text-muted-foreground">
          {steps} steg · {Math.round(store.heightAboveGround * 100)} cm höjd
        </p>

        {/* List of existing stairs */}
        {store.stairs.map((st, i) => {
          const isCorner = st.kind === 'corner'
          const edge = isCorner ? undefined : edges[st.edgeIndex]
          const label = isCorner
            ? `Hörn ${st.cornerIndex + 1} · ${st.width.toFixed(1)} m bred`
            : edge
              ? `Kant ${st.edgeIndex + 1} · ${st.width.toFixed(1)} m bred`
              : `Trappa ${i + 1}`
          const isSelected = st.id === store.selectedStairId
          return (
            <div key={st.id} className="space-y-2">
              <button
                className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-input bg-background hover:bg-accent'
                }`}
                onClick={() => store.selectStair(st.id)}
              >
                {label}
              </button>

              {isSelected && (
                <div className="space-y-2 pl-1">
                  {!isCorner && (
                  <div className="space-y-1">
                    <Label htmlFor={`stair-w-${st.id}`}>Bredd (m)</Label>
                    <Input
                      id={`stair-w-${st.id}`}
                      type="number" min={0.6} max={edge?.length ?? 6} step={0.1}
                      value={st.width}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v) && v >= 0.6) store.updateStair(st.id, { width: v })
                      }}
                    />
                  </div>
                  )}
                  {!isCorner && (
                    <div className="space-y-1">
                      <Label>Flytta längs kanten</Label>
                      <div className="flex items-center gap-1.5">
                        <button
                          className="rounded border border-input bg-background px-2.5 py-1 text-sm hover:bg-accent transition-colors"
                          onClick={() => store.updateStair(st.id, { offset: st.offset - 0.25 })}
                        >
                          ←
                        </button>
                        <span className="flex-1 text-center text-xs tabular-nums">
                          {st.offset >= 0 ? '+' : ''}{st.offset.toFixed(2)} m
                        </span>
                        <button
                          className="rounded border border-input bg-background px-2.5 py-1 text-sm hover:bg-accent transition-colors"
                          onClick={() => store.updateStair(st.id, { offset: st.offset + 0.25 })}
                        >
                          →
                        </button>
                        <button
                          className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent transition-colors"
                          title="Centrera"
                          onClick={() => store.updateStair(st.id, { offset: 0 })}
                        >
                          ⊙
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    className="w-full rounded-md border border-red-200 bg-background px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    onClick={() => store.deleteStair(st.id)}
                  >
                    Ta bort
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {store.placingStair ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Klicka på en kant eller ett hörn i planvyn.
            </p>
            <button
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              onClick={store.cancelPlacing}
            >
              Avbryt
            </button>
          </div>
        ) : (
          <button
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-40"
            disabled={store.isDrawingMode || edges.filter(e => !isWallEdge(e)).length === 0}
            onClick={store.startPlacingStair}
          >
            + Lägg till trappa
          </button>
        )}
      </section>

      <hr className="border-border" />

      {/* Blomlådor */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Blomlådor
        </h2>

        {store.planters.map((pl, i) => {
          const edge = edges[pl.edgeIndex]
          const label = edge
            ? `Kant ${pl.edgeIndex + 1} · ${pl.width.toFixed(1)} m lång`
            : `Blomlåda ${i + 1}`
          const isSelected = pl.id === store.selectedPlanterId
          return (
            <div key={pl.id} className="space-y-2">
              <button
                className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-input bg-background hover:bg-accent'
                }`}
                onClick={() => store.selectPlanter(pl.id)}
              >
                {label}
              </button>

              {isSelected && (
                <div className="space-y-2 pl-1">
                  <div className="space-y-1">
                    <Label htmlFor={`pl-w-${pl.id}`}>Längd längs kanten (m)</Label>
                    <Input
                      id={`pl-w-${pl.id}`}
                      type="number" min={0.3} max={edge?.length ?? 6} step={0.1}
                      value={pl.width}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v) && v >= 0.3) store.updatePlanter(pl.id, { width: v })
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pl-d-${pl.id}`}>Bredd ut från altanen (m)</Label>
                    <Input
                      id={`pl-d-${pl.id}`}
                      type="number" min={0.2} max={2.0} step={0.05}
                      value={pl.boxDepth}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v) && v >= 0.2) store.updatePlanter(pl.id, { boxDepth: v })
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Flytta längs kanten</Label>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="rounded border border-input bg-background px-2.5 py-1 text-sm hover:bg-accent transition-colors"
                        onClick={() => store.updatePlanter(pl.id, { offset: pl.offset - 0.25 })}
                      >
                        ←
                      </button>
                      <span className="flex-1 text-center text-xs tabular-nums">
                        {pl.offset >= 0 ? '+' : ''}{pl.offset.toFixed(2)} m
                      </span>
                      <button
                        className="rounded border border-input bg-background px-2.5 py-1 text-sm hover:bg-accent transition-colors"
                        onClick={() => store.updatePlanter(pl.id, { offset: pl.offset + 0.25 })}
                      >
                        →
                      </button>
                      <button
                        className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent transition-colors"
                        title="Centrera"
                        onClick={() => store.updatePlanter(pl.id, { offset: 0 })}
                      >
                        ⊙
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Höjd: {Math.round(store.heightAboveGround * 100)} cm (följer altanhöjden)
                  </p>
                  <button
                    className="w-full rounded-md border border-red-200 bg-background px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    onClick={() => store.deletePlanter(pl.id)}
                  >
                    Ta bort
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {store.placingPlanter ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Klicka på en kant i planvyn för att placera blomlådan.
            </p>
            <button
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              onClick={store.cancelPlacing}
            >
              Avbryt
            </button>
          </div>
        ) : (
          <button
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-40"
            disabled={store.isDrawingMode}
            onClick={store.startPlacingPlanter}
          >
            + Lägg till blomlåda
          </button>
        )}
      </section>
    </div>
  )
}
