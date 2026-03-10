import { useState, useEffect } from 'react'

interface DanmakuItem {
  id: string
  content: string
  fromName: string
  top: number // percentage from top
  startTime: number
}

interface JokeDanmakuProps {
  jokes: Array<{
    id: string
    content: string
    fromName: string
    timestamp: number
  }>
}

const DANMAKU_DURATION = 12000 // 12 seconds to cross screen
const VERTICAL_SLOTS = 5 // number of vertical lanes

export function JokeDanmaku({ jokes }: JokeDanmakuProps) {
  const [items, setItems] = useState<DanmakuItem[]>([])
  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null)

  // Process new jokes
  useEffect(() => {
    if (jokes.length === 0) return

    const latestJoke = jokes[0]
    if (latestJoke.id === lastProcessedId) return

    // Find available vertical slot
    const now = Date.now()
    const activeSlots = items
      .filter((item) => now - item.startTime < DANMAKU_DURATION)
      .map((item) => item.top)

    // Pick a slot that's not currently in use, or random if all used
    let slot = 0
    for (let i = 0; i < VERTICAL_SLOTS; i++) {
      const topPercent = 15 + i * 12 // 15%, 27%, 39%, 51%, 63%
      if (!activeSlots.includes(topPercent)) {
        slot = topPercent
        break
      }
    }
    if (slot === 0) {
      slot = 15 + Math.floor(Math.random() * VERTICAL_SLOTS) * 12
    }

    const newItem: DanmakuItem = {
      id: latestJoke.id,
      content: latestJoke.content,
      fromName: latestJoke.fromName,
      top: slot,
      startTime: now,
    }

    setItems((prev) => [...prev, newItem])
    setLastProcessedId(latestJoke.id)

    // Remove after animation
    setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== newItem.id))
    }, DANMAKU_DURATION + 500)
  }, [jokes, lastProcessedId, items])

  if (items.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            position: 'absolute',
            top: `${item.top}%`,
            right: 0,
            whiteSpace: 'nowrap',
            animation: `danmaku-scroll ${DANMAKU_DURATION}ms linear forwards`,
            fontSize: 18,
            fontWeight: 600,
            fontFamily: 'monospace',
            textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: '#ffd700' }}>{item.fromName}:</span>
          <span>"{item.content}"</span>
        </div>
      ))}
      <style>{`
        @keyframes danmaku-scroll {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(-100vw);
          }
        }
      `}</style>
    </div>
  )
}
