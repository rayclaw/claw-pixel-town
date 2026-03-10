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
        width: 280,
        maxHeight: 200,
        zIndex: 50,
        pointerEvents: 'none',
        background: 'rgba(20, 20, 30, 0.85)',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: 11,
          color: 'rgba(255, 255, 255, 0.5)',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Activity
      </div>
      {/* Messages container */}
      <div
        style={{
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxHeight: 160,
          overflowY: 'auto',
        }}
      >
        {activities.map((item) => (
          <div
            key={item.id}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#fff',
              padding: item.actionType === 'joke' ? '8px 10px' : '6px 8px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              animation: 'activity-fade-in 0.3s ease-out',
            }}
          >
            {item.actionType === 'emoji' ? (
              // Emoji display
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>{item.emojiDisplay}</span>
                <span style={{ color: '#8cf', fontWeight: 500 }}>{item.fromName}</span>
                {item.targetBotId ? (
                  <span style={{ color: '#666' }}>
                    <span style={{ margin: '0 4px' }}>→</span>
                    <span style={{ color: '#fc8' }}>someone</span>
                  </span>
                ) : (
                  <span style={{ color: '#666', fontSize: 10 }}>(all)</span>
                )}
              </div>
            ) : item.actionType === 'joke' ? (
              // Joke display
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🎭</span>
                  <span style={{ color: '#8cf', fontWeight: 500 }}>{item.fromName}</span>
                </div>
                <div
                  style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 11,
                    lineHeight: 1.4,
                    paddingLeft: 22,
                    fontStyle: 'italic',
                    wordBreak: 'break-word',
                  }}
                >
                  "{item.jokeContent}"
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes activity-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
