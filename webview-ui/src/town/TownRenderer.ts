import type { TownState } from './TownState'
import { CharState, Direction, TILE_SIZE } from './types'
import type { TownCharacter } from './types'

// Main character spritesheets are 216x384 (3 cols x 4 rows of 72x96 frames)
// Rows: 0=down, 1=left, 2=right, 3=up
// Cols: 0=stand, 1=walk1, 2=walk2
const MAIN_FRAME_W = 72
const MAIN_FRAME_H = 96
const MAIN_COLS = 3

// FRLG Peds sheets are 288x256 - they contain multiple small NPCs
// Each small NPC is 24x32, arranged as 4 chars per row, 2 rows = 8 chars
// Each char: 3 frames wide x 4 dirs tall = 72x128 per char
// We'll just use the first character from each sheet for simplicity
const PED_CHAR_W = 24
const PED_CHAR_H = 32
const PED_FRAMES = 3
const PED_DIRS = 4

// Map direction enum to spritesheet row
// Main chars: 0=down, 1=left, 2=right, 3=up
// FRLG Peds: same convention (0=down, 1=left, 2=right, 3=up) but need to verify
const DIR_TO_ROW: Record<Direction, number> = {
  [Direction.DOWN]: 0,
  [Direction.LEFT]: 1,
  [Direction.RIGHT]: 2,
  [Direction.UP]: 3,
}

// Suppress unused variable warnings - these are kept for documentation
void MAIN_COLS
void PED_FRAMES
void PED_DIRS

export class TownRenderer {
  renderFrame(
    ctx: CanvasRenderingContext2D,
    state: TownState,
    canvasWidth: number,
    canvasHeight: number,
    zoom: number,
    pan: { x: number; y: number },
  ): void {
    if (!state.map) return

    const { width: mapCols, height: mapRows } = state.map
    const mapW = mapCols * TILE_SIZE * zoom
    const mapH = mapRows * TILE_SIZE * zoom

    // Camera follow
    if (state.cameraFollowId !== null) {
      const ch = state.characters.get(state.cameraFollowId)
      if (ch) {
        // Smooth camera follow would be in update, here we just center on character
        const targetPanX = canvasWidth / 2 - (ch.x * zoom) - Math.floor((canvasWidth - mapW) / 2)
        const targetPanY = canvasHeight / 2 - (ch.y * zoom) - Math.floor((canvasHeight - mapH) / 2)
        pan.x += (targetPanX - pan.x) * 0.08
        pan.y += (targetPanY - pan.y) * 0.08
      }
    }

    const actualOffsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(pan.x)
    const actualOffsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(pan.y)

    // Clear
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    ctx.imageSmoothingEnabled = false

    // Determine visible tile range for culling
    const startCol = Math.max(0, Math.floor(-actualOffsetX / (TILE_SIZE * zoom)))
    const startRow = Math.max(0, Math.floor(-actualOffsetY / (TILE_SIZE * zoom)))
    const endCol = Math.min(mapCols, Math.ceil((canvasWidth - actualOffsetX) / (TILE_SIZE * zoom)))
    const endRow = Math.min(mapRows, Math.ceil((canvasHeight - actualOffsetY) / (TILE_SIZE * zoom)))

    // Render layers in order
    const layerOrder = ['below_player', 'below_player2', 'world', 'world2']
    const abovePlayerLayers = ['above_player']

    // Draw below + world layers
    for (const layerName of layerOrder) {
      this.renderTileLayer(ctx, state, layerName, actualOffsetX, actualOffsetY, zoom, startCol, startRow, endCol, endRow)
    }

    // Draw characters (sorted by Y for depth)
    const sortedChars = Array.from(state.characters.values()).sort((a, b) => a.y - b.y)
    for (const ch of sortedChars) {
      this.renderCharacter(ctx, state, ch, actualOffsetX, actualOffsetY, zoom)
    }

    // Draw above_player layers (roofs, tree tops)
    for (const layerName of abovePlayerLayers) {
      this.renderTileLayer(ctx, state, layerName, actualOffsetX, actualOffsetY, zoom, startCol, startRow, endCol, endRow)
    }
  }

  private renderTileLayer(
    ctx: CanvasRenderingContext2D,
    state: TownState,
    layerName: string,
    offsetX: number,
    offsetY: number,
    zoom: number,
    startCol: number,
    startRow: number,
    endCol: number,
    endRow: number,
  ): void {
    if (!state.map) return

    const layer = state.map.layers.find(l => l.name === layerName && l.type === 'tilelayer')
    if (!layer || !layer.data) return

    const { width: mapCols } = state.map
    const tileSize = TILE_SIZE * zoom

    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const gid = layer.data[r * mapCols + c]
        if (gid === 0) continue

        const tileInfo = this.resolveTile(state, gid)
        if (!tileInfo) continue

        const destX = Math.round(offsetX + c * tileSize)
        const destY = Math.round(offsetY + r * tileSize)

        ctx.drawImage(
          tileInfo.image,
          tileInfo.srcX, tileInfo.srcY,
          TILE_SIZE, TILE_SIZE,
          destX, destY,
          Math.ceil(tileSize), Math.ceil(tileSize)
        )
      }
    }
  }

  private resolveTile(state: TownState, gid: number): { image: HTMLImageElement; srcX: number; srcY: number } | null {
    if (!state.map) return null

    // Find which tileset this GID belongs to
    let tileset: typeof state.map.tilesets[0] | null = null
    for (let i = state.map.tilesets.length - 1; i >= 0; i--) {
      if (gid >= state.map.tilesets[i].firstgid) {
        tileset = state.map.tilesets[i]
        break
      }
    }
    if (!tileset) return null

    const img = state.tilesetImages.get(tileset.name)
    if (!img) return null

    const localId = gid - tileset.firstgid
    const col = localId % tileset.columns
    const row = Math.floor(localId / tileset.columns)

    return {
      image: img,
      srcX: col * TILE_SIZE,
      srcY: row * TILE_SIZE,
    }
  }

  private renderCharacter(
    ctx: CanvasRenderingContext2D,
    state: TownState,
    ch: TownCharacter,
    offsetX: number,
    offsetY: number,
    zoom: number,
  ): void {
    const img = state.spritesheetImages.get(ch.spriteSheet)
    if (!img) return

    const isMainChar = ['player', 'oak', 'blue', 'scientist'].includes(ch.spriteSheet)

    let srcX: number, srcY: number, srcW: number, srcH: number
    let drawW: number, drawH: number

    if (isMainChar) {
      // Main character spritesheets: 216x384, 3 cols x 4 rows, 72x96 per frame
      const row = DIR_TO_ROW[ch.dir]
      let col = 0  // standing frame
      if (ch.state === CharState.WALK) {
        // Walk cycle: 0,1,0,2 pattern
        const walkFrames = [0, 1, 0, 2]
        col = walkFrames[ch.frame % 4]
      }
      srcX = col * MAIN_FRAME_W
      srcY = row * MAIN_FRAME_H
      srcW = MAIN_FRAME_W
      srcH = MAIN_FRAME_H

      // Scale to fit ~1 tile wide, ~1.5 tiles tall
      drawW = TILE_SIZE * zoom * 1.0
      drawH = TILE_SIZE * zoom * (MAIN_FRAME_H / MAIN_FRAME_W)
    } else {
      // FRLG Peds sheets: use first character (top-left 72x128 block)
      // Each char: 3 frames x 4 dirs, each frame 24x32
      const row = DIR_TO_ROW[ch.dir]
      let col = 0
      if (ch.state === CharState.WALK) {
        const walkFrames = [0, 1, 0, 2]
        col = walkFrames[ch.frame % 4]
      }
      srcX = col * PED_CHAR_W
      srcY = row * PED_CHAR_H
      srcW = PED_CHAR_W
      srcH = PED_CHAR_H

      // Scale: make pedestrians similar size to tile
      drawW = TILE_SIZE * zoom * 0.8
      drawH = TILE_SIZE * zoom * (PED_CHAR_H / PED_CHAR_W) * 0.8
    }

    // Character position: ch.x, ch.y is bottom-center in world pixels
    const screenX = Math.round(offsetX + ch.x * zoom - drawW / 2)
    const screenY = Math.round(offsetY + ch.y * zoom - drawH)

    // Selected highlight
    if (state.selectedAgentId === ch.id) {
      ctx.save()
      ctx.shadowColor = '#5a8cff'
      ctx.shadowBlur = 8 * zoom
      ctx.drawImage(img, srcX, srcY, srcW, srcH, screenX, screenY, drawW, drawH)
      ctx.restore()
    }

    ctx.drawImage(img, srcX, srcY, srcW, srcH, screenX, screenY, drawW, drawH)
  }
}
