export const TILE_SIZE = 48

export interface TiledTileset {
  firstgid: number
  name: string
  image: string
  imagewidth: number
  imageheight: number
  tilewidth: number
  tileheight: number
  columns: number
  tilecount: number
  tiles?: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }>
}

export interface TiledLayer {
  name: string
  type: 'tilelayer' | 'objectgroup'
  data?: number[]  // flat array for tilelayers
  objects?: TiledObject[]  // for objectgroup
  width: number
  height: number
  visible: boolean
}

export interface TiledObject {
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  properties?: Array<{ name: string; type: string; value: unknown }>
}

export interface TiledMap {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledLayer[]
  tilesets: TiledTileset[]
}

// Character directions
export enum Direction {
  DOWN = 0,
  LEFT = 1,
  RIGHT = 2,
  UP = 3,
}

export enum CharState {
  IDLE = 0,
  WALK = 1,
}

export interface TownCharacter {
  id: number
  x: number  // pixel position (center-bottom of sprite)
  y: number
  tileCol: number
  tileRow: number
  dir: Direction
  state: CharState
  path: Array<{ col: number; row: number }>
  moveProgress: number
  frame: number
  frameTimer: number
  spriteSheet: string  // which character sprite to use
  folderName: string  // agent display name
  agentState: string  // idle, writing, etc.
  agentDetail: string
  wanderTimer: number
  isActive: boolean  // is agent doing work?
}
