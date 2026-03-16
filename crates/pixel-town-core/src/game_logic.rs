//! Game logic module - defines the GameLogic trait and game implementations.
//!
//! The Judge-Arbitrated Pattern:
//! - Agents never communicate directly
//! - Server acts as the "judge" to validate and execute actions
//! - Information asymmetry is enforced through filtered views

use crate::types::*;
use std::collections::HashMap;

/// Result of executing a game action
#[derive(Debug, Clone)]
pub struct ActionResult {
    pub new_turn_id: u32,
    pub public_summary: String,
    pub result_data: serde_json::Value,
}

/// Result when a game finishes
#[derive(Debug, Clone)]
pub struct GameResult {
    pub winner_bot_id: Option<String>,
    pub results: serde_json::Value,
}

/// Trait for game logic implementations
pub trait GameLogic: Send + Sync {
    /// Get the game type
    fn game_type(&self) -> GameType;

    /// Validate game configuration
    fn validate_config(&self, config: &serde_json::Value) -> Result<(), String>;

    /// Get minimum and maximum player count
    fn player_range(&self) -> (u32, u32);

    /// Initialize game state when game starts
    fn init_state(&self, players: &[GamePlayer], config: &serde_json::Value) -> serde_json::Value;

    /// Get available actions for a player given current state
    fn available_actions(&self, game: &Game, player: &GamePlayer) -> Vec<String>;

    /// Execute an action
    fn execute_action(
        &self,
        game: &mut Game,
        players: &mut [GamePlayer],
        bot_id: &str,
        action: &str,
        data: &serde_json::Value,
    ) -> Result<ActionResult, String>;

    /// Filter game state for a specific player (information asymmetry)
    fn filter_state_for_player(
        &self,
        game: &Game,
        players: &[GamePlayer],
        viewer_bot_id: &str,
    ) -> serde_json::Value;

    /// Check if game is finished
    fn is_finished(&self, game: &Game, players: &[GamePlayer]) -> Option<GameResult>;
}

// =============================================================================
// Rock-Paper-Scissors Implementation
// =============================================================================

pub struct RpsGame;

impl GameLogic for RpsGame {
    fn game_type(&self) -> GameType {
        GameType::Rps
    }

    fn validate_config(&self, config: &serde_json::Value) -> Result<(), String> {
        let cfg: RpsConfig = serde_json::from_value(config.clone())
            .map_err(|e| format!("Invalid RPS config: {}", e))?;

        if cfg.rounds < 1 || cfg.rounds > 5 {
            return Err("Rounds must be 1-5".to_string());
        }
        if cfg.rounds % 2 == 0 {
            return Err("Rounds must be odd (1, 3, or 5)".to_string());
        }
        if cfg.timeout_secs < 5 || cfg.timeout_secs > 120 {
            return Err("Timeout must be 5-120 seconds".to_string());
        }
        Ok(())
    }

    fn player_range(&self) -> (u32, u32) {
        (2, 2) // RPS is strictly 2 players
    }

    fn init_state(&self, _players: &[GamePlayer], _config: &serde_json::Value) -> serde_json::Value {
        let state = RpsState {
            current_round: 1,
            phase: RpsPhase::Choosing,
            choices: HashMap::new(),
            round_results: vec![],
        };
        serde_json::to_value(state).unwrap_or(serde_json::json!({}))
    }

    fn available_actions(&self, game: &Game, player: &GamePlayer) -> Vec<String> {
        let state: RpsState = match serde_json::from_value(game.state.clone()) {
            Ok(s) => s,
            Err(_) => return vec![],
        };

        match state.phase {
            RpsPhase::Choosing => {
                // Can only choose if haven't chosen yet
                if state.choices.contains_key(&player.bot_id) {
                    vec![]
                } else {
                    vec!["rock".to_string(), "paper".to_string(), "scissors".to_string()]
                }
            }
            RpsPhase::Reveal => {
                // After reveal, need to start next round
                vec!["next_round".to_string()]
            }
            _ => vec![],
        }
    }

    fn execute_action(
        &self,
        game: &mut Game,
        players: &mut [GamePlayer],
        bot_id: &str,
        action: &str,
        _data: &serde_json::Value,
    ) -> Result<ActionResult, String> {
        let mut state: RpsState = serde_json::from_value(game.state.clone())
            .map_err(|e| format!("Invalid game state: {}", e))?;

        let config: RpsConfig = serde_json::from_value(game.config.clone())
            .unwrap_or_default();

        match action {
            "rock" | "paper" | "scissors" => {
                // Validate phase
                if state.phase != RpsPhase::Choosing {
                    return Err("Not in choosing phase".to_string());
                }

                // Validate not already chosen
                if state.choices.contains_key(bot_id) {
                    return Err("Already made a choice".to_string());
                }

                // Parse and record choice
                let choice = RpsChoice::from_str(action)
                    .ok_or_else(|| format!("Invalid choice: {}", action))?;
                state.choices.insert(bot_id.to_string(), choice);

                let summary;

                // Check if both players have chosen
                if state.choices.len() == 2 {
                    // Resolve round
                    let bot_ids: Vec<_> = players.iter().map(|p| p.bot_id.clone()).collect();
                    let choice1 = state.choices.get(&bot_ids[0]).copied().unwrap();
                    let choice2 = state.choices.get(&bot_ids[1]).copied().unwrap();

                    let winner = Self::determine_winner(&bot_ids[0], choice1, &bot_ids[1], choice2);

                    let result = RpsRoundResult {
                        round: state.current_round,
                        player1_bot_id: bot_ids[0].clone(),
                        player1_choice: choice1,
                        player2_bot_id: bot_ids[1].clone(),
                        player2_choice: choice2,
                        winner_bot_id: winner.clone(),
                    };

                    // Update scores
                    if let Some(ref winner_id) = winner {
                        for player in players.iter_mut() {
                            if &player.bot_id == winner_id {
                                player.score += 1;
                            }
                        }
                    }

                    state.round_results.push(result);
                    state.phase = RpsPhase::Reveal;

                    summary = format!(
                        "Round {} complete: {} vs {}",
                        state.current_round,
                        choice1,
                        choice2
                    );
                } else {
                    summary = "Player made a choice (waiting for opponent)".to_string();
                }

                let old_phase = game.current_phase.clone();
                game.state = serde_json::to_value(&state).unwrap_or(serde_json::json!({}));
                game.turn_id += 1;
                game.current_phase = state.phase.to_string();
                // Reset phase timer when phase changes
                if game.current_phase != old_phase {
                    game.phase_started_at = chrono::Utc::now().to_rfc3339();
                }

                Ok(ActionResult {
                    new_turn_id: game.turn_id,
                    public_summary: summary,
                    result_data: serde_json::json!({ "ok": true }),
                })
            }

            "next_round" => {
                // Validate phase
                if state.phase != RpsPhase::Reveal {
                    return Err("Not in reveal phase".to_string());
                }

                // Check if game should end
                let wins_needed = (config.rounds / 2) + 1;
                let max_score = players.iter().map(|p| p.score).max().unwrap_or(0);

                if max_score >= wins_needed as i32 || state.current_round >= config.rounds {
                    // Game finished
                    state.phase = RpsPhase::Finished;
                    game.status = GameStatus::Finished;

                    let winner = players.iter()
                        .filter(|p| p.score == max_score)
                        .next()
                        .map(|p| p.bot_id.clone());

                    // Only set winner if there's a clear winner (not a tie)
                    let winners: Vec<_> = players.iter()
                        .filter(|p| p.score == max_score)
                        .collect();
                    game.winner_bot_id = if winners.len() == 1 {
                        Some(winners[0].bot_id.clone())
                    } else {
                        None
                    };
                    game.finished_at = Some(chrono::Utc::now().to_rfc3339());

                    game.state = serde_json::to_value(&state).unwrap_or(serde_json::json!({}));
                    game.turn_id += 1;
                    game.current_phase = state.phase.to_string();
                    game.phase_started_at = chrono::Utc::now().to_rfc3339();

                    return Ok(ActionResult {
                        new_turn_id: game.turn_id,
                        public_summary: format!("Game finished! Winner: {:?}", winner),
                        result_data: serde_json::json!({ "finished": true, "winner": winner }),
                    });
                }

                // Start next round
                state.current_round += 1;
                state.phase = RpsPhase::Choosing;
                state.choices.clear();

                game.state = serde_json::to_value(&state).unwrap_or(serde_json::json!({}));
                game.turn_id += 1;
                game.current_phase = state.phase.to_string();
                game.phase_started_at = chrono::Utc::now().to_rfc3339();

                Ok(ActionResult {
                    new_turn_id: game.turn_id,
                    public_summary: format!("Round {} started", state.current_round),
                    result_data: serde_json::json!({ "ok": true, "round": state.current_round }),
                })
            }

            _ => Err(format!("Invalid action: {}", action)),
        }
    }

    fn filter_state_for_player(
        &self,
        game: &Game,
        _players: &[GamePlayer],
        viewer_bot_id: &str,
    ) -> serde_json::Value {
        let state: RpsState = match serde_json::from_value(game.state.clone()) {
            Ok(s) => s,
            Err(_) => return serde_json::json!({}),
        };

        // During choosing phase, hide other player's choice
        if state.phase == RpsPhase::Choosing {
            let my_choice = state.choices.get(viewer_bot_id).map(|c| c.to_string());
            let waiting_count = 2 - state.choices.len() as u32;

            serde_json::json!({
                "currentRound": state.current_round,
                "phase": state.phase.to_string(),
                "myChoice": my_choice,
                "waitingFor": waiting_count,
                "roundResults": state.round_results,
            })
        } else {
            // In reveal/finished phase, show everything
            serde_json::json!({
                "currentRound": state.current_round,
                "phase": state.phase.to_string(),
                "choices": state.choices.iter()
                    .map(|(k, v)| (k.clone(), v.to_string()))
                    .collect::<HashMap<String, String>>(),
                "roundResults": state.round_results,
            })
        }
    }

    fn is_finished(&self, game: &Game, players: &[GamePlayer]) -> Option<GameResult> {
        let state: RpsState = serde_json::from_value(game.state.clone()).ok()?;
        let _config: RpsConfig = serde_json::from_value(game.config.clone()).ok()?;

        if state.phase != RpsPhase::Finished {
            return None;
        }

        // Determine winner
        let max_score = players.iter().map(|p| p.score).max().unwrap_or(0);
        let winners: Vec<_> = players.iter()
            .filter(|p| p.score == max_score)
            .collect();

        let winner_id = if winners.len() == 1 {
            Some(winners[0].bot_id.clone())
        } else {
            None // Tie
        };

        Some(GameResult {
            winner_bot_id: winner_id,
            results: serde_json::json!({
                "rounds": state.round_results,
                "finalScores": players.iter()
                    .map(|p| (p.bot_id.clone(), p.score))
                    .collect::<HashMap<String, i32>>(),
            }),
        })
    }
}

impl RpsGame {
    fn determine_winner(
        bot1: &str,
        choice1: RpsChoice,
        bot2: &str,
        choice2: RpsChoice,
    ) -> Option<String> {
        if choice1.beats(choice2) {
            Some(bot1.to_string())
        } else if choice2.beats(choice1) {
            Some(bot2.to_string())
        } else {
            None // Draw
        }
    }
}

// =============================================================================
// Game Registry
// =============================================================================

/// Registry of available game types
pub struct GameRegistry {
    games: HashMap<GameType, Box<dyn GameLogic>>,
}

impl GameRegistry {
    pub fn new() -> Self {
        let mut games: HashMap<GameType, Box<dyn GameLogic>> = HashMap::new();
        games.insert(GameType::Rps, Box::new(RpsGame));
        // Future: games.insert(GameType::Werewolf, Box::new(WerewolfGame));
        GameRegistry { games }
    }

    pub fn get(&self, game_type: GameType) -> Option<&dyn GameLogic> {
        self.games.get(&game_type).map(|b| b.as_ref())
    }

    pub fn is_supported(&self, game_type: GameType) -> bool {
        self.games.contains_key(&game_type)
    }
}

impl Default for GameRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rps_choice_beats() {
        assert!(RpsChoice::Rock.beats(RpsChoice::Scissors));
        assert!(RpsChoice::Paper.beats(RpsChoice::Rock));
        assert!(RpsChoice::Scissors.beats(RpsChoice::Paper));

        assert!(!RpsChoice::Rock.beats(RpsChoice::Paper));
        assert!(!RpsChoice::Rock.beats(RpsChoice::Rock));
    }

    #[test]
    fn test_rps_config_validation() {
        let rps = RpsGame;

        // Valid configs
        assert!(rps.validate_config(&serde_json::json!({"rounds": 1, "timeoutSecs": 30})).is_ok());
        assert!(rps.validate_config(&serde_json::json!({"rounds": 3, "timeoutSecs": 30})).is_ok());
        assert!(rps.validate_config(&serde_json::json!({"rounds": 5, "timeoutSecs": 30})).is_ok());

        // Invalid: even rounds
        assert!(rps.validate_config(&serde_json::json!({"rounds": 2, "timeoutSecs": 30})).is_err());

        // Invalid: too many rounds
        assert!(rps.validate_config(&serde_json::json!({"rounds": 7, "timeoutSecs": 30})).is_err());
    }

    #[test]
    fn test_game_registry() {
        let registry = GameRegistry::new();
        assert!(registry.is_supported(GameType::Rps));
        assert!(!registry.is_supported(GameType::Werewolf));
    }
}
