import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''

// Action event from SSE
export interface ActionEvent {
  type: 'action'
  action_type: 'emoji' | 'joke'
  from_bot_id: string
  from_name: string
  target_bot_id?: string
  emoji?: string
  joke_content?: string
}

// Game events from SSE
export interface GameCreatedEvent {
  type: 'game_created'
  game_id: string
  game_type: string
  created_by_bot_id: string
  created_by_name: string
}

export interface GamePlayerJoinedEvent {
  type: 'game_player_joined'
  game_id: string
  bot_id: string
  bot_name: string
  player_count: number
}

export interface GameStartedEvent {
  type: 'game_started'
  game_id: string
  player_count: number
}

export interface GameUpdateEvent {
  type: 'game_update'
  game_id: string
  turn_id: number
  phase: string
  summary: string
}

export interface GameFinishedEvent {
  type: 'game_finished'
  game_id: string
  winner_bot_id?: string
  winner_name?: string
  results: Record<string, unknown>
}

export interface GameCancelledEvent {
  type: 'game_cancelled'
  game_id: string
  reason: string
}

export type GameEvent =
  | GameCreatedEvent
  | GamePlayerJoinedEvent
  | GameStartedEvent
  | GameUpdateEvent
  | GameFinishedEvent
  | GameCancelledEvent

// Activity feed item for display
export interface ActivityItem {
  id: string
  timestamp: number
  actionType: 'emoji' | 'joke'
  fromName: string
  fromBotId: string
  targetBotId?: string
  // Emoji fields
  emoji?: string
  emojiDisplay?: string
  // Joke fields
  jokeContent?: string
}

// Emoji key to display character mapping
const EMOJI_MAP: Record<string, string> = {
  thumbs_up: '👍',
  celebration: '🎉',
  coffee: '☕',
  fire: '🔥',
  idea: '💡',
  laugh: '😂',
  wave: '👋',
  thinking: '🤔',
  sparkles: '✨',
  rocket: '🚀',
}

// Emoji bubble for character head display
export interface EmojiBubble {
  botId: string
  emoji: string
  emojiDisplay: string
  targetBotId?: string
  startTime: number
  duration: number // ms
}

// Joke item for danmaku display
export interface JokeItem {
  id: string
  content: string
  fromName: string
  timestamp: number
}

const MAX_ACTIVITY_ITEMS = 20
const BUBBLE_DURATION_MS = 10000

export function useChannelSSE(channelId?: string, onGameEvent?: (event: GameEvent) => void) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [bubbles, setBubbles] = useState<EmojiBubble[]>([])
  const [jokes, setJokes] = useState<JokeItem[]>([])
  const [lastGameEvent, setLastGameEvent] = useState<GameEvent | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const onGameEventRef = useRef(onGameEvent)
  onGameEventRef.current = onGameEvent

  // Add new activity item
  const addActivity = useCallback((event: ActionEvent) => {
    const item: ActivityItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      actionType: event.action_type,
      fromName: event.from_name,
      fromBotId: event.from_bot_id,
      targetBotId: event.target_bot_id,
    }

    if (event.action_type === 'emoji' && event.emoji) {
      const emojiDisplay = EMOJI_MAP[event.emoji] || event.emoji
      item.emoji = event.emoji
      item.emojiDisplay = emojiDisplay

      // Add emoji bubble for head display
      const bubble: EmojiBubble = {
        botId: event.from_bot_id,
        emoji: event.emoji,
        emojiDisplay,
        targetBotId: event.target_bot_id,
        startTime: Date.now(),
        duration: BUBBLE_DURATION_MS,
      }
      setBubbles((prev) => [...prev, bubble])
      setTimeout(() => {
        setBubbles((prev) => prev.filter((b) => b !== bubble))
      }, BUBBLE_DURATION_MS)
    } else if (event.action_type === 'joke' && event.joke_content) {
      item.jokeContent = event.joke_content

      // Add joke bubble (theater mask) for head display
      const bubble: EmojiBubble = {
        botId: event.from_bot_id,
        emoji: 'joke',
        emojiDisplay: '🎭',
        startTime: Date.now(),
        duration: BUBBLE_DURATION_MS,
      }
      setBubbles((prev) => [...prev, bubble])
      setTimeout(() => {
        setBubbles((prev) => prev.filter((b) => b !== bubble))
      }, BUBBLE_DURATION_MS)

      // Add joke for danmaku display
      const jokeItem: JokeItem = {
        id: item.id,
        content: event.joke_content,
        fromName: event.from_name,
        timestamp: Date.now(),
      }
      setJokes((prev) => [jokeItem, ...prev].slice(0, 10))
    } else {
      return // Unknown action type, ignore
    }

    setActivities((prev) => [item, ...prev].slice(0, MAX_ACTIVITY_ITEMS))
  }, [])

  // Connect to SSE
  useEffect(() => {
    if (!channelId) return

    const connect = () => {
      const url = `${API_BASE}/channels/${channelId}/events`
      console.log(`[SSE] Connecting to ${url}`)

      const es = new EventSource(url)
      eventSourceRef.current = es

      es.addEventListener('action', (e) => {
        try {
          const data = JSON.parse(e.data) as ActionEvent
          console.log('[SSE] Action event:', data)
          addActivity(data)
        } catch (err) {
          console.error('[SSE] Failed to parse action event:', err)
        }
      })

      // Game event listeners
      const gameEventTypes = [
        'game_created',
        'game_player_joined',
        'game_started',
        'game_update',
        'game_finished',
        'game_cancelled',
      ]
      gameEventTypes.forEach((eventType) => {
        es.addEventListener(eventType, (e) => {
          try {
            const data = JSON.parse(e.data) as GameEvent
            console.log(`[SSE] Game event (${eventType}):`, data)
            setLastGameEvent(data)
            onGameEventRef.current?.(data)
          } catch (err) {
            console.error(`[SSE] Failed to parse ${eventType} event:`, err)
          }
        })
      })

      es.onerror = () => {
        console.log('[SSE] Connection error, will reconnect...')
        es.close()
        eventSourceRef.current = null
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000)
      }

      es.onopen = () => {
        console.log('[SSE] Connected')
      }
    }

    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [channelId, addActivity])

  // Clear activities when channel changes
  useEffect(() => {
    setActivities([])
    setBubbles([])
    setJokes([])
    setLastGameEvent(null)
  }, [channelId])

  return { activities, bubbles, jokes, lastGameEvent }
}
