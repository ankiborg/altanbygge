import type { DeckConfig, Point } from '@/types/deck'

/** 4 corners of the deck in world-space metres. Origin is the wall centre-point. */
export function getDeckCorners(config: DeckConfig): [Point, Point, Point, Point] {
  const hw = config.deckWidth / 2
  return [
    { x: -hw, y: 0 },
    { x:  hw, y: 0 },
    { x:  hw, y: config.deckDepth },
    { x: -hw, y: config.deckDepth },
  ]
}

/** Board line segments across the deck surface. spacingM defaults to 0.145 m (28 mm board + 5 mm gap). */
export function getBoardLines(config: DeckConfig, spacingM = 0.145): [Point, Point][] {
  const { deckWidth, deckDepth, boardDirection } = config
  const hw = deckWidth / 2
  const lines: [Point, Point][] = []

  if (boardDirection === 'perpendicular') {
    for (let x = -hw + spacingM; x < hw; x += spacingM) {
      lines.push([{ x, y: 0 }, { x, y: deckDepth }])
    }
  } else {
    for (let y = spacingM; y < deckDepth; y += spacingM) {
      lines.push([{ x: -hw, y }, { x: hw, y }])
    }
  }

  return lines
}

/** Maps a world-space point to canvas pixel coordinates. */
export function toCanvas(p: Point, scale: number, origin: Point): Point {
  return {
    x: p.x * scale + origin.x,
    y: p.y * scale + origin.y,
  }
}
