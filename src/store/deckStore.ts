import { create } from 'zustand'
import type { DeckConfig, DeckShape, Point, WallDirection, BoardDirection, Stair, PlanterBox } from '@/types/deck'

interface DeckStore extends DeckConfig {
  setWallLength: (value: number) => void
  setWallDirection: (value: WallDirection) => void
  setDeckWidth: (value: number) => void
  setDeckDepth: (value: number) => void
  setHeightAboveGround: (value: number) => void
  setBoardDirection: (value: BoardDirection) => void

  customShape: DeckShape | null
  drawingPoints: DeckShape
  isDrawingMode: boolean

  startDrawing: () => void
  addDrawingPoint: (p: Point) => void
  undoDrawingPoint: () => void
  finishDrawing: () => void
  clearCustomShape: () => void

  stairs: Stair[]
  planters: PlanterBox[]
  placingStair: boolean
  placingPlanter: boolean
  selectedStairId: string | null
  selectedPlanterId: string | null

  startPlacingStair: () => void
  startPlacingPlanter: () => void
  cancelPlacing: () => void

  addStair: (stair: Stair) => void
  updateStair: (id: string, updates: Partial<Omit<Stair, 'id'>>) => void
  deleteStair: (id: string) => void

  addPlanter: (planter: PlanterBox) => void
  updatePlanter: (id: string, updates: Partial<Omit<PlanterBox, 'id'>>) => void
  deletePlanter: (id: string) => void

  selectStair: (id: string) => void
  selectPlanter: (id: string) => void
  clearSelection: () => void

  showStructure: boolean
  toggleStructure: () => void
}

export const useDeckStore = create<DeckStore>()((set, get) => ({
  wallLength: 6,
  wallDirection: 'south',
  deckWidth: 6,
  deckDepth: 3,
  heightAboveGround: 0.6,
  boardDirection: 'perpendicular',

  setWallLength: (value) => set({ wallLength: value }),
  setWallDirection: (value) => set({ wallDirection: value }),
  setDeckWidth: (value) => set({ deckWidth: value }),
  setDeckDepth: (value) => set({ deckDepth: value }),
  setHeightAboveGround: (value) => set({ heightAboveGround: value }),
  setBoardDirection: (value) => set({ boardDirection: value }),

  customShape: null,
  drawingPoints: [],
  isDrawingMode: false,

  startDrawing: () => set({ isDrawingMode: true, drawingPoints: [] }),
  addDrawingPoint: (p) => set((s) => ({ drawingPoints: [...s.drawingPoints, p] })),
  undoDrawingPoint: () => set((s) => ({ drawingPoints: s.drawingPoints.slice(0, -1) })),
  finishDrawing: () => {
    const { drawingPoints } = get()
    if (drawingPoints.length < 3) return
    set({ customShape: drawingPoints, drawingPoints: [], isDrawingMode: false })
  },
  clearCustomShape: () =>
    set({ customShape: null, drawingPoints: [], isDrawingMode: false }),

  stairs: [],
  planters: [],
  placingStair: false,
  placingPlanter: false,
  selectedStairId: null,
  selectedPlanterId: null,

  startPlacingStair: () => set({ placingStair: true, placingPlanter: false, selectedStairId: null, selectedPlanterId: null }),
  startPlacingPlanter: () => set({ placingPlanter: true, placingStair: false, selectedStairId: null, selectedPlanterId: null }),
  cancelPlacing: () => set({ placingStair: false, placingPlanter: false }),

  addStair: (stair) => set((s) => ({ stairs: [...s.stairs, stair], placingStair: false })),
  updateStair: (id, updates) =>
    set((s) => ({ stairs: s.stairs.map((st) => st.id === id ? { ...st, ...updates } : st) })),
  deleteStair: (id) =>
    set((s) => ({ stairs: s.stairs.filter((st) => st.id !== id), selectedStairId: null })),

  addPlanter: (planter) => set((s) => ({ planters: [...s.planters, planter], placingPlanter: false })),
  updatePlanter: (id, updates) =>
    set((s) => ({ planters: s.planters.map((pl) => pl.id === id ? { ...pl, ...updates } : pl) })),
  deletePlanter: (id) =>
    set((s) => ({ planters: s.planters.filter((pl) => pl.id !== id), selectedPlanterId: null })),

  selectStair: (id) => set({ selectedStairId: id, selectedPlanterId: null }),
  selectPlanter: (id) => set({ selectedPlanterId: id, selectedStairId: null }),
  clearSelection: () => set({ selectedStairId: null, selectedPlanterId: null }),

  showStructure: false,
  toggleStructure: () => set((s) => ({ showStructure: !s.showStructure })),
}))
