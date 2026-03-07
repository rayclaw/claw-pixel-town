import { useState, useEffect, useRef } from 'react'
import type { TownState } from '../town/TownState'

const API_BASE = '' // same origin
const POLL_INTERVAL_MS = 2000

interface ApiAgent {
  agentId: string
  name: string
  isMain: boolean
  state: string
  detail: string
  area: string
  framework: string
  online: boolean
  avatar: string
}

export interface AgentInfo {
  agentId: string
  numericId: number
  name: string
  state: string
  detail: string
  framework: string
}

function agentIdToNumeric(agentId: string): number {
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) || 1
}

function isActiveState(state: string): boolean {
  return state !== 'idle'
}

export function useTownPolling(
  townState: TownState,
  ready: boolean,
): { agents: number[]; agentInfos: AgentInfo[] } {
  const [agents, setAgents] = useState<number[]>([])
  const [agentInfos, setAgentInfos] = useState<AgentInfo[]>([])
  const agentMapRef = useRef<Map<string, number>>(new Map())
  const prevStateRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!ready) return

    const poll = async () => {
      try {
        const resp = await fetch(`${API_BASE}/agents`)
        if (!resp.ok) return
        const apiAgents: ApiAgent[] = await resp.json()
        const agentMap = agentMapRef.current
        const prevStates = prevStateRef.current

        const onlineAgents = apiAgents.filter((a) => a.online && !a.isMain)
        const currentIds = new Set<string>()
        const numericIds: number[] = []
        const infos: AgentInfo[] = []

        for (const agent of onlineAgents) {
          currentIds.add(agent.agentId)
          let numId = agentMap.get(agent.agentId)

          if (numId === undefined) {
            numId = agentIdToNumeric(agent.agentId)
            while (townState.characters.has(numId)) {
              numId++
            }
            agentMap.set(agent.agentId, numId)
            townState.addAgent(numId)
          }

          // Update character info
          const ch = townState.characters.get(numId)
          if (ch) {
            ch.folderName = agent.name
            ch.agentState = agent.state
            ch.agentDetail = agent.detail
          }

          numericIds.push(numId)
          infos.push({
            agentId: agent.agentId,
            numericId: numId,
            name: agent.name,
            state: agent.state,
            detail: agent.detail,
            framework: agent.framework,
          })

          const prevState = prevStates.get(agent.agentId)
          if (prevState !== agent.state) {
            prevStates.set(agent.agentId, agent.state)
            townState.setAgentActive(numId, isActiveState(agent.state))
          }
        }

        // Remove offline agents
        for (const [strId, numId] of agentMap) {
          if (!currentIds.has(strId)) {
            townState.removeAgent(numId)
            agentMap.delete(strId)
            prevStates.delete(strId)
          }
        }

        setAgents(numericIds)
        setAgentInfos(infos)
      } catch {
        // Network error - skip
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [ready, townState])

  return { agents, agentInfos }
}
