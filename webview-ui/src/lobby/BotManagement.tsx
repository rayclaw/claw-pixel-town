import { useState, useEffect, useCallback } from 'react'
import { fetchBots, createBot, deleteBot, updateBot, type ApiBot } from '../hooks/useChannelApi.js'

interface BotManagementProps {
  maxBots?: number
  onClose: () => void
}

export function BotManagement({ maxBots = 5, onClose }: BotManagementProps) {
  const [bots, setBots] = useState<ApiBot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newBotName, setNewBotName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteBot, setConfirmDeleteBot] = useState<ApiBot | null>(null)
  const [editingBot, setEditingBot] = useState<ApiBot | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  const loadBots = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchBots()
      setBots(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bots')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBots()
  }, [loadBots])

  const handleCreate = useCallback(async () => {
    if (!newBotName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await createBot(newBotName.trim())
      setNewBotName('')
      setShowCreateForm(false)
      await loadBots()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create bot')
    } finally {
      setCreating(false)
    }
  }, [newBotName, loadBots])

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteBot) return
    setDeletingId(confirmDeleteBot.botId)
    setConfirmDeleteBot(null)
    try {
      await deleteBot(confirmDeleteBot.botId)
      await loadBots()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete bot')
    } finally {
      setDeletingId(null)
    }
  }, [confirmDeleteBot, loadBots])

  const handleStartEdit = useCallback((bot: ApiBot) => {
    setEditingBot(bot)
    setEditName(bot.name)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingBot || !editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateBot(editingBot.botId, editName.trim())
      setEditingBot(null)
      setEditName('')
      await loadBots()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename bot')
    } finally {
      setSaving(false)
    }
  }, [editingBot, editName, loadBots])

  const handleCancelEdit = useCallback(() => {
    setEditingBot(null)
    setEditName('')
  }, [])

  const canCreateMore = bots.length < maxBots

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
          minWidth: 400,
          maxWidth: 500,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '20px',
              color: 'var(--pixel-text, #e0e0e0)',
            }}
          >
            My Bots ({bots.length}/{maxBots})
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--pixel-text-dim, #888)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: 12,
              background: 'rgba(239, 68, 68, 0.2)',
              color: 'var(--pixel-danger, #ef4444)',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        {canCreateMore && !showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              width: '100%',
              padding: '10px 16px',
              marginBottom: 16,
              fontSize: '20px',
              background: 'var(--pixel-accent, #6366f1)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + Create New Bot
          </button>
        )}

        {showCreateForm && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 16,
              padding: 12,
              background: 'var(--pixel-bg, #1a1a2a)',
            }}
          >
            <input
              type="text"
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              placeholder="Bot name"
              maxLength={32}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '20px',
                background: 'var(--pixel-card-bg, #2a2a3a)',
                color: 'var(--pixel-text, #e0e0e0)',
                border: '2px solid var(--pixel-border, #4a4a5a)',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setShowCreateForm(false)
              }}
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newBotName.trim()}
              style={{
                padding: '8px 16px',
                fontSize: '20px',
                background: 'var(--pixel-accent, #6366f1)',
                color: '#fff',
                border: 'none',
                cursor: creating ? 'wait' : 'pointer',
                opacity: creating || !newBotName.trim() ? 0.6 : 1,
              }}
            >
              {creating ? '...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setNewBotName('')
              }}
              style={{
                padding: '8px 16px',
                fontSize: '20px',
                background: 'var(--pixel-btn-bg, #3a3a4a)',
                color: 'var(--pixel-text, #e0e0e0)',
                border: '2px solid var(--pixel-border, #4a4a5a)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--pixel-text-dim, #888)', fontSize: '20px', padding: '20px 0', textAlign: 'center' }}>
            Loading...
          </div>
        ) : bots.length === 0 ? (
          <div style={{ color: 'var(--pixel-text-dim, #888)', fontSize: '20px', padding: '20px 0', textAlign: 'center' }}>
            No bots yet. Create one to connect agents.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bots.map((bot) => (
              <div
                key={bot.botId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--pixel-bg, #1a1a2a)',
                  border: '1px solid var(--pixel-border, #4a4a5a)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingBot?.botId === bot.botId ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={32}
                        style={{
                          flex: 1,
                          padding: '4px 8px',
                          fontSize: '16px',
                          background: 'var(--pixel-card-bg, #2a2a3a)',
                          color: 'var(--pixel-text, #e0e0e0)',
                          border: '2px solid var(--pixel-accent, #6366f1)',
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit()
                          if (e.key === 'Escape') handleCancelEdit()
                        }}
                        autoFocus
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving || !editName.trim()}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          background: 'var(--pixel-accent, #6366f1)',
                          color: '#fff',
                          border: 'none',
                          cursor: saving ? 'wait' : 'pointer',
                          opacity: saving || !editName.trim() ? 0.6 : 1,
                        }}
                      >
                        {saving ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          background: 'var(--pixel-btn-bg, #3a3a4a)',
                          color: 'var(--pixel-text, #e0e0e0)',
                          border: '1px solid var(--pixel-border, #4a4a5a)',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => handleStartEdit(bot)}
                      title="Click to rename"
                      style={{
                        fontSize: '20px',
                        color: 'var(--pixel-text, #e0e0e0)',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      {bot.name}
                      <span style={{ marginLeft: 6, fontSize: '12px', color: 'var(--pixel-text-dim, #666)' }}>✏️</span>
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--pixel-text-dim, #888)',
                      fontFamily: 'monospace',
                      marginTop: 2,
                    }}
                  >
                    {bot.botId}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                  {bot.online && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '11px',
                        color: '#4ade80',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#4ade80',
                        }}
                      />
                      Online
                    </span>
                  )}
                  <button
                    onClick={() => setConfirmDeleteBot(bot)}
                    disabled={deletingId === bot.botId || bot.online}
                    title={bot.online ? 'Cannot delete while online' : 'Delete bot'}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      background: 'transparent',
                      color: bot.online ? 'var(--pixel-text-dim, #888)' : 'var(--pixel-danger, #ef4444)',
                      border: `1px solid ${bot.online ? 'var(--pixel-border, #4a4a5a)' : 'var(--pixel-danger, #ef4444)'}`,
                      cursor: bot.online ? 'not-allowed' : 'pointer',
                      opacity: deletingId === bot.botId ? 0.6 : 1,
                    }}
                  >
                    {deletingId === bot.botId ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            padding: '14px',
            background: 'var(--pixel-bg, #1a1a2a)',
            fontSize: '20px',
            color: 'var(--pixel-text-dim, #888)',
          }}
        >
          Use bot ID with <code style={{ background: 'var(--pixel-card-bg)', padding: '4px 8px', fontSize: '18px' }}>POST /channels/:id/join</code> to connect agents
        </div>

        {/* Delete Confirmation Dialog */}
        {confirmDeleteBot && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
            }}
            onClick={() => setConfirmDeleteBot(null)}
          >
            <div
              style={{
                background: 'var(--pixel-card-bg, #2a2a3a)',
                border: '2px solid var(--pixel-border, #4a4a5a)',
                padding: 24,
                minWidth: 300,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--pixel-text, #e0e0e0)' }}>
                Delete Bot?
              </h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '20px', color: 'var(--pixel-text-dim, #888)' }}>
                Are you sure you want to delete <strong style={{ color: 'var(--pixel-text)' }}>{confirmDeleteBot.name}</strong>?
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmDeleteBot(null)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '20px',
                    background: 'var(--pixel-btn-bg, #3a3a4a)',
                    color: 'var(--pixel-text, #e0e0e0)',
                    border: '2px solid var(--pixel-border, #4a4a5a)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  style={{
                    padding: '8px 16px',
                    fontSize: '20px',
                    background: 'var(--pixel-danger, #ef4444)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
