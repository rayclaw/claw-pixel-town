import type { LoadedAssetData } from './furnitureCatalog.js'
import type { SpriteData } from '../types.js'

interface CatalogAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
  canPlaceOnWalls?: boolean
  groupId?: string
  orientation?: string
  state?: string
}

interface CatalogJson {
  version: number
  timestamp: string
  totalAssets: number
  categories: string[]
  assets: CatalogAsset[]
}

/**
 * Convert an image to SpriteData (2D array of hex color strings)
 */
function imageToSpriteData(img: HTMLImageElement): SpriteData {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, img.width, img.height)
  const pixels = imageData.data

  const sprite: SpriteData = []
  for (let y = 0; y < img.height; y++) {
    const row: string[] = []
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4
      const r = pixels[idx]
      const g = pixels[idx + 1]
      const b = pixels[idx + 2]
      const a = pixels[idx + 3]

      if (a < 128) {
        // Transparent pixel
        row.push('')
      } else {
        // Convert to hex color
        const hex = '#' +
          r.toString(16).padStart(2, '0') +
          g.toString(16).padStart(2, '0') +
          b.toString(16).padStart(2, '0')
        row.push(hex)
      }
    }
    sprite.push(row)
  }

  return sprite
}

/**
 * Load an image from a URL
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Load furniture assets from the public assets folder.
 * Returns LoadedAssetData ready for buildDynamicCatalog().
 */
export async function loadFurnitureAssets(basePath = '/assets'): Promise<LoadedAssetData | null> {
  try {
    // Load catalog JSON
    const catalogUrl = `${basePath}/furniture/furniture-catalog.json`
    const response = await fetch(catalogUrl)
    if (!response.ok) {
      console.warn(`Failed to load furniture catalog from ${catalogUrl}`)
      return null
    }

    const catalogJson: CatalogJson = await response.json()
    console.log(`Loading ${catalogJson.assets.length} furniture assets...`)

    // Load all PNG sprites in parallel
    const sprites: Record<string, SpriteData> = {}
    const catalog: LoadedAssetData['catalog'] = []

    const loadPromises = catalogJson.assets.map(async (asset) => {
      try {
        const imgUrl = `${basePath}/${asset.file}`
        const img = await loadImage(imgUrl)
        sprites[asset.id] = imageToSpriteData(img)

        catalog.push({
          id: asset.id,
          label: asset.label,
          category: asset.category,
          width: asset.width,
          height: asset.height,
          footprintW: asset.footprintW,
          footprintH: asset.footprintH,
          isDesk: asset.isDesk,
          ...(asset.groupId ? { groupId: asset.groupId } : {}),
          ...(asset.orientation ? { orientation: asset.orientation } : {}),
          ...(asset.state ? { state: asset.state } : {}),
          ...(asset.canPlaceOnSurfaces ? { canPlaceOnSurfaces: true } : {}),
          ...(asset.backgroundTiles ? { backgroundTiles: asset.backgroundTiles } : {}),
          ...(asset.canPlaceOnWalls ? { canPlaceOnWalls: true } : {}),
        })
      } catch (err) {
        console.warn(`Failed to load asset ${asset.id}: ${err}`)
      }
    })

    await Promise.all(loadPromises)

    console.log(`Loaded ${Object.keys(sprites).length} furniture sprites`)
    return { catalog, sprites }
  } catch (err) {
    console.error('Error loading furniture assets:', err)
    return null
  }
}
