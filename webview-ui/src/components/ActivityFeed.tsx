import type { ActivityItem } from '../hooks/useChannelSSE.js'

interface ActivityFeedProps {
  activities: ActivityItem[]
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        right: 12,
        maxWidth: 280,
        maxHeight: 200,
        overflow: 'hidden',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
        pointerEvents: 'none',
      }}
    >
      {activities.map((item) => (
        <div
          key={item.id}
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 14,
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            animation: 'activity-fade-in 0.3s ease-out',
          }}
        >
          <span style={{ fontSize: 18 }}>{item.emojiDisplay}</span>
          <span style={{ color: '#8cf' }}>{item.fromName}</span>
          {item.targetBotId ? (
            <span style={{ color: '#888' }}>
              <span style={{ margin: '0 4px' }}>→</span>
              <span style={{ color: '#fc8' }}>someone</span>
            </span>
          ) : (
            <span style={{ color: '#888' }}>(all)</span>
          )}
        </div>
      ))}
      <style>{`
        @keyframes activity-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
