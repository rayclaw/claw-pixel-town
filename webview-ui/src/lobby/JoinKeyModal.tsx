import { useState } from 'react'

interface JoinKeyModalProps {
  channelName: string
  onClose: () => void
  onSubmit: (joinKey: string) => void
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

export function JoinKeyModal({ channelName, onClose, onSubmit }: JoinKeyModalProps) {
  const [password, setPassword] = useState('')

  const handleSubmit = () => {
    if (password) {
      onSubmit(password)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && password) {
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onClose()
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
          minWidth: 300,
          maxWidth: 360,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: '0 0 8px 0',
            fontSize: '20px',
            color: 'var(--pixel-text, #e0e0e0)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>🔒</span>
          Enter Password
        </h2>

        <p
          style={{
            margin: '0 0 16px 0',
            fontSize: '14px',
            color: 'var(--pixel-text-dim, #888)',
          }}
        >
          <strong>{channelName}</strong> requires a password to join.
        </p>

        <div style={{ marginBottom: 20 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Password"
            style={inputStyle}
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button style={buttonStyle} onClick={onClose}>
            Cancel
          </button>
          <button
            style={primaryButtonStyle}
            onClick={handleSubmit}
            disabled={!password}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  )
}
