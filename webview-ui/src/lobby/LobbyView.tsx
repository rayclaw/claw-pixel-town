import { useState, useCallback } from 'react'
import { useChannelList, type ChannelPublicView } from '../hooks/useChannelApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { ChannelCard } from './ChannelCard.js'
import { CreateChannelModal } from './CreateChannelModal.js'
import { JoinKeyModal } from './JoinKeyModal.js'
import { UserProfile } from './UserProfile.js'
import { BotManagement } from './BotManagement.js'

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
  const { channels, totalChannels, totalOnline, loading, error, refresh } = useChannelList()
  const { user, isLoggedIn, loginWithGitHub, logout, getUserToken } = useAuth()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showBotModal, setShowBotModal] = useState(false)
  const [pendingChannel, setPendingChannel] = useState<ChannelPublicView | null>(null)

  const handleChannelClick = useCallback((channel: ChannelPublicView) => {
    const userToken = getUserToken()
    const isOwner = userToken && channel.ownerUserId === userToken

    if (channel.hasPassword && !isOwner) {
      // Show password modal (unless user is owner)
      setPendingChannel(channel)
    } else {
      // Enter directly (owner bypasses password)
      onEnterChannel(channel.channelId)
    }
  }, [onEnterChannel, getUserToken])

  const handlePasswordSubmit = useCallback((joinKey: string) => {
    if (pendingChannel) {
      onEnterChannel(pendingChannel.channelId, joinKey)
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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1
              style={{
                margin: 0,
                fontSize: '28px',
                color: 'var(--pixel-text, #e0e0e0)',
                fontWeight: 'bold',
              }}
            >
              Claw's Pixel Town
            </h1>
            <a
              href="https://github.com/rayclaw/claw-pixel-town"
              target="_blank"
              rel="noopener noreferrer"
              title="View on GitHub"
              style={{
                color: 'var(--pixel-text-dim, #888)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: '14px',
              color: 'var(--pixel-text-dim, #888)',
            }}
          >
            {totalChannels} rooms · {totalOnline} online
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isLoggedIn && user ? (
            <>
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
              <button
                style={{
                  ...buttonStyle,
                  background: 'var(--pixel-btn-bg, #3a3a4a)',
                  borderColor: 'var(--pixel-border, #4a4a5a)',
                }}
                onClick={() => setShowBotModal(true)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--pixel-card-bg, #2a2a3a)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--pixel-btn-bg, #3a3a4a)'
                }}
              >
                My Bots
              </button>
              <UserProfile user={user} onLogout={logout} />
            </>
          ) : (
            <button
              style={{
                ...buttonStyle,
                background: '#24292e',
                borderColor: '#24292e',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={loginWithGitHub}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1a1e22'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#24292e'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Login with GitHub
            </button>
          )}
        </div>
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
                key={channel.channelId}
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

      {showBotModal && (
        <BotManagement
          maxBots={5}
          onClose={() => setShowBotModal(false)}
        />
      )}
    </div>
  )
}
