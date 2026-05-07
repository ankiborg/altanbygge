import ControlPanel from '@/components/ui/ControlPanel'
import PlanView from '@/components/canvas/PlanView'
import PerspectiveView from '@/components/three/PerspectiveView'
import { useDeckStore } from '@/store/deckStore'

export default function App() {
  const viewLayer = useDeckStore(s => s.viewLayer)

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
        {viewLayer !== 5 && (
          <div className="flex-[3] min-h-0 border-b border-slate-200">
            <PlanView />
          </div>
        )}
        <div className={viewLayer === 5 ? 'flex-1 min-h-0' : 'flex-[2] min-h-0'}>
          <PerspectiveView />
        </div>
      </div>
    </div>
  )
}
