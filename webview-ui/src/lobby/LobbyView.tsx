import { useState, useCallback } from 'react'
import { useChannelList, type ChannelPublicView } from '../hooks/useChannelApi.js'
import { ChannelCard } from './ChannelCard.js'
import { CreateChannelModal } from './CreateChannelModal.js'
import { JoinKeyModal } from './JoinKeyModal.js'

interface LobbyViewProps {
  onEnterChannel: (channelId: string, joinKey?: string) => void
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: '18px',
  background: 'var(--pixel-accent, #6366f1)',
  color: '#fff',
  border: '2px solid var(--pixel-accent, #6366f1)',
  borderRadius: 0,
  cursor: 'pointer',
  fontWeight: 'bold',
}

export function LobbyView({ onEnterChannel }: LobbyViewProps) {
  const { channels, loading, error, refresh } = useChannelList()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [pendingChannel, setPendingChannel] = useState<ChannelPublicView | null>(null)

  const handleChannelClick = useCallback((channel: ChannelPublicView) => {
    if (channel.channel_type === 'private') {
      // Show password modal
      setPendingChannel(channel)
    } else {
      // Enter directly
      onEnterChannel(channel.channel_id)
    }
  }, [onEnterChannel])

  const handlePasswordSubmit = useCallback((joinKey: string) => {
    if (pendingChannel) {
      onEnterChannel(pendingChannel.channel_id, joinKey)
      setPendingChannel(null)
    }
  }, [pendingChannel, onEnterChannel])

  const handleChannelCreated = useCallback((channelId: string) => {
    setShowCreateModal(false)
    refresh()
    onEnterChannel(channelId)
  }, [refresh, onEnterChannel])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--pixel-bg, #1a1a2a)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '20px 24px',
          borderBottom: '2px solid var(--pixel-border, #4a4a5a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '28px',
            color: 'var(--pixel-text, #e0e0e0)',
            fontWeight: 'bold',
          }}
        >
          Small Town
        </h1>
        <button
          style={buttonStyle}
          onClick={() => setShowCreateModal(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--pixel-accent-hover, #4f46e5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--pixel-accent, #6366f1)'
          }}
        >
          + Create Room
        </button>
      </header>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
        }}
      >
        {loading && channels.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--pixel-text-dim, #888)',
              fontSize: '18px',
            }}
          >
            Loading rooms...
          </div>
        ) : error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 16,
            }}
          >
            <p style={{ color: 'var(--pixel-danger, #ef4444)', fontSize: '16px' }}>
              {error}
            </p>
            <button
              style={{
                ...buttonStyle,
                background: 'var(--pixel-btn-bg, #3a3a4a)',
                borderColor: 'var(--pixel-border, #4a4a5a)',
              }}
              onClick={refresh}
            >
              Retry
            </button>
          </div>
        ) : channels.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 16,
              color: 'var(--pixel-text-dim, #888)',
            }}
          >
            <p style={{ fontSize: '18px' }}>No rooms yet</p>
            <p style={{ fontSize: '14px' }}>Create the first room to get started!</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {channels.map((channel) => (
              <ChannelCard
                key={channel.channel_id}
                channel={channel}
                onClick={() => handleChannelClick(channel)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateChannelModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleChannelCreated}
        />
      )}

      {pendingChannel && (
        <JoinKeyModal
          channelName={pendingChannel.name}
          onClose={() => setPendingChannel(null)}
          onSubmit={handlePasswordSubmit}
        />
      )}
    </div>
  )
}
