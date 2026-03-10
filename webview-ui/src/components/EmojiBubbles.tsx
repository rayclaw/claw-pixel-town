import { useState, useEffect } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { EmojiBubble } from '../hooks/useChannelSSE.js'
import type { AgentInfo } from '../hooks/useApiPolling.js'
import { TILE_SIZE, CharacterState } from '../office/types.js'
import { CHARACTER_SITTING_OFFSET_PX } from '../constants.js'

// Bubble offset above character head (higher than name label)
const BUBBLE_OFFSET_PX = 45

interface EmojiBubblesProps {
  officeState: OfficeState
  bubbles: EmojiBubble[]
  agentInfos: AgentInfo[]
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
}

export function EmojiBubbles({
  officeState,
  bubbles,
  agentInfos,
  containerRef,
  zoom,
  panRef,
}: EmojiBubblesProps) {
  const [, setTick] = useState(0)

  // Animate bubble fade
  useEffect(() => {
    if (bubbles.length === 0) return
    let rafId = 0
    const tick = () => {
      setTick((n) => n + 1)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [bubbles.length])

  const el = containerRef.current
  if (!el || bubbles.length === 0) return null

  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const layout = officeState.getLayout()
  const mapW = layout.cols * TILE_SIZE * zoom
  const mapH = layout.rows * TILE_SIZE * zoom
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  // Build botId -> numericId map
  const botIdToNumericId = new Map<string, number>()
  for (const info of agentInfos) {
    botIdToNumericId.set(info.botId, info.numericId)
  }

  return (
    <>
      {bubbles.map((bubble, idx) => {
        const numericId = botIdToNumericId.get(bubble.botId)
        if (numericId === undefined) return null

        const ch = officeState.characters.get(numericId)
        if (!ch) return null

        // Calculate animation progress (0 to 1)
        const elapsed = Date.now() - bubble.startTime
        const progress = Math.min(elapsed / bubble.duration, 1)

        // Fade out in last 20%
        const opacity = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1

        // Slight bounce animation
        const bounceY = Math.sin(progress * Math.PI * 2) * 3 * (1 - progress)

        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - BUBBLE_OFFSET_PX) * zoom) / dpr + bounceY

        return (
          <div
            key={`${bubble.botId}-${bubble.startTime}-${idx}`}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              zIndex: 35,
              opacity,
              transition: 'opacity 0.1s',
            }}
          >
            <div
              style={{
                fontSize: 28,
                lineHeight: 1,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                animation: 'emoji-pop 0.3s ease-out',
              }}
            >
              {bubble.emojiDisplay}
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes emoji-pop {
          0% { transform: scale(0); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>
    </>
  )
}
