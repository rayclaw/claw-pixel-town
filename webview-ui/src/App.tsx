import { useState, useCallback, useRef, useEffect } from 'react'
import { TownState } from './town/TownState'
import { TownCanvas } from './town/TownCanvas'
import { TILE_SIZE } from './town/types'
import { useTownPolling } from './hooks/useTownPolling'
import { AgentPanel } from './components/AgentPanel'

// Town state lives outside React
const townState = new TownState()

function App() {
  const [zoom, setZoom] = useState(1.5)
  const panRef = useRef({ x: 0, y: 0 })
  const [ready, setReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load map on mount
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/static/'
    const mapUrl = `${base}assets/maps/agent-town.json`
    const assetBase = `${base}assets`
    townState.loadMap(mapUrl, assetBase).then(() => {
      setReady(true)
    })
  }, [])

  const { agents, agentInfos } = useTownPolling(townState, ready)

  const handleZoomChange = useCallback((z: number) => {
    setZoom(Math.max(0.3, Math.min(4, z)))
  }, [])

  const handleClick = useCallback((agentId: number) => {
    townState.selectedAgentId = agentId
    townState.cameraFollowId = agentId
  }, [])

  const handleSelectAgent = useCallback((numericId: number) => {
    townState.selectedAgentId = numericId
    townState.cameraFollowId = numericId
  }, [])

  if (!ready) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', background: '#1a1a2e' }}>
        Loading Agent Town...
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <TownCanvas
        townState={townState}
        zoom={zoom}
        onZoomChange={handleZoomChange}
        panRef={panRef}
        onClick={handleClick}
      />

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />

      {/* Agent name labels */}
      <AgentNameLabels
        townState={townState}
        agents={agents}
        containerRef={containerRef}
        zoom={zoom}
        panRef={panRef}
      />

      {/* Agent status panel */}
      <AgentPanel
        agentInfos={agentInfos}
        onSelectAgent={handleSelectAgent}
        selectedAgentId={townState.selectedAgentId}
      />

      {/* Zoom controls */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <button onClick={() => handleZoomChange(zoom + 0.2)} style={zoomBtnStyle}>+</button>
        <button onClick={() => handleZoomChange(1.5)} style={zoomBtnStyle}>
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => handleZoomChange(zoom - 0.2)} style={zoomBtnStyle}>-</button>
      </div>
    </div>
  )
}

const zoomBtnStyle: React.CSSProperties = {
  width: 40,
  height: 32,
  background: 'rgba(10, 10, 20, 0.85)',
  color: '#e5e7eb',
  border: '2px solid #2a2a3e',
  borderRadius: 0,
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'monospace',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const STATE_COLORS: Record<string, string> = {
  idle: '#6b7280',
  writing: '#22c55e',
  researching: '#3b82f6',
  executing: '#eab308',
  syncing: '#a855f7',
  error: '#ef4444',
}

const STATE_SHORT: Record<string, string> = {
  idle: '',
  writing: 'WRITE',
  researching: 'SEARCH',
  executing: 'EXEC',
  syncing: 'SYNC',
  error: 'ERR',
}

const LABEL_OFFSET_PX = 52 // Above character head (characters are ~96px tall at tile scale)

function AgentNameLabels({
  townState,
  agents,
  containerRef,
  zoom,
  panRef,
}: {
  townState: TownState
  agents: number[]
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    let rafId = 0
    const tick = () => {
      setTick((n) => n + 1)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const el = containerRef.current
  if (!el || !townState.map) return null
  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const mapW = townState.map.width * TILE_SIZE * zoom * dpr
  const mapH = townState.map.height * TILE_SIZE * zoom * dpr
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  return (
    <>
      {agents.map((id) => {
        const ch = townState.characters.get(id)
        if (!ch) return null

        const name = ch.folderName || `Agent ${id}`
        const agentState = ch.agentState || 'idle'
        const stateColor = STATE_COLORS[agentState] || '#6b7280'
        const stateShort = STATE_SHORT[agentState] || ''

        // Position label above character head
        const screenX = (deviceOffsetX + ch.x * zoom * dpr) / dpr
        const screenY = (deviceOffsetY + (ch.y - LABEL_OFFSET_PX) * zoom * dpr) / dpr

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translate(-50%, -100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 30,
              gap: 1,
            }}
          >
            {stateShort && (
              <div style={{
                fontSize: '9px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#fff',
                background: stateColor,
                padding: '0px 4px',
                letterSpacing: '0.05em',
                lineHeight: '14px',
              }}>
                {stateShort}
              </div>
            )}
            <div style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              fontWeight: 600,
              color: '#e5e7eb',
              background: 'rgba(10, 10, 20, 0.8)',
              padding: '1px 4px',
              whiteSpace: 'nowrap',
              lineHeight: '14px',
              borderBottom: `2px solid ${stateColor}`,
            }}>
              {name}
            </div>
          </div>
        )
      })}
    </>
  )
}

export default App
