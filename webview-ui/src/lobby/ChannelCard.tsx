import { useRef, useEffect } from 'react'
import type { ChannelPublicView } from '../hooks/useChannelApi.js'

interface ChannelCardProps {
  channel: ChannelPublicView
  onClick: () => void
}

// Simple hash function for generating colors from channel name
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

// Generate a placeholder office thumbnail
function drawPlaceholderThumbnail(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number) {
  // Floor background
  ctx.fillStyle = '#3a3a4a'
  ctx.fillRect(0, 0, width, height)

  // Draw floor tiles
  const tileSize = 8
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const shade = ((x + y) / tileSize) % 2 === 0 ? '#404050' : '#383848'
      ctx.fillStyle = shade
      ctx.fillRect(x, y, tileSize, tileSize)
    }
  }

  // Draw some "furniture" rectangles based on seed
  const rng = (s: number) => {
    s = Math.sin(s) * 10000
    return s - Math.floor(s)
  }

  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']

  for (let i = 0; i < 6; i++) {
    const r = rng(seed + i * 100)
    const x = Math.floor(r * (width - 20)) + 4
    const y = Math.floor(rng(seed + i * 200) * (height - 16)) + 4
    const w = 12 + Math.floor(rng(seed + i * 300) * 16)
    const h = 8 + Math.floor(rng(seed + i * 400) * 12)
    ctx.fillStyle = colors[i % colors.length]
    ctx.globalAlpha = 0.7
    ctx.fillRect(x, y, w, h)
  }

  ctx.globalAlpha = 1

  // Border
  ctx.strokeStyle = '#4a4a5a'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
}

export function ChannelCard({ channel, onClick }: ChannelCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hasPassword = channel.hasPassword
  const isFull = channel.onlineCount >= channel.maxMembers
  const seed = hashCode(channel.channelId || channel.name)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawPlaceholderThumbnail(ctx, canvas.width, canvas.height, seed)
  }, [seed])

  return (
    <div
      onClick={isFull ? undefined : onClick}
      style={{
        background: 'var(--pixel-card-bg, #2a2a3a)',
        border: '2px solid var(--pixel-border, #4a4a5a)',
        borderRadius: 0,
        padding: '12px 16px',
        cursor: isFull ? 'not-allowed' : 'pointer',
        opacity: isFull ? 0.6 : 1,
        transition: 'transform 0.1s, box-shadow 0.1s',
        minWidth: 200,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isFull) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Room name */}
      <div
        style={{
          fontSize: '18px',
          fontWeight: 'bold',
          color: 'var(--pixel-text, #e0e0e0)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {hasPassword && (
          <span title="Password required" style={{ fontSize: '14px' }}>
            🔒
          </span>
        )}
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {channel.name}
        </span>
      </div>

      {/* Online count */}
      <div
        style={{
          fontSize: '14px',
          color: 'var(--pixel-text-dim, #888)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: channel.onlineCount > 0 ? '#4ade80' : '#666',
            display: 'inline-block',
          }}
        />
        <span>
          {channel.onlineCount} / {channel.maxMembers}
        </span>
        {isFull && (
          <span style={{ color: 'var(--pixel-warning, #f59e0b)', marginLeft: 4 }}>
            Full
          </span>
        )}
      </div>

      {/* Thumbnail */}
      <canvas
        ref={canvasRef}
        width={160}
        height={80}
        style={{
          marginTop: 12,
          width: '100%',
          height: 80,
          imageRendering: 'pixelated',
        }}
      />

      {/* Owner Avatar */}
      {channel.ownerAvatarUrl && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid var(--pixel-border, #4a4a5a)',
            background: 'var(--pixel-card-bg, #2a2a3a)',
          }}
        >
          <img
            src={channel.ownerAvatarUrl}
            alt="Owner"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}
    </div>
  )
}
