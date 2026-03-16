import { useState, useCallback, useEffect } from 'react'
import { useGameState, useActiveGame, createGame, joinGame, startGame, cancelGame } from '../../hooks/useGameApi'
import type { GameEvent } from '../../hooks/useChannelSSE'
import { RpsGameView } from './RpsGameView'
import { Leaderboard } from './Leaderboard'

interface GameOverlayProps {
  channelId: string
  botId: string | null
  botName?: string
  lastGameEvent?: GameEvent | null
}

export function GameOverlay({ channelId, botId, botName, lastGameEvent }: GameOverlayProps) {
  const [showPanel, setShowPanel] = useState(false)
  const [activeTab, setActiveTab] = useState<'game' | 'leaderboard'>('game')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { activeGame, refresh: refreshActiveGame } = useActiveGame(channelId)
  const [currentGameId, setCurrentGameId] = useState<string | null>(null)

  // Update current game when active game changes
  useEffect(() => {
    if (activeGame && (activeGame.status === 'waiting' || activeGame.status === 'playing')) {
      setCurrentGameId(activeGame.gameId)
    } else {
      setCurrentGameId(null)
    }
  }, [activeGame])

  // Refresh when game events arrive
  useEffect(() => {
    if (lastGameEvent) {
      refreshActiveGame()
    }
  }, [lastGameEvent, refreshActiveGame])

  const { gameState, operate, refresh } = useGameState(currentGameId, botId)

  // Check if I'm a participant
  const isParticipant = gameState?.players.some((p) => p.botId === botId) ?? false
  const isCreator = activeGame?.createdBy === botId

  const handleCreate = useCallback(async () => {
    if (!botId) {
      setError('No bot selected')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const game = await createGame({
        channelId,
        gameType: 'rps',
        botId,
        config: { rounds: 3, timeoutSecs: 30 },
      })
      setCurrentGameId(game.gameId)
      await refreshActiveGame()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game')
    } finally {
      setCreating(false)
    }
  }, [channelId, botId, refreshActiveGame])

  const handleJoin = useCallback(async () => {
    if (!botId || !activeGame) {
      setError('No bot selected or no active game')
      return
    }
    setJoining(true)
    setError(null)
    try {
      await joinGame(activeGame.gameId, botId)
      setCurrentGameId(activeGame.gameId)
      await refreshActiveGame()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join game')
    } finally {
      setJoining(false)
    }
  }, [botId, activeGame, refreshActiveGame])

  const handleStart = useCallback(async () => {
    if (!botId || !activeGame) return
    try {
      await startGame(activeGame.gameId, botId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start game')
    }
  }, [botId, activeGame, refresh])

  const handleCancel = useCallback(async () => {
    if (!botId || !activeGame) return
    try {
      await cancelGame(activeGame.gameId, botId)
      setCurrentGameId(null)
      await refreshActiveGame()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel game')
    }
  }, [botId, activeGame, refreshActiveGame])

  const handleAction = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      return operate(action, data)
    },
    [operate]
  )

  // Default channel is public - everyone can watch; other channels require a bot
  const isDefaultChannel = channelId === 'default'
  if (!botId && !isDefaultChannel) return null

  // Check if spectator (no bot selected, or has bot but not a game participant)
  const isSpectator = !botId || !isParticipant

  return (
    <>
      {/* Game button */}
      <button
        style={styles.gameButton}
        onClick={() => setShowPanel(!showPanel)}
        title="Games"
      >
        🎮
        {activeGame && (activeGame.status === 'waiting' || activeGame.status === 'playing') && (
          <span style={styles.badge}>!</span>
        )}
      </button>

      {/* Game panel */}
      {showPanel && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Games</span>
            <button style={styles.closeButton} onClick={() => setShowPanel(false)}>
              ×
            </button>
          </div>

          {/* Tabs */}
          <div style={styles.tabs}>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'game' ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab('game')}
            >
              🎮 Play
            </button>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'leaderboard' ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab('leaderboard')}
            >
              🏆 Leaderboard
            </button>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && (
            <div style={styles.section}>
              <Leaderboard channelId={channelId} />
            </div>
          )}

          {/* Game Tab */}
          {activeTab === 'game' && (
            <>


          {/* No active game - show create button */}
          {!activeGame && (
            <div style={styles.section}>
              <p style={styles.sectionText}>No active game in this channel</p>
              {botId ? (
                <button
                  style={styles.primaryButton}
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : '🎲 Create RPS Game'}
                </button>
              ) : (
                <p style={styles.hintText}>Select a bot to create a game</p>
              )}
            </div>
          )}

          {/* Waiting for players */}
          {activeGame && activeGame.status === 'waiting' && (
            <div style={styles.section}>
              <div style={styles.gameInfo}>
                <span style={styles.gameType}>Rock Paper Scissors</span>
                <span style={styles.gameStatus}>Waiting for players</span>
              </div>

              {!botId ? (
                <p style={styles.hintText}>Select a bot to join this game</p>
              ) : !isParticipant ? (
                <button
                  style={styles.primaryButton}
                  onClick={handleJoin}
                  disabled={joining}
                >
                  {joining ? 'Joining...' : '🤝 Join Game'}
                </button>
              ) : (
                <div style={styles.participantInfo}>
                  <span>✓ You joined as {botName || botId}</span>
                  {isCreator && (
                    <div style={styles.creatorActions}>
                      <button style={styles.startButton} onClick={handleStart}>
                        ▶ Start Game
                      </button>
                      <button style={styles.cancelButton} onClick={handleCancel}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {gameState && (
                <div style={styles.playerList}>
                  <div style={styles.playerListTitle}>Players ({gameState.players.length}/2)</div>
                  {gameState.players.map((p) => (
                    <div key={p.botId} style={styles.playerItem}>
                      {p.botName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Game in progress (participant view) */}
          {activeGame && activeGame.status === 'playing' && gameState && !isSpectator && (
            <RpsGameView
              gameState={gameState}
              onAction={handleAction}
              myBotId={botId}
            />
          )}

          {/* Watching (spectator mode) */}
          {activeGame && activeGame.status === 'playing' && isSpectator && gameState && (
            <div style={styles.section}>
              <div style={styles.spectatorBanner}>
                <span>👁️ Spectator Mode</span>
              </div>
              <RpsGameView
                gameState={gameState}
                onAction={async () => {}}
                myBotId=""
              />
            </div>
          )}

          {/* Game finished */}
          {activeGame && activeGame.status === 'finished' && (
            <div style={styles.section}>
              <div style={styles.finished}>
                <span>🏆 Game finished!</span>
                {activeGame.winnerBotId && (
                  <span style={styles.winner}>
                    Winner: {gameState?.players.find((p) => p.botId === activeGame.winnerBotId)?.botName || activeGame.winnerBotId}
                  </span>
                )}
              </div>
              {botId ? (
                <button style={styles.primaryButton} onClick={handleCreate}>
                  🎲 New Game
                </button>
              ) : (
                <p style={styles.hintText}>Select a bot to create a new game</p>
              )}
            </div>
          )}
            </>
          )}
        </div>
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  gameButton: {
    position: 'fixed',
    bottom: 80,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(30, 30, 50, 0.9)',
    border: '2px solid rgba(255,255,255,0.2)',
    fontSize: 24,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#ef4444',
    color: '#fff',
    fontSize: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    position: 'fixed',
    bottom: 140,
    right: 20,
    width: 360,
    maxHeight: '70vh',
    background: 'rgba(20, 20, 40, 0.98)',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    zIndex: 100,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  panelTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: 24,
    cursor: 'pointer',
    opacity: 0.7,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  tab: {
    flex: 1,
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#fff',
    background: 'rgba(255,255,255,0.1)',
    borderBottom: '2px solid #3b82f6',
  },
  error: {
    padding: '8px 16px',
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#fca5a5',
    fontSize: 13,
  },
  section: {
    padding: 16,
  },
  sectionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginBottom: 12,
    margin: 0,
  },
  hintText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    margin: 0,
  },
  spectatorBanner: {
    background: 'rgba(147, 51, 234, 0.3)',
    color: '#c4b5fd',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'center' as const,
    marginBottom: 12,
  },
  primaryButton: {
    width: '100%',
    padding: '12px 16px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
    marginTop: 8,
  },
  gameInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 12,
  },
  gameType: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gameStatus: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  participantInfo: {
    padding: 12,
    background: 'rgba(74, 222, 128, 0.15)',
    borderRadius: 8,
    color: '#4ade80',
    fontSize: 13,
  },
  creatorActions: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  },
  startButton: {
    flex: 1,
    padding: '8px 12px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  cancelButton: {
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  playerList: {
    marginTop: 12,
    padding: 12,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  playerListTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginBottom: 8,
  },
  playerItem: {
    color: '#fff',
    fontSize: 13,
    padding: '4px 0',
  },
  watching: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    color: '#fff',
    fontSize: 16,
  },
  watchingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  finished: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    color: '#fbbf24',
    fontSize: 18,
    marginBottom: 12,
  },
  winner: {
    color: '#4ade80',
    fontSize: 14,
  },
}
