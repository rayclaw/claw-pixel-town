import { useState, useEffect, useCallback } from 'react'

// In production, set VITE_API_URL=https://api.clawtown.dev
const API_BASE = import.meta.env.VITE_API_URL || ''

/** Channel from the REST API */
export interface ApiChannel {
  channelId: string
  name: string
  ownerUserId: string | null
  channelType: string // 'public' | 'private'
  joinKey: string | null // Only present for owner
  maxMembers: number
  isPublic: boolean
  isDefault: boolean
  onlineCount: number
  createdAt: string
}

/** Channel public view (from GET /channels or /lobby) */
export interface ChannelPublicView {
  channelId: string
  name: string
  channelType: string
  maxMembers: number
  isPublic: boolean
  onlineCount: number
  hasPassword: boolean
  ownerUserId: string | null
  ownerAvatarUrl: string | null
}

/** Lobby response */
export interface LobbyResponse {
  channels: ChannelPublicView[]
  totalChannels: number
  totalOnline: number
}

/** Lobby stats */
export interface LobbyStats {
  totalChannels: number
  totalOnline: number
  mostActiveChannelId: string | null
  mostActiveChannelName: string | null
  mostActiveOnlineCount: number
}

/** Get or create user token from localStorage */
function getUserToken(): string {
  let token = localStorage.getItem('user_token')
  if (!token) {
    token = 'user_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    localStorage.setItem('user_token', token)
  }
  return token
}

export function useUserToken(): string {
  const [token] = useState(getUserToken)
  return token
}

/** Fetch lobby data (channels + stats) with retry */
export async function fetchLobby(retries = 2): Promise<LobbyResponse> {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(`${API_BASE}/lobby`)
      if (!resp.ok) throw new Error('Failed to fetch lobby')
      return resp.json()
    } catch (e) {
      if (i === retries) throw e
      // Wait 500ms before retry
      await new Promise(r => setTimeout(r, 500))
    }
  }
  throw new Error('Failed to fetch lobby')
}

/** Fetch public channels list (uses /lobby endpoint) */
export async function fetchChannels(): Promise<ChannelPublicView[]> {
  const data = await fetchLobby()
  return data.channels
}

/** Fetch lobby stats */
export async function fetchLobbyStats(): Promise<LobbyStats> {
  const resp = await fetch(`${API_BASE}/lobby/stats`)
  if (!resp.ok) throw new Error('Failed to fetch stats')
  return resp.json()
}

/** Create a new channel */
export async function createChannel(params: {
  name: string
  joinKey?: string
  maxMembers?: number
  isPublic?: boolean
  channelType?: 'public' | 'private'
}): Promise<ApiChannel> {
  const token = getUserToken()
  const resp = await fetch(`${API_BASE}/channels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': token,
    },
    body: JSON.stringify({
      name: params.name,
      joinKey: params.joinKey || null,
      maxMembers: params.maxMembers || 20,
      isPublic: params.isPublic ?? true,
      channelType: params.channelType || 'public',
    }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create channel')
  }
  return resp.json()
}

/** Get channel details */
export async function fetchChannel(channelId: string): Promise<ApiChannel> {
  const resp = await fetch(`${API_BASE}/channels/${channelId}`)
  if (!resp.ok) throw new Error('Channel not found')
  return resp.json()
}

/** Delete a channel (owner only) */
export async function deleteChannel(channelId: string): Promise<void> {
  const token = getUserToken()
  const resp = await fetch(`${API_BASE}/channels/${channelId}`, {
    method: 'DELETE',
    headers: {
      'x-user-token': token,
    },
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete channel')
  }
}

// =============================================================================
// Bot API
// =============================================================================

/** Bot from the REST API */
export interface ApiBot {
  botId: string
  name: string
  ownerUserId: string | null
  avatar: string
  currentChannelId: string | null
  currentAgentId: string | null
  online: boolean
  createdAt: string
}

/** Create a new bot */
export async function createBot(name: string): Promise<ApiBot> {
  const token = getUserToken()
  const resp = await fetch(`${API_BASE}/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': token,
    },
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create bot')
  }
  return resp.json()
}

/** List user's bots */
export async function fetchBots(): Promise<ApiBot[]> {
  const token = getUserToken()
  const resp = await fetch(`${API_BASE}/bots`, {
    headers: {
      'x-user-token': token,
    },
  })
  if (!resp.ok) throw new Error('Failed to fetch bots')
  return resp.json()
}

/** Delete a bot */
export async function deleteBot(botId: string): Promise<void> {
  const token = getUserToken()
  const resp = await fetch(`${API_BASE}/bots/${botId}`, {
    method: 'DELETE',
    headers: {
      'x-user-token': token,
    },
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete bot')
  }
}

/** Hook to fetch and manage channel list with lobby stats */
export function useChannelList() {
  const [channels, setChannels] = useState<ChannelPublicView[]>([])
  const [totalChannels, setTotalChannels] = useState(0)
  const [totalOnline, setTotalOnline] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchLobby()
      // Channels are already sorted by online count from server
      setChannels(data.channels)
      setTotalChannels(data.totalChannels)
      setTotalOnline(data.totalOnline)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load channels')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Refresh every 10 seconds
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [refresh])

  return { channels, totalChannels, totalOnline, loading, error, refresh }
}
