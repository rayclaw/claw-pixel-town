import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''

// =============================================================================
// Types
// =============================================================================

export type GameType = 'rps' | 'werewolf' | 'poker' | 'riddle'
export type GameStatus = 'waiting' | 'playing' | 'finished' | 'cancelled'

export interface Game {
  gameId: string
  channelId: string
  gameType: GameType
  status: GameStatus
  config: Record<string, unknown>
  state: Record<string, unknown>
  turnId: number
  currentPhase: string
  winnerBotId: string | null
  createdBy: string
  createdAt: string
  finishedAt: string | null
}

export interface GamePlayer {
  botId: string
  botName: string
  seatOrder: number
  publicState: Record<string, unknown>
  score: number
  isAlive: boolean
}

export interface GameSyncView {
  gameId: string
  gameType: GameType
  status: GameStatus
  turnId: number
  currentPhase: string
  myRole: string
  myPrivateState: Record<string, unknown>
  myPublicState: Record<string, unknown>
  players: GamePlayer[]
  publicState: Record<string, unknown>
  availableActions: string[]
  winnerBotId: string | null
}

export interface GameListItem {
  gameId: string
  gameType: GameType
  status: GameStatus
  playerCount: number
  createdBy: string
  createdAt: string
}

export interface OperateResponse {
  ok: boolean
  newTurnId: number
  error?: string
  result?: Record<string, unknown>
}

// =============================================================================
// API Functions
// =============================================================================

/** Create a new game */
export async function createGame(params: {
  channelId: string
  gameType: string
  botId: string
  config?: Record<string, unknown>
}): Promise<Game> {
  const resp = await fetch(`${API_BASE}/games/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create game')
  }
  return resp.json()
}

/** Join a game */
export async function joinGame(gameId: string, botId: string): Promise<{ ok: boolean; playerCount: number }> {
  const resp = await fetch(`${API_BASE}/games/${gameId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to join game')
  }
  return resp.json()
}

/** Start a game */
export async function startGame(gameId: string, botId: string): Promise<{ ok: boolean; turnId: number }> {
  const resp = await fetch(`${API_BASE}/games/${gameId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to start game')
  }
  return resp.json()
}

/** Cancel a game */
export async function cancelGame(gameId: string, botId: string, reason?: string): Promise<{ ok: boolean }> {
  const resp = await fetch(`${API_BASE}/games/${gameId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId, reason }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to cancel game')
  }
  return resp.json()
}

/** Sync game state (Poll) */
export async function syncGame(gameId: string, botId: string): Promise<GameSyncView> {
  const resp = await fetch(`${API_BASE}/games/${gameId}/sync?botId=${encodeURIComponent(botId)}`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to sync game')
  }
  return resp.json()
}

/** Watch game state (Spectator mode - no bot_id required) */
export async function watchGame(gameId: string): Promise<GameSyncView> {
  const resp = await fetch(`${API_BASE}/games/${gameId}/watch`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to watch game')
  }
  return resp.json()
}

/** Execute a game action */
export async function operateGame(
  gameId: string,
  botId: string,
  turnId: number,
  action: string,
  data?: Record<string, unknown>
): Promise<OperateResponse> {
  const resp = await fetch(`${API_BASE}/games/${gameId}/operate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId, turnId, action, data: data || {} }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to operate')
  }
  return resp.json()
}

/** Get active game in channel */
export async function getActiveGame(channelId: string): Promise<Game | null> {
  const resp = await fetch(`${API_BASE}/channels/${channelId}/games/active`)
  if (!resp.ok) {
    throw new Error('Failed to get active game')
  }
  return resp.json()
}

/** List games in channel */
export async function listChannelGames(channelId: string): Promise<GameListItem[]> {
  const resp = await fetch(`${API_BASE}/channels/${channelId}/games`)
  if (!resp.ok) {
    throw new Error('Failed to list games')
  }
  return resp.json()
}

// =============================================================================
// Leaderboard Types & API
// =============================================================================

export interface LeaderboardEntry {
  botId: string
  botName: string
  wins: number
  rank: number
}

export interface GameLeaderboard {
  gameType: GameType
  gameName: string
  entries: LeaderboardEntry[]
}

/** Get game leaderboard for channel */
export async function getChannelLeaderboard(channelId: string): Promise<GameLeaderboard[]> {
  const resp = await fetch(`${API_BASE}/channels/${channelId}/games/leaderboard`)
  if (!resp.ok) {
    throw new Error('Failed to get leaderboard')
  }
  return resp.json()
}

// =============================================================================
// Hooks
// =============================================================================

/** Hook to manage game state with polling */
export function useGameState(gameId: string | null, botId: string | null, pollIntervalMs = 1500) {
  const [gameState, setGameState] = useState<GameSyncView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  // Poll game state (supports spectator mode when botId is null)
  const poll = useCallback(async () => {
    if (!gameId) return

    try {
      // Use watchGame for spectators, syncGame for participants
      const state = botId ? await syncGame(gameId, botId) : await watchGame(gameId)
      setGameState(state)
      setError(null)
    } catch (e) {
      // Clear game state on error (game may have ended/been cancelled)
      setGameState(null)
      setError(e instanceof Error ? e.message : 'Unknown error')
    }
  }, [gameId, botId])

  // Start polling when game is active
  useEffect(() => {
    if (!gameId) {
      setGameState(null)
      return
    }

    setLoading(true)
    poll().finally(() => setLoading(false))

    pollRef.current = window.setInterval(poll, pollIntervalMs)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [gameId, botId, pollIntervalMs, poll])

  // Execute action helper
  const operate = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      if (!gameId || !botId || !gameState) {
        return { ok: false, newTurnId: 0, error: 'No active game' }
      }

      try {
        const result = await operateGame(gameId, botId, gameState.turnId, action, data)
        // Immediately poll for updated state
        await poll()
        return result
      } catch (e) {
        return { ok: false, newTurnId: gameState.turnId, error: e instanceof Error ? e.message : 'Unknown error' }
      }
    },
    [gameId, botId, gameState, poll]
  )

  return { gameState, loading, error, operate, refresh: poll }
}

/** Hook to check for active game in channel */
export function useActiveGame(channelId: string | null) {
  const [activeGame, setActiveGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!channelId) {
      setActiveGame(null)
      return
    }

    let cancelled = false
    setLoading(true)

    getActiveGame(channelId)
      .then((game) => {
        if (!cancelled) setActiveGame(game)
      })
      .catch(() => {
        if (!cancelled) setActiveGame(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [channelId])

  const refresh = useCallback(async () => {
    if (!channelId) return
    try {
      const game = await getActiveGame(channelId)
      setActiveGame(game)
    } catch {
      setActiveGame(null)
    }
  }, [channelId])

  return { activeGame, loading, refresh }
}

/** Hook to get channel leaderboard */
export function useLeaderboard(channelId: string | null) {
  const [leaderboards, setLeaderboards] = useState<GameLeaderboard[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!channelId) return
    try {
      const data = await getChannelLeaderboard(channelId)
      setLeaderboards(data)
    } catch {
      setLeaderboards([])
    }
  }, [channelId])

  useEffect(() => {
    if (!channelId) {
      setLeaderboards([])
      return
    }

    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [channelId, refresh])

  return { leaderboards, loading, refresh }
}
