import { CharState, Direction, TILE_SIZE } from './types'
import type { TiledMap, TownCharacter } from './types'

const WALK_SPEED = 120  // pixels per second (2.5 tiles/sec at 48px)
const WALK_FRAME_DURATION = 0.15
const WANDER_MIN = 3
const WANDER_MAX = 8

export class TownState {
  map: TiledMap | null = null
  collisionSet: Set<string> = new Set()
  characters: Map<number, TownCharacter> = new Map()
  selectedAgentId: number | null = null
  cameraFollowId: number | null = null
  tilesetImages: Map<string, HTMLImageElement> = new Map()
  spritesheetImages: Map<string, HTMLImageElement> = new Map()

  // Available character sprite sheets
  private spriteSheets = [
    'player', 'oak', 'blue', 'scientist',
    'FRLG Peds1', 'FRLG Peds2', 'FRLG Peds3', 'FRLG Peds4',
    'FRLG Peds5', 'FRLG Peds6', 'FRLG Peds7', 'FRLG Peds8',
  ]
  private nextSpriteIdx = 0

  async loadMap(mapUrl: string, assetBase: string): Promise<void> {
    const resp = await fetch(mapUrl)
    this.map = await resp.json() as TiledMap

    // Build collision set from tileset properties
    this.buildCollisionSet()

    // Load tileset images
    await this.loadTilesetImages(assetBase)

    // Load character spritesheets
    await this.loadSpritesheets(assetBase)
  }

  private buildCollisionSet(): void {
    if (!this.map) return
    this.collisionSet.clear()

    // Collect collision GIDs from tileset tile properties
    const collisionGids = new Set<number>()
    for (const ts of this.map.tilesets) {
      if (ts.tiles) {
        for (const tile of ts.tiles) {
          const collides = tile.properties?.find(p => p.name === 'collides')
          if (collides?.value === true) {
            collisionGids.add(ts.firstgid + tile.id)
          }
        }
      }
    }

    // Check each tile position across all tile layers
    const { width, height } = this.map
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const idx = r * width + c
        for (const layer of this.map.layers) {
          if (layer.type !== 'tilelayer' || !layer.data) continue
          const gid = layer.data[idx]
          if (gid > 0 && collisionGids.has(gid)) {
            this.collisionSet.add(`${c},${r}`)
            break
          }
        }
      }
    }
  }

  private async loadTilesetImages(assetBase: string): Promise<void> {
    if (!this.map) return
    const promises: Promise<void>[] = []
    for (const ts of this.map.tilesets) {
      // ts.image is like "../tilesets/grounds.png", we resolve relative to assetBase
      const imgPath = `${assetBase}/tilesets/${ts.image.split('/').pop()}`
      promises.push(
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            this.tilesetImages.set(ts.name, img)
            resolve()
          }
          img.onerror = () => resolve()  // skip failed loads
          img.src = imgPath
        })
      )
    }
    await Promise.all(promises)
  }

  private async loadSpritesheets(assetBase: string): Promise<void> {
    // Load main character sprites (72x96 frame, 3cols x 4rows = 216x384)
    const mainChars = ['player', 'oak', 'blue', 'scientist']
    // Load FRLG Ped sheets (288x256, multiple chars per sheet)
    const pedSheets = ['FRLG Peds1','FRLG Peds2','FRLG Peds3','FRLG Peds4',
                       'FRLG Peds5','FRLG Peds6','FRLG Peds7','FRLG Peds8',
                       'FRLG Peds9','FRLG Peds10']

    const all = [...mainChars, ...pedSheets]
    const promises = all.map(name => {
      return new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          this.spritesheetImages.set(name, img)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = `${assetBase}/characters-pokemon/${name}.png`
      })
    })
    await Promise.all(promises)
  }

  isWalkable(col: number, row: number): boolean {
    if (!this.map) return false
    if (col < 0 || row < 0 || col >= this.map.width || row >= this.map.height) return false
    if (this.collisionSet.has(`${col},${row}`)) return false
    // Check if any character is on this tile
    for (const ch of this.characters.values()) {
      if (ch.tileCol === col && ch.tileRow === row) return false
    }
    return true
  }

  findPath(startCol: number, startRow: number, endCol: number, endRow: number): Array<{col: number; row: number}> {
    if (!this.map) return []
    if (!this.isWalkableForPath(endCol, endRow)) return []

    // BFS
    const visited = new Set<string>()
    const queue: Array<{col: number; row: number; path: Array<{col: number; row: number}>}> = []
    visited.add(`${startCol},${startRow}`)
    queue.push({ col: startCol, row: startRow, path: [] })

    const dirs = [[0,-1],[0,1],[-1,0],[1,0]]  // up,down,left,right

    while (queue.length > 0) {
      const curr = queue.shift()!
      if (curr.col === endCol && curr.row === endRow) {
        return curr.path
      }

      for (const [dc, dr] of dirs) {
        const nc = curr.col + dc
        const nr = curr.row + dr
        const key = `${nc},${nr}`
        if (!visited.has(key) && this.isWalkableForPath(nc, nr)) {
          visited.add(key)
          queue.push({ col: nc, row: nr, path: [...curr.path, { col: nc, row: nr }] })
        }
      }

      // Limit search
      if (visited.size > 2000) return []
    }
    return []
  }

  private isWalkableForPath(col: number, row: number): boolean {
    if (!this.map) return false
    if (col < 0 || row < 0 || col >= this.map.width || row >= this.map.height) return false
    return !this.collisionSet.has(`${col},${row}`)
  }

  addAgent(id: number): void {
    if (this.characters.has(id)) return

    // Find a random walkable spawn position
    const spawn = this.findRandomWalkable()

    const spriteSheet = this.spriteSheets[this.nextSpriteIdx % this.spriteSheets.length]
    this.nextSpriteIdx++

    const ch: TownCharacter = {
      id,
      x: spawn.col * TILE_SIZE + TILE_SIZE / 2,
      y: spawn.row * TILE_SIZE + TILE_SIZE,  // bottom-center anchor
      tileCol: spawn.col,
      tileRow: spawn.row,
      dir: Direction.DOWN,
      state: CharState.IDLE,
      path: [],
      moveProgress: 0,
      frame: 0,
      frameTimer: 0,
      spriteSheet,
      folderName: '',
      agentState: 'idle',
      agentDetail: '',
      wanderTimer: Math.random() * WANDER_MAX + WANDER_MIN,
      isActive: false,
    }
    this.characters.set(id, ch)
  }

  removeAgent(id: number): void {
    this.characters.delete(id)
  }

  private findRandomWalkable(): { col: number; row: number } {
    if (!this.map) return { col: 10, row: 10 }
    const { width, height } = this.map

    // Try random positions
    for (let attempt = 0; attempt < 200; attempt++) {
      const col = Math.floor(Math.random() * (width - 4)) + 2
      const row = Math.floor(Math.random() * (height - 4)) + 2
      if (this.isWalkableForPath(col, row)) {
        return { col, row }
      }
    }
    return { col: Math.floor(width / 2), row: Math.floor(height / 2) }
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id)
    if (ch) ch.isActive = active
  }

  update(dt: number): void {
    for (const ch of this.characters.values()) {
      this.updateCharacter(ch, dt)
    }
  }

  private updateCharacter(ch: TownCharacter, dt: number): void {
    if (ch.state === CharState.WALK) {
      // Animate walk
      ch.frameTimer += dt
      if (ch.frameTimer >= WALK_FRAME_DURATION) {
        ch.frameTimer -= WALK_FRAME_DURATION
        ch.frame = (ch.frame + 1) % 4
      }

      // Move
      ch.moveProgress += (WALK_SPEED / TILE_SIZE) * dt

      if (ch.moveProgress >= 1) {
        // Arrived at next tile
        ch.moveProgress = 0
        if (ch.path.length > 0) {
          const next = ch.path[0]
          ch.tileCol = next.col
          ch.tileRow = next.row
          ch.x = next.col * TILE_SIZE + TILE_SIZE / 2
          ch.y = next.row * TILE_SIZE + TILE_SIZE
          ch.path.shift()

          if (ch.path.length > 0) {
            // Set direction for next segment
            const nextNext = ch.path[0]
            ch.dir = this.getDirection(ch.tileCol, ch.tileRow, nextNext.col, nextNext.row)
          } else {
            // Path complete
            ch.state = CharState.IDLE
            ch.frame = 0
            ch.wanderTimer = Math.random() * WANDER_MAX + WANDER_MIN
          }
        } else {
          ch.state = CharState.IDLE
          ch.frame = 0
          ch.wanderTimer = Math.random() * WANDER_MAX + WANDER_MIN
        }
      } else {
        // Interpolate position
        const fromX = ch.tileCol * TILE_SIZE + TILE_SIZE / 2
        const fromY = ch.tileRow * TILE_SIZE + TILE_SIZE
        let toX = fromX, toY = fromY
        if (ch.path.length > 0) {
          toX = ch.path[0].col * TILE_SIZE + TILE_SIZE / 2
          toY = ch.path[0].row * TILE_SIZE + TILE_SIZE
        }
        ch.x = fromX + (toX - fromX) * ch.moveProgress
        ch.y = fromY + (toY - fromY) * ch.moveProgress
      }
    } else {
      // IDLE - wander timer
      ch.wanderTimer -= dt
      if (ch.wanderTimer <= 0) {
        // Pick random nearby walkable tile and pathfind
        const range = 6
        const targetCol = ch.tileCol + Math.floor(Math.random() * range * 2) - range
        const targetRow = ch.tileRow + Math.floor(Math.random() * range * 2) - range
        const path = this.findPath(ch.tileCol, ch.tileRow, targetCol, targetRow)
        if (path.length > 0) {
          ch.path = path
          ch.state = CharState.WALK
          ch.moveProgress = 0
          ch.frame = 0
          ch.dir = this.getDirection(ch.tileCol, ch.tileRow, path[0].col, path[0].row)
        } else {
          ch.wanderTimer = Math.random() * 2 + 1
        }
      }
    }
  }

  private getDirection(fromCol: number, fromRow: number, toCol: number, toRow: number): Direction {
    const dc = toCol - fromCol
    const dr = toRow - fromRow
    if (Math.abs(dc) > Math.abs(dr)) {
      return dc > 0 ? Direction.RIGHT : Direction.LEFT
    } else {
      return dr > 0 ? Direction.DOWN : Direction.UP
    }
  }
}
