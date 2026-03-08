import { useState, useCallback } from 'react'
import { deleteChannel } from '../hooks/useChannelApi.js'

interface ChannelSettingsModalProps {
  channelId: string
  channelName: string
  onClose: () => void
  onDeleted: () => void
}

export function ChannelSettingsModal({
  channelId,
  channelName,
  onClose,
  onDeleted,
}: ChannelSettingsModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    setError(null)
    try {
      await deleteChannel(channelId)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
      setDeleting(false)
    }
  }, [channelId, onDeleted])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
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
          padding: 24,
          minWidth: 320,
          maxWidth: 400,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: '0 0 20px 0',
            fontSize: '20px',
            color: 'var(--pixel-text, #e0e0e0)',
          }}
        >
          Room Settings
        </h2>

        <div
          style={{
            padding: '12px 0',
            borderTop: '1px solid var(--pixel-border, #4a4a5a)',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: 'var(--pixel-text-dim, #888)',
              marginBottom: 8,
            }}
          >
            Room Name
          </div>
          <div
            style={{
              fontSize: '16px',
              color: 'var(--pixel-text, #e0e0e0)',
            }}
          >
            {channelName}
          </div>
        </div>

        {/* Danger Zone */}
        <div
          style={{
            marginTop: 20,
            padding: 16,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--pixel-danger, #ef4444)',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: 'var(--pixel-danger, #ef4444)',
              marginBottom: 12,
            }}
          >
            Danger Zone
          </div>

          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 12px',
                background: 'rgba(239, 68, 68, 0.2)',
                color: 'var(--pixel-danger, #ef4444)',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          )}

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                width: '100%',
                padding: '10px 16px',
                fontSize: '14px',
                background: 'transparent',
                color: 'var(--pixel-danger, #ef4444)',
                border: '2px solid var(--pixel-danger, #ef4444)',
                cursor: 'pointer',
              }}
            >
              Delete Room
            </button>
          ) : (
            <div>
              <p
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '14px',
                  color: 'var(--pixel-text, #e0e0e0)',
                }}
              >
                Are you sure you want to delete this room? This action cannot be
                undone.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    fontSize: '14px',
                    background: 'var(--pixel-danger, #ef4444)',
                    color: '#fff',
                    border: 'none',
                    cursor: deleting ? 'wait' : 'pointer',
                    opacity: deleting ? 0.6 : 1,
                  }}
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    fontSize: '14px',
                    background: 'var(--pixel-btn-bg, #3a3a4a)',
                    color: 'var(--pixel-text, #e0e0e0)',
                    border: '2px solid var(--pixel-border, #4a4a5a)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: 20,
            padding: '10px 16px',
            fontSize: '14px',
            background: 'var(--pixel-btn-bg, #3a3a4a)',
            color: 'var(--pixel-text, #e0e0e0)',
            border: '2px solid var(--pixel-border, #4a4a5a)',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
