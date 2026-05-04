import { useDeckStore } from '@/store/deckStore'
import ControlPanel from '@/components/ui/ControlPanel'
import PlanView from '@/components/canvas/PlanView'
import PerspectiveView from '@/components/three/PerspectiveView'

const LAYERS = [
  { level: 1 as const, label: 'Plintar' },
  { level: 2 as const, label: 'Balkar' },
  { level: 3 as const, label: 'Reglar' },
  { level: 4 as const, label: 'Trall' },
]

function LayerBar() {
  const { viewLayer, setViewLayer } = useDeckStore()
  return (
    <div className="h-10 shrink-0 bg-white border-b border-slate-200 flex items-center px-3 gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 pr-2">Visa</span>
      {LAYERS.map(({ level, label }) => (
        <button
          key={level}
          onClick={() => setViewLayer(level)}
          className={`px-3 h-6 rounded text-xs font-medium transition-colors ${
            viewLayer === level
              ? 'bg-slate-800 text-white'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <aside className="w-64 shrink-0 flex flex-col bg-white border-r border-slate-200 z-10 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 shrink-0">
          <h1 className="text-sm font-semibold tracking-tight text-slate-800">Altanplaneraren</h1>
          <p className="text-[10px] text-slate-400 mt-0.5">Planera och visualisera din altan</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ControlPanel />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <LayerBar />
        <div className="flex-[3] min-h-0 border-b border-slate-200">
          <PlanView />
        </div>
        <div className="flex-[2] min-h-0">
          <PerspectiveView />
        </div>
      </div>
    </div>
  )
}
