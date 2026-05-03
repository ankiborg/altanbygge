export type WallDirection = 'north' | 'south' | 'east' | 'west'
export type BoardDirection = 'parallel' | 'perpendicular' | 'diagonal'

export interface DeckConfig {
  wallLength: number
  wallDirection: WallDirection
  deckWidth: number
  deckDepth: number
  heightAboveGround: number
  boardDirection: BoardDirection
}

export interface Point {
  x: number
  y: number
}

export type DeckShape = Point[]

export interface Stair {
  id: string
  kind: 'edge' | 'corner'
  edgeIndex: number    // edge stairs: which edge; corner stairs: -1
  cornerIndex: number  // corner stairs: which vertex; edge stairs: -1
  offset: number       // edge stairs: metres from edge midpoint; corner stairs: 0
  width: number
}

export interface PlanterBox {
  id: string
  edgeIndex: number
  offset: number   // metres from edge midpoint along the edge
  width: number    // längd: metres along the edge
  boxDepth: number // bredd: metres out from the deck edge
  // height is always derived from heightAboveGround
}
