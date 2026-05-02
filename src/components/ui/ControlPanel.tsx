import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useDeckStore } from '@/store/deckStore'
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

export default function ControlPanel() {
  const store = useDeckStore()

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
                : `${store.drawingPoints.length} ${store.drawingPoints.length === 1 ? 'hörn' : 'hörn'} placerade`}
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
    </div>
  )
}
