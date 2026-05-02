import ControlPanel from '@/components/ui/ControlPanel'
import PlanView from '@/components/canvas/PlanView'
import PerspectiveView from '@/components/three/PerspectiveView'

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="w-1/3 border-r overflow-y-auto shrink-0">
        <ControlPanel />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 min-h-0 border-b">
          <PlanView />
        </div>
        <div className="flex-1 min-h-0">
          <PerspectiveView />
        </div>
      </div>
    </div>
  )
}
