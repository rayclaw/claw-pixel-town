import { useState } from 'react'
import { createChannel } from '../hooks/useChannelApi.js'

interface CreateChannelModalProps {
  onClose: () => void
  onCreated: (channelId: string) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '16px',
  background: 'var(--pixel-input-bg, #1a1a2a)',
  color: 'var(--pixel-text, #e0e0e0)',
  border: '2px solid var(--pixel-border, #4a4a5a)',
  borderRadius: 0,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  color: 'var(--pixel-text-dim, #888)',
  marginBottom: 4,
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '16px',
  background: 'var(--pixel-btn-bg, #3a3a4a)',
  color: 'var(--pixel-text, #e0e0e0)',
  border: '2px solid var(--pixel-border, #4a4a5a)',
  borderRadius: 0,
  cursor: 'pointer',
}

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--pixel-accent, #6366f1)',
  borderColor: 'var(--pixel-accent, #6366f1)',
}

export function CreateChannelModal({ onClose, onCreated }: CreateChannelModalProps) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Room name is required')
      return
    }

    try {
      setCreating(true)
      setError(null)
      const channel = await createChannel({
        name: name.trim(),
        joinKey: usePassword && password ? password : undefined,
        channelType: usePassword ? 'private' : 'public',
      })
      onCreated(channel.channel_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--pixel-card-bg, #2a2a3a)',
          border: '2px solid var(--pixel-border, #4a4a5a)',
          padding: '24px',
          minWidth: 320,
          maxWidth: 400,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: '0 0 20px 0',
            fontSize: '22px',
            color: 'var(--pixel-text, #e0e0e0)',
          }}
        >
          Create Room
        </h2>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Room Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Room"
            maxLength={32}
            style={inputStyle}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontSize: '14px',
              color: 'var(--pixel-text-dim, #888)',
            }}
          >
            <input
              type="checkbox"
              checked={usePassword}
              onChange={(e) => setUsePassword(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Require password to join
          </label>
        </div>

        {usePassword && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              maxLength={32}
              style={inputStyle}
            />
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '8px 12px',
              background: 'var(--pixel-danger-bg, #7f1d1d)',
              color: '#fff',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button style={buttonStyle} onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button
            style={primaryButtonStyle}
            onClick={handleCreate}
            disabled={creating || !name.trim()}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
