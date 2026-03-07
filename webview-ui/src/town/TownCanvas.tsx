import { useRef, useEffect, useCallback } from 'react'
import { TownState } from './TownState'
import { TownRenderer } from './TownRenderer'
import { TILE_SIZE } from './types'

interface TownCanvasProps {
  townState: TownState
  zoom: number
  onZoomChange: (z: number) => void
  panRef: React.RefObject<{ x: number; y: number }>
  onClick?: (agentId: number) => void
}

export function TownCanvas({ townState, zoom, onZoomChange, panRef, onClick }: TownCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef(new TownRenderer())

  // Game loop
  useEffect(() => {
    if (!townState.map) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastTime = 0
    let rafId = 0

    const frame = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time

      // Resize canvas to match container
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }

      // Update
      townState.update(dt)

      // Render
      rendererRef.current.renderFrame(ctx, townState, w, h, zoom * dpr, panRef.current)

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [townState, townState.map, zoom, panRef])

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    onZoomChange(Math.max(0.3, Math.min(4, zoom + delta)))
  }, [zoom, onZoomChange])

  // Pan with left mouse drag
  const isPanningRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const dragStartRef = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      e.preventDefault()
      isPanningRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      dragStartRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current && panRef.current) {
      const dpr = window.devicePixelRatio || 1
      panRef.current.x += (e.clientX - lastMouseRef.current.x) * dpr
      panRef.current.y += (e.clientY - lastMouseRef.current.y) * dpr
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [panRef])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false

      // If mouse barely moved from start, treat as click to select agent
      const dx = Math.abs(e.clientX - dragStartRef.current.x)
      const dy = Math.abs(e.clientY - dragStartRef.current.y)
      if (dx < 5 && dy < 5 && onClick) {
        selectAgentAt(e)
      }
    }
  }, [onClick, townState, zoom, panRef])

  const selectAgentAt = useCallback((e: React.MouseEvent) => {
    if (!townState.map || !onClick) return
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const clickX = (e.clientX - rect.left) * dpr
    const clickY = (e.clientY - rect.top) * dpr

    const mapW = townState.map.width * TILE_SIZE * zoom * dpr
    const mapH = townState.map.height * TILE_SIZE * zoom * dpr
    const offsetX = Math.floor((canvas.width - mapW) / 2) + Math.round(panRef.current.x)
    const offsetY = Math.floor((canvas.height - mapH) / 2) + Math.round(panRef.current.y)

    const worldX = (clickX - offsetX) / (zoom * dpr)
    const worldY = (clickY - offsetY) / (zoom * dpr)

    let closest: number | null = null
    let closestDist = 60

    for (const ch of townState.characters.values()) {
      const dist = Math.sqrt((ch.x - worldX) ** 2 + (ch.y - worldY) ** 2)
      if (dist < closestDist) {
        closestDist = dist
        closest = ch.id
      }
    }

    if (closest !== null) {
      onClick(closest)
    }
  }, [townState, zoom, panRef, onClick])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { isPanningRef.current = false }}
      onContextMenu={e => e.preventDefault()}
    />
  )
}
