import React from 'react'
import { useDeckStore } from '@/store/deckStore'
import { getEdgeDims } from '@/utils/polygon'
import { isWallEdge, numSteps } from '@/utils/stairPlanter'
import { getDeckCorners } from '@/utils/geometry'
import type { WallDirection, BoardDirection } from '@/types/deck'

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function Section({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{title}</h2>
        {badge && <span className="text-[10px] text-slate-400">{badge}</span>}
      </div>
      <div className="px-4 pb-4 space-y-3">{children}</div>
    </section>
  )
}

// Inline label + control row
function Row({ label, unit, children }: { label: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
      {children}
      {unit && <span className="text-xs text-slate-400 shrink-0">{unit}</span>}
    </div>
  )
}

// Compact number input — native but styled
function Num({
  id, value, min = 0.1, max, step = 0.1, onChange,
}: {
  id?: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <input
      id={id}
      type="number"
      min={min} max={max} step={step}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (!isNaN(v) && v >= min) onChange(v)
      }}
      className="w-full h-7 rounded border border-slate-200 bg-white px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-slate-400"
    />
  )
}

// Segment toggle — 2–4 options, looks like a pill group
function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
      {options.map(({ value: v, label }, i) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-1.5 font-medium transition-colors leading-none ${
            value === v
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-500 hover:bg-slate-50'
          } ${i > 0 ? 'border-l border-slate-200' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Compass: 4 cardinal direction buttons in a cross layout
const COMPASS: { value: WallDirection; label: string; col: number; row: number }[] = [
  { value: 'north', label: 'N', col: 2, row: 1 },
  { value: 'west',  label: 'V', col: 1, row: 2 },
  { value: 'east',  label: 'Ö', col: 3, row: 2 },
  { value: 'south', label: 'S', col: 2, row: 3 },
]

function Compass({ value, onChange }: { value: WallDirection; onChange: (v: WallDirection) => void }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(3, 28px)', gridTemplateRows: 'repeat(3, 28px)' }}>
      {COMPASS.map(({ value: v, label, col, row }) => (
        <button
          key={v}
          style={{ gridColumn: col, gridRow: row }}
          onClick={() => onChange(v)}
          className={`rounded text-xs font-semibold transition-colors leading-none ${
            value === v
              ? 'bg-slate-800 text-white'
              : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Inline number input that updates live while typing (for edge lengths)
function EdgeNum({ length, onCommit }: { length: number; onCommit: (v: number) => void }) {
  const [val, setVal] = React.useState(length.toFixed(2))
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
    <input
      type="number" min={0.1} step={0.1}
      value={val}
      onChange={handleChange}
      onBlur={handleBlur}
      className="w-full h-7 rounded border border-slate-200 bg-white px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-slate-400"
    />
  )
}

// Offset nudge control: ← value → ⊙
function NudgeRow({
  value,
  onDecr,
  onIncr,
  onCenter,
}: {
  value: number
  onDecr: () => void
  onIncr: () => void
  onCenter: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onDecr} className="h-7 w-7 rounded border border-slate-200 bg-white text-sm hover:bg-slate-50 transition-colors">←</button>
      <span className="flex-1 text-center text-xs tabular-nums text-slate-600">
        {value >= 0 ? '+' : ''}{value.toFixed(2)} m
      </span>
      <button onClick={onIncr} className="h-7 w-7 rounded border border-slate-200 bg-white text-sm hover:bg-slate-50 transition-colors">→</button>
      <button onClick={onCenter} className="h-7 w-7 rounded border border-slate-200 bg-white text-xs hover:bg-slate-50 transition-colors" title="Centrera">⊙</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

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
  const heightCm = Math.round(store.heightAboveGround * 100)

  return (
    <div className="text-slate-800 pb-4">

      {/* ── STORLEK ────────────────────────────────────── */}
      <Section title="Storlek">
        {!store.customShape && (
          <>
            <Row label="Bredd" unit="m">
              <Num value={store.deckWidth} min={0.5} max={20} onChange={store.setDeckWidth} />
            </Row>
            <Row label="Djup" unit="m">
              <Num value={store.deckDepth} min={0.5} max={10} onChange={store.setDeckDepth} />
            </Row>
            <Row label="Vägglängd" unit="m">
              <Num value={store.wallLength} min={0.5} max={20} onChange={store.setWallLength} />
            </Row>
          </>
        )}
        <Row label="Höjd" unit="cm">
          <Num
            value={heightCm}
            min={10} max={300} step={5}
            onChange={(v) => store.setHeightAboveGround(v / 100)}
          />
        </Row>
        <div className="flex items-start gap-3">
          <span className="text-xs text-slate-500 w-20 shrink-0 pt-1.5">Husvägg mot</span>
          <Compass value={store.wallDirection} onChange={store.setWallDirection} />
        </div>
      </Section>

      {/* ── FORM ────────────────────────────────────────── */}
      <Section title="Form">
        {!store.isDrawingMode && (
          <Segment
            value={store.customShape ? 'custom' : 'rect'}
            onChange={(v) => {
              if (v === 'custom' && !store.customShape) store.startDrawing()
              if (v === 'rect') store.clearCustomShape()
            }}
            options={[
              { value: 'rect',   label: 'Rektangel' },
              { value: 'custom', label: 'Frihand'   },
            ]}
          />
        )}

        {store.isDrawingMode && (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-500 leading-relaxed">
              Klicka i planvyn för att placera hörn — snäpper mot 25 cm-rutnätet.
              Klicka på väggen eller startpunkten för att stänga formen.
            </p>
            <p className="text-xs font-medium text-slate-700">
              {store.drawingPoints.length === 0
                ? 'Placera första hörnet…'
                : `${store.drawingPoints.length} hörn placerade`}
            </p>
            <div className="flex gap-2">
              <button
                disabled={store.drawingPoints.length === 0}
                onClick={store.undoDrawingPoint}
                className="flex-1 h-8 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                ← Ångra
              </button>
              <button
                disabled={store.drawingPoints.length < 3}
                onClick={store.finishDrawing}
                className="flex-1 h-8 rounded bg-slate-800 text-white text-xs hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                Stäng formen
              </button>
            </div>
            <button
              onClick={store.clearCustomShape}
              className="w-full h-8 rounded border border-slate-200 text-xs text-slate-400 hover:bg-slate-50 transition-colors"
            >
              Avbryt
            </button>
          </div>
        )}

        {!store.isDrawingMode && store.customShape && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              {(() => {
                let sideNum = 0
                return edges.map((edge, i) => {
                  if (edge.from.y < 0.001 && edge.to.y < 0.001) return null
                  sideNum++
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-10 shrink-0">Sida {sideNum}</span>
                      <EdgeNum length={edge.length} onCommit={v => store.updateCustomShapeEdge(i, v)} />
                      <span className="text-xs text-slate-400 shrink-0">m</span>
                    </div>
                  )
                })
              })()}
            </div>
            <button
              onClick={store.startDrawing}
              className="w-full h-7 rounded border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Rita om formen
            </button>
          </div>
        )}
      </Section>

      {/* ── TRALL ────────────────────────────────────────── */}
      <Section title="Trall">
        <Segment
          value={store.boardDirection}
          onChange={(v) => store.setBoardDirection(v as BoardDirection)}
          options={[
            { value: 'perpendicular', label: '⊥ Vinkelrätt' },
            { value: 'parallel',      label: '∥ Parallellt'  },
          ]}
        />
      </Section>

      {/* ── TILLBEHÖR ────────────────────────────────────── */}
      <Section title="Tillbehör" badge={`${steps} steg · ${heightCm} cm`}>

        {/* Placing-mode banner */}
        {(store.placingStair || store.placingPlanter) ? (
          <div className="space-y-2">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2 leading-relaxed">
              {store.placingStair
                ? 'Klicka på en kant eller ett hörn i planvyn'
                : 'Klicka på en kant i planvyn'}
            </p>
            <button
              onClick={store.cancelPlacing}
              className="w-full h-8 rounded border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Avbryt
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={store.isDrawingMode || edges.filter(e => !isWallEdge(e)).length === 0}
              onClick={store.startPlacingStair}
              className="h-8 rounded border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              + Trappa
            </button>
            <button
              disabled={store.isDrawingMode}
              onClick={store.startPlacingPlanter}
              className="h-8 rounded border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              + Blomlåda
            </button>
          </div>
        )}

        {/* Stairs */}
        {store.stairs.map((st, idx) => {
          const isCorner = st.kind === 'corner'
          const edge = isCorner ? undefined : edges[st.edgeIndex]
          const isSelected = st.id === store.selectedStairId
          return (
            <div key={st.id}>
              <button
                onClick={() => isSelected ? store.clearSelection() : store.selectStair(st.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded border text-xs transition-colors ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="font-medium">Trappa {idx + 1}</span>
                <span className="text-slate-400">{isCorner ? 'Hörn' : `${st.width.toFixed(1)} m`}</span>
              </button>

              {isSelected && (
                <div className="mt-2 space-y-2 pl-2 border-l-2 border-blue-200 ml-0.5">
                  {!isCorner && (
                    <>
                      <Row label="Bredd" unit="m">
                        <Num
                          value={st.width}
                          min={0.6} max={edge?.length ?? 6} step={0.1}
                          onChange={(v) => store.updateStair(st.id, { width: v })}
                        />
                      </Row>
                      <div className="space-y-1">
                        <span className="text-xs text-slate-500">Position längs kanten</span>
                        <NudgeRow
                          value={st.offset}
                          onDecr={() => store.updateStair(st.id, { offset: st.offset - 0.25 })}
                          onIncr={() => store.updateStair(st.id, { offset: st.offset + 0.25 })}
                          onCenter={() => store.updateStair(st.id, { offset: 0 })}
                        />
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => store.deleteStair(st.id)}
                    className="w-full h-7 rounded border border-red-200 text-xs text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Ta bort
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* Planters */}
        {store.planters.map((pl, idx) => {
          const isSelected = pl.id === store.selectedPlanterId
          const edge = edges[pl.edgeIndex]
          return (
            <div key={pl.id}>
              <button
                onClick={() => isSelected ? store.clearSelection() : store.selectPlanter(pl.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded border text-xs transition-colors ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="font-medium">Blomlåda {idx + 1}</span>
                <span className="text-slate-400">{pl.width.toFixed(1)} m</span>
              </button>

              {isSelected && (
                <div className="mt-2 space-y-2 pl-2 border-l-2 border-blue-200 ml-0.5">
                  <Row label="Längd" unit="m">
                    <Num
                      value={pl.width}
                      min={0.3} max={edge?.length ?? 6} step={0.1}
                      onChange={(v) => store.updatePlanter(pl.id, { width: v })}
                    />
                  </Row>
                  <Row label="Djup" unit="m">
                    <Num
                      value={pl.boxDepth}
                      min={0.2} max={2.0} step={0.05}
                      onChange={(v) => store.updatePlanter(pl.id, { boxDepth: v })}
                    />
                  </Row>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-500">Position längs kanten</span>
                    <NudgeRow
                      value={pl.offset}
                      onDecr={() => store.updatePlanter(pl.id, { offset: pl.offset - 0.25 })}
                      onIncr={() => store.updatePlanter(pl.id, { offset: pl.offset + 0.25 })}
                      onCenter={() => store.updatePlanter(pl.id, { offset: 0 })}
                    />
                  </div>
                  <button
                    onClick={() => store.deletePlanter(pl.id)}
                    className="w-full h-7 rounded border border-red-200 text-xs text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Ta bort
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </Section>
    </div>
  )
}
