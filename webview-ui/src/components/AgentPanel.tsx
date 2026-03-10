import type { AgentInfo } from '../hooks/useApiPolling.js'

interface AgentPanelProps {
  agentInfos: AgentInfo[]
  onSelectAgent: (numericId: number) => void
  selectedAgentId: number | null
}

const STATE_COLORS: Record<string, string> = {
  idle: '#6b7280',
  writing: '#22c55e',
  researching: '#3b82f6',
  executing: '#eab308',
  syncing: '#a855f7',
  error: '#ef4444',
}

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  writing: 'Writing',
  researching: 'Researching',
  executing: 'Executing',
  syncing: 'Syncing',
  error: 'Error',
}

export function AgentPanel({ agentInfos, onSelectAgent, selectedAgentId }: AgentPanelProps) {
  if (agentInfos.length === 0) {
    return (
      <div style={{
        position: 'absolute',
        top: 56,
        right: 12,
        zIndex: 50,
        background: 'rgba(20, 20, 30, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        padding: '8px 12px',
        width: 280,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      }}>
        <div style={{ fontSize: '14px', color: '#6b7280', fontFamily: 'monospace' }}>
          No agents online
        </div>
        <div style={{ fontSize: '11px', color: '#4b5563', fontFamily: 'monospace', marginTop: 4 }}>
          POST /join to connect an agent
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute',
      top: 56,
      right: 12,
      zIndex: 50,
      background: 'rgba(20, 20, 30, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      borderRadius: 8,
      padding: '6px 0',
      width: 280,
      maxHeight: 'calc(100vh - 100px)',
      overflowY: 'auto',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    }}>
      <div style={{
        padding: '6px 10px',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.5)',
        fontFamily: 'monospace',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: 4,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        Agents Online ({agentInfos.length})
      </div>
      {agentInfos.map((info) => {
        const color = STATE_COLORS[info.state] || '#6b7280'
        const label = STATE_LABELS[info.state] || info.state
        const isSelected = selectedAgentId === info.numericId

        return (
          <div
            key={info.agentId}
            onClick={() => onSelectAgent(info.numericId)}
            style={{
              padding: '5px 10px',
              cursor: 'pointer',
              background: isSelected ? 'rgba(255,255,255,0.06)' : 'transparent',
              borderLeft: isSelected ? '3px solid #5a8cff' : '3px solid transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'transparent'
            }}
          >
            {/* Name + Framework */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: '13px',
                color: '#e5e7eb',
                fontFamily: 'monospace',
                fontWeight: 600,
              }}>
                {info.name}
              </span>
              <span style={{
                fontSize: '10px',
                color: '#4b5563',
                fontFamily: 'monospace',
              }}>
                {info.framework}
              </span>
            </div>

            {/* State badge + Detail */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '11px',
                color: color,
                fontFamily: 'monospace',
                fontWeight: 500,
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                  animation: info.state !== 'idle' && info.state !== 'error' ? 'agent-pulse 1.5s ease-in-out infinite' : undefined,
                }} />
                {label}
              </span>
              {info.detail && (
                <span style={{
                  fontSize: '11px',
                  color: '#9ca3af',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {info.detail}
                </span>
              )}
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes agent-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
