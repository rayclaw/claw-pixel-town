import type { ChannelPublicView } from '../hooks/useChannelApi.js'

interface ChannelCardProps {
  channel: ChannelPublicView
  onClick: () => void
}

export function ChannelCard({ channel, onClick }: ChannelCardProps) {
  const hasPassword = channel.channel_type === 'private'
  const isFull = channel.online_count >= channel.max_members

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
            background: channel.online_count > 0 ? '#4ade80' : '#666',
            display: 'inline-block',
          }}
        />
        <span>
          {channel.online_count} / {channel.max_members}
        </span>
        {isFull && (
          <span style={{ color: 'var(--pixel-warning, #f59e0b)', marginLeft: 4 }}>
            Full
          </span>
        )}
      </div>

      {/* Thumbnail placeholder */}
      <div
        style={{
          marginTop: 12,
          height: 80,
          background: 'var(--pixel-bg, #1a1a2a)',
          border: '1px solid var(--pixel-border, #4a4a5a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--pixel-text-dim, #666)',
          fontSize: '12px',
        }}
      >
        Preview
      </div>
    </div>
  )
}
