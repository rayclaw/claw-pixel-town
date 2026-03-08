import { useState, useEffect, useCallback } from 'react'

const API_BASE = ''

/** Channel from the REST API */
export interface ApiChannel {
  channel_id: string
  name: string
  owner_user_id: string | null
  channel_type: string // 'public' | 'private'
  join_key: string | null // Only present for owner
  max_members: number
  is_public: boolean
  is_default: boolean
  online_count: number
  created_at: string
}

/** Channel public view (from GET /channels) */
export interface ChannelPublicView {
  channel_id: string
  name: string
  channel_type: string
  max_members: number
  is_public: boolean
  online_count: number
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

/** Fetch public channels list */
export async function fetchChannels(): Promise<ChannelPublicView[]> {
  const resp = await fetch(`${API_BASE}/channels`)
  if (!resp.ok) throw new Error('Failed to fetch channels')
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

/** Hook to fetch and manage channel list */
export function useChannelList() {
  const [channels, setChannels] = useState<ChannelPublicView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchChannels()
      // Sort by online count descending
      data.sort((a, b) => b.online_count - a.online_count)
      setChannels(data)
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

  return { channels, loading, error, refresh }
}
