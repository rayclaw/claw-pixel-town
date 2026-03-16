import { useCallback } from 'react'
import type { GameSyncView } from '../../hooks/useGameApi'

// RPS choice icons
const RPS_ICONS: Record<string, string> = {
  rock: '🪨',
  paper: '📄',
  scissors: '✂️',
}

interface RpsState {
  currentRound: number
  phase: string
  myChoice?: string
  waitingFor?: number
  choices?: Record<string, string>
  roundResults?: Array<{
    round: number
    player1BotId: string
    player1Choice: string
    player2BotId: string
    player2Choice: string
    winnerBotId: string | null
  }>
}

interface RpsGameViewProps {
  gameState: GameSyncView
  onAction: (action: string, data?: Record<string, unknown>) => Promise<unknown>
  myBotId: string
}

export function RpsGameView({ gameState, onAction, myBotId }: RpsGameViewProps) {
  const state = gameState.publicState as unknown as RpsState
  const phase = gameState.currentPhase

  const handleChoice = useCallback(
    async (choice: string) => {
      await onAction(choice)
    },
    [onAction]
  )

  const handleNextRound = useCallback(async () => {
    await onAction('next_round')
  }, [onAction])

  // Find opponent
  const opponent = gameState.players.find((p) => p.botId !== myBotId)
  const me = gameState.players.find((p) => p.botId === myBotId)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Rock Paper Scissors</span>
        <span style={styles.round}>Round {state.currentRound || 1}</span>
      </div>

      {/* Score display */}
      <div style={styles.scoreBoard}>
        <div style={styles.playerScore}>
          <span style={styles.playerName}>{me?.botName || 'You'}</span>
          <span style={styles.score}>{me?.score || 0}</span>
        </div>
        <span style={styles.vs}>VS</span>
        <div style={styles.playerScore}>
          <span style={styles.playerName}>{opponent?.botName || 'Opponent'}</span>
          <span style={styles.score}>{opponent?.score || 0}</span>
        </div>
      </div>

      {/* Game area based on phase */}
      {phase === 'choosing' && (
        <div style={styles.choosingArea}>
          {state.myChoice ? (
            <div style={styles.waiting}>
              <span style={styles.chosenIcon}>{RPS_ICONS[state.myChoice]}</span>
              <span style={styles.waitingText}>Waiting for opponent...</span>
            </div>
          ) : (
            <>
              <div style={styles.prompt}>Choose your move!</div>
              <div style={styles.choices}>
                {gameState.availableActions.map((action) => (
                  <button
                    key={action}
                    style={styles.choiceButton}
                    onClick={() => handleChoice(action)}
                  >
                    <span style={styles.choiceIcon}>{RPS_ICONS[action]}</span>
                    <span style={styles.choiceLabel}>{action}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'reveal' && (
        <div style={styles.revealArea}>
          <div style={styles.revealRow}>
            {state.roundResults && state.roundResults.length > 0 && (
              <>
                <div style={styles.revealPlayer}>
                  <span style={styles.revealIcon}>
                    {RPS_ICONS[state.roundResults[state.roundResults.length - 1].player1Choice]}
                  </span>
                  <span style={styles.revealName}>
                    {gameState.players.find(
                      (p) => p.botId === state.roundResults![state.roundResults!.length - 1].player1BotId
                    )?.botName || 'Player 1'}
                  </span>
                </div>
                <span style={styles.vsLarge}>VS</span>
                <div style={styles.revealPlayer}>
                  <span style={styles.revealIcon}>
                    {RPS_ICONS[state.roundResults[state.roundResults.length - 1].player2Choice]}
                  </span>
                  <span style={styles.revealName}>
                    {gameState.players.find(
                      (p) => p.botId === state.roundResults![state.roundResults!.length - 1].player2BotId
                    )?.botName || 'Player 2'}
                  </span>
                </div>
              </>
            )}
          </div>
          <div style={styles.resultText}>
            {state.roundResults && state.roundResults.length > 0 && (
              state.roundResults[state.roundResults.length - 1].winnerBotId
                ? `${gameState.players.find(
                    (p) => p.botId === state.roundResults![state.roundResults!.length - 1].winnerBotId
                  )?.botName || 'Winner'} wins this round!`
                : "It's a draw!"
            )}
          </div>
          {gameState.availableActions.includes('next_round') && (
            <button style={styles.nextButton} onClick={handleNextRound}>
              Next Round
            </button>
          )}
        </div>
      )}

      {phase === 'finished' && (
        <div style={styles.finishedArea}>
          <div style={styles.finishedTitle}>
            {gameState.winnerBotId
              ? `${gameState.players.find((p) => p.botId === gameState.winnerBotId)?.botName || 'Winner'} Wins!`
              : "It's a Tie!"}
          </div>
          <div style={styles.finalScores}>
            {gameState.players.map((p) => (
              <div key={p.botId} style={styles.finalScore}>
                <span>{p.botName}</span>
                <span style={styles.finalScoreNum}>{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Round history */}
      {state.roundResults && state.roundResults.length > 0 && phase !== 'reveal' && (
        <div style={styles.history}>
          <div style={styles.historyTitle}>History</div>
          {state.roundResults.map((r, i) => (
            <div key={i} style={styles.historyRow}>
              <span>R{r.round}:</span>
              <span>{RPS_ICONS[r.player1Choice]} vs {RPS_ICONS[r.player2Choice]}</span>
              <span style={styles.historyWinner}>
                {r.winnerBotId
                  ? gameState.players.find((p) => p.botId === r.winnerBotId)?.botName
                  : 'Draw'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(20, 20, 40, 0.95)',
    borderRadius: 12,
    padding: 20,
    minWidth: 320,
    maxWidth: 400,
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  round: {
    fontSize: 14,
    opacity: 0.7,
  },
  scoreBoard: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
    padding: 12,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  playerScore: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  playerName: {
    fontSize: 12,
    opacity: 0.8,
  },
  score: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  vs: {
    fontSize: 14,
    opacity: 0.5,
  },
  choosingArea: {
    textAlign: 'center',
  },
  prompt: {
    fontSize: 16,
    marginBottom: 16,
  },
  choices: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
  },
  choiceButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '16px 20px',
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  choiceIcon: {
    fontSize: 36,
  },
  choiceLabel: {
    fontSize: 12,
    textTransform: 'capitalize',
    color: '#fff',
  },
  waiting: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  chosenIcon: {
    fontSize: 48,
  },
  waitingText: {
    opacity: 0.7,
  },
  revealArea: {
    textAlign: 'center',
  },
  revealRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
  },
  revealPlayer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  revealIcon: {
    fontSize: 48,
  },
  revealName: {
    fontSize: 14,
    opacity: 0.8,
  },
  vsLarge: {
    fontSize: 20,
    fontWeight: 'bold',
    opacity: 0.5,
  },
  resultText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#4ade80',
  },
  nextButton: {
    padding: '10px 24px',
    fontSize: 14,
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  finishedArea: {
    textAlign: 'center',
  },
  finishedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#fbbf24',
  },
  finalScores: {
    display: 'flex',
    justifyContent: 'center',
    gap: 40,
  },
  finalScore: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  finalScoreNum: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  history: {
    marginTop: 16,
    padding: 12,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  historyTitle: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 8,
  },
  historyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    padding: '4px 0',
    opacity: 0.8,
  },
  historyWinner: {
    color: '#4ade80',
  },
}
