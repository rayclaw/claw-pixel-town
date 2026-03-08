import { useState, useEffect, useRef, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { OfficeLayout } from '../office/types.js'

// In production, set VITE_API_URL=https://api.clawtown.dev
const API_BASE = import.meta.env.VITE_API_URL || ''
const POLL_INTERVAL_MS = 2000

/** Agent record from the REST API */
export interface ApiAgent {
  agentId: string
  name: string
  isMain?: boolean  // Only in legacy /agents API
  state: string // idle, writing, researching, executing, syncing, error
  detail: string
  area: string
  framework?: string  // Only in legacy /agents API
  online: boolean
  avatar: string
  botId?: string  // Only in channel /agents API
}

/** Map our agent states to pixel-agents tool names for animation */
function stateToTool(state: string): string | null {
  switch (state) {
    case 'writing':
      return 'Write'
    case 'researching':
      return 'Read'
    case 'executing':
      return 'Bash'
    case 'syncing':
      return 'Write'
    case 'error':
      return null
    case 'idle':
    default:
      return null
  }
}

function isActiveState(state: string): boolean {
  return state !== 'idle'
}

/** Stable numeric ID from string agent_id (hash to positive int) */
function agentIdToNumeric(agentId: string): number {
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) || 1
}

/** Agent info exposed to UI components */
export interface AgentInfo {
  agentId: string
  numericId: number
  name: string
  state: string
  detail: string
  framework: string
}

export interface ApiPollingState {
  agents: number[]
  agentInfos: AgentInfo[]
  layoutReady: boolean
}

export function useApiPolling(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  assetsReady = false,
  channelId?: string,
): ApiPollingState {
  const [agents, setAgents] = useState<number[]>([])
  const [agentInfos, setAgentInfos] = useState<AgentInfo[]>([])
  const [layoutReady, setLayoutReady] = useState(false)
  const layoutReadyRef = useRef(false)
  const agentMapRef = useRef<Map<string, number>>(new Map())
  const prevStateRef = useRef<Map<string, string>>(new Map())

  const initLayout = useCallback(() => {
    if (layoutReadyRef.current) return
    const os = getOfficeState()
    onLayoutLoaded?.(os.getLayout())
    layoutReadyRef.current = true
    setLayoutReady(true)
  }, [getOfficeState, onLayoutLoaded])

  // Wait for assets to be ready before loading layout
  useEffect(() => {
    if (!assetsReady) return
    if (layoutReadyRef.current) return

    // Try /assets first (Cloudflare), then /static/assets (local Rust server)
    const tryFetch = (path: string) => fetch(path).then(r => r.ok ? r.json() : null)
    tryFetch('/assets/default-layout.json')
      .then(layout => layout || tryFetch('/static/assets/default-layout.json'))
      .then((layout: OfficeLayout | null) => {
        if (layout && layout.version === 1) {
          const os = getOfficeState()
          os.rebuildFromLayout(layout)
          onLayoutLoaded?.(layout)
          layoutReadyRef.current = true
          setLayoutReady(true)
        } else {
          initLayout()
        }
      })
      .catch(() => {
        initLayout()
      })
  }, [assetsReady, getOfficeState, onLayoutLoaded, initLayout])

  useEffect(() => {
    if (!layoutReadyRef.current) return

    const poll = async () => {
      try {
        // Use channel-specific endpoint if channelId provided, otherwise legacy /agents
        const endpoint = channelId
          ? `${API_BASE}/channels/${channelId}/agents`
          : `${API_BASE}/agents`
        const resp = await fetch(endpoint)
        if (!resp.ok) return
        const apiAgents: ApiAgent[] = await resp.json()
        const os = getOfficeState()
        const agentMap = agentMapRef.current
        const prevStates = prevStateRef.current

        // Filter online agents (isMain only exists in legacy API)
        const onlineAgents = apiAgents.filter((a) => a.online && !a.isMain)
        const currentIds = new Set<string>()
        const numericIds: number[] = []
        const infos: AgentInfo[] = []

        for (const agent of onlineAgents) {
          currentIds.add(agent.agentId)
          let numId = agentMap.get(agent.agentId)

          if (numId === undefined) {
            numId = agentIdToNumeric(agent.agentId)
            while (os.characters.has(numId)) {
              numId++
            }
            agentMap.set(agent.agentId, numId)
            os.addAgent(numId)

            const ch = os.characters.get(numId)
            if (ch) {
              ch.folderName = agent.name
            }
          }

          numericIds.push(numId)
          infos.push({
            agentId: agent.agentId,
            numericId: numId,
            name: agent.name,
            state: agent.state,
            detail: agent.detail,
            framework: agent.framework || '',
          })

          // Update character state/detail on every poll
          const ch = os.characters.get(numId)
          if (ch) {
            ch.folderName = agent.name
            // Store detail in a custom field for the overlay
            ch.agentDetail = agent.detail
            ch.agentState = agent.state
          }

          const prevState = prevStates.get(agent.agentId)
          if (prevState !== agent.state) {
            prevStates.set(agent.agentId, agent.state)

            const active = isActiveState(agent.state)
            const tool = stateToTool(agent.state)
            os.setAgentTool(numId, tool)
            os.setAgentActive(numId, active)

            if (agent.state === 'error') {
              os.showPermissionBubble(numId)
            } else {
              os.clearPermissionBubble(numId)
            }
          }
        }

        for (const [strId, numId] of agentMap) {
          if (!currentIds.has(strId)) {
            os.removeAgent(numId)
            agentMap.delete(strId)
            prevStates.delete(strId)
          }
        }

        setAgents(numericIds)
        setAgentInfos(infos)
      } catch {
        // Network error -- skip
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [layoutReady, getOfficeState, channelId])

  return { agents, agentInfos, layoutReady }
}
