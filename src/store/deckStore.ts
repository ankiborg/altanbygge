import { create } from 'zustand'
import type { DeckConfig, DeckShape, Point, WallDirection, BoardDirection } from '@/types/deck'

interface DeckStore extends DeckConfig {
  // Config setters
  setWallLength: (value: number) => void
  setWallDirection: (value: WallDirection) => void
  setDeckWidth: (value: number) => void
  setDeckDepth: (value: number) => void
  setHeightAboveGround: (value: number) => void
  setBoardDirection: (value: BoardDirection) => void

  // Custom polygon shape
  customShape: DeckShape | null
  drawingPoints: DeckShape
  isDrawingMode: boolean

  startDrawing: () => void
  addDrawingPoint: (p: Point) => void
  undoDrawingPoint: () => void
  finishDrawing: () => void
  clearCustomShape: () => void
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

  addDrawingPoint: (p) =>
    set((s) => ({ drawingPoints: [...s.drawingPoints, p] })),

  undoDrawingPoint: () =>
    set((s) => ({ drawingPoints: s.drawingPoints.slice(0, -1) })),

  finishDrawing: () => {
    const { drawingPoints } = get()
    if (drawingPoints.length < 3) return
    set({ customShape: drawingPoints, drawingPoints: [], isDrawingMode: false })
  },

  clearCustomShape: () =>
    set({ customShape: null, drawingPoints: [], isDrawingMode: false }),
}))
