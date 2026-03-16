import { useState, useEffect } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentInfo } from '../hooks/useApiPolling.js'
import { TILE_SIZE, CharacterState } from '../office/types.js'
import { CHARACTER_SITTING_OFFSET_PX } from '../constants.js'

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

// Label offset above ch.y in sprite pixels (character is ~24px tall, so 30 clears the head)
const LABEL_OFFSET_PX = 30

interface AgentNameLabelsProps {
  officeState: OfficeState
  agents: number[]
  agentInfos: AgentInfo[]
  gamingBotIds: string[]  // botIds currently in a game
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
}

export function AgentNameLabels({
  officeState,
  agents,
  agentInfos,
  gamingBotIds,
  containerRef,
  zoom,
  panRef,
}: AgentNameLabelsProps) {
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
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const layout = officeState.getLayout()
  const mapW = layout.cols * TILE_SIZE * zoom
  const mapH = layout.rows * TILE_SIZE * zoom
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  return (
    <>
      {agents.map((id) => {
        const ch = officeState.characters.get(id)
        if (!ch) return null
        if (ch.matrixEffect === 'despawn') return null

        const name = ch.folderName || `Agent ${id}`
        const agentState = ch.agentState || 'idle'
        const stateColor = STATE_COLORS[agentState] || '#6b7280'
        const stateShort = STATE_SHORT[agentState] || ''

        // Check if this agent is in a game
        const agentInfo = agentInfos.find(a => a.numericId === id)
        const isInGame = agentInfo && gamingBotIds.includes(agentInfo.botId)

        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
        // Position: character anchor is bottom-center. Move label LABEL_OFFSET_PX above that.
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - LABEL_OFFSET_PX) * zoom) / dpr

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
            {/* Game indicator - operating room light style */}
            {isInGame && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                marginBottom: 2,
              }}>
                <div className="game-light-pulse" style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 4px 2px rgba(239, 68, 68, 0.6)',
                }} />
                <div style={{
                  fontSize: '7px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: '#fca5a5',
                  textShadow: '0 0 4px rgba(239, 68, 68, 0.8)',
                  letterSpacing: '0.1em',
                }}>
                  GAMING
                </div>
                <div className="game-light-pulse" style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 4px 2px rgba(239, 68, 68, 0.6)',
                }} />
              </div>
            )}

            {/* State badge */}
            {stateShort && (
              <div style={{
                fontSize: '8px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#fff',
                background: stateColor,
                padding: '0px 3px',
                letterSpacing: '0.05em',
                lineHeight: '12px',
              }}>
                {stateShort}
              </div>
            )}

            {/* Agent name */}
            <div style={{
              fontSize: '9px',
              fontFamily: 'monospace',
              fontWeight: 600,
              color: '#e5e7eb',
              background: 'rgba(10, 10, 20, 0.75)',
              padding: '0px 3px',
              whiteSpace: 'nowrap',
              lineHeight: '13px',
              borderBottom: `1px solid ${isInGame ? '#ef4444' : stateColor}`,
            }}>
              {name}
            </div>
          </div>
        )
      })}
    </>
  )
}
