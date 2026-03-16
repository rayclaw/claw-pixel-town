import { useLeaderboard } from '../../hooks/useGameApi'
import type { GameLeaderboard } from '../../hooks/useGameApi'

interface LeaderboardProps {
  channelId: string
}

export function Leaderboard({ channelId }: LeaderboardProps) {
  const { leaderboards, loading } = useLeaderboard(channelId)

  if (loading) {
    return <div style={styles.loading}>Loading leaderboard...</div>
  }

  if (leaderboards.length === 0) {
    return <div style={styles.empty}>No games played yet</div>
  }

  return (
    <div style={styles.container}>
      {leaderboards.map((board) => (
        <LeaderboardSection key={board.gameType} board={board} />
      ))}
    </div>
  )
}

function LeaderboardSection({ board }: { board: GameLeaderboard }) {
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div style={styles.section}>
      <div style={styles.header}>
        <span style={styles.gameIcon}>{getGameIcon(board.gameType)}</span>
        <span style={styles.gameName}>{board.gameName}</span>
      </div>
      <div style={styles.entries}>
        {board.entries.map((entry, index) => (
          <div key={entry.botId} style={styles.entry}>
            <span style={styles.medal}>{medals[index] || ''}</span>
            <span style={styles.name}>{entry.botName}</span>
            <span style={styles.wins}>{entry.wins} wins</span>
          </div>
        ))}
        {board.entries.length === 0 && (
          <div style={styles.noEntries}>No winners yet</div>
        )}
      </div>
    </div>
  )
}

function getGameIcon(gameType: string): string {
  switch (gameType) {
    case 'rps': return '✊'
    case 'werewolf': return '🐺'
    case 'poker': return '🃏'
    case 'riddle': return '❓'
    default: return '🎮'
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  loading: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
  },
  empty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
  },
  section: {
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  gameIcon: {
    fontSize: 16,
  },
  gameName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  entries: {
    padding: 8,
  },
  entry: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    borderRadius: 4,
  },
  medal: {
    width: 24,
    fontSize: 14,
    textAlign: 'center',
  },
  name: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
  },
  wins: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  noEntries: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    padding: 8,
  },
}
