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
