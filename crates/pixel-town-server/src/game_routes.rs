//! Game API routes - implements the Judge-Arbitrated Pattern
//!
//! Key endpoints:
//! - POST /games/create - Create a new game
//! - POST /games/:id/join - Join a game
//! - POST /games/:id/start - Start a game
//! - GET  /games/:id/sync - Poll game state (filtered by bot)
//! - POST /games/:id/operate - Execute a game action

use std::sync::Arc;
use axum::{
    Router,
    extract::{State, Path, Query},
    http::StatusCode,
    response::Json,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use pixel_town_core::types::*;
use pixel_town_core::game_logic::GameRegistry;

use crate::AppState;
use crate::routes::{err, AppResult};
use crate::events::ChannelEvent;

// =============================================================================
// Routes
// =============================================================================

pub fn game_routes() -> Router<Arc<AppState>> {
    Router::new()
        // Game lifecycle
        .route("/games/create", post(create_game))
        .route("/games/:id", get(get_game))
        .route("/games/:id/join", post(join_game))
        .route("/games/:id/start", post(start_game))
        .route("/games/:id/cancel", post(cancel_game))
        // Core game API (Poll pattern)
        .route("/games/:id/sync", get(sync_game))
        .route("/games/:id/watch", get(watch_game))  // Spectator view
        .route("/games/:id/operate", post(operate))
        // Channel-level game listing
        .route("/channels/:channel_id/games", get(list_channel_games))
        .route("/channels/:channel_id/games/active", get(get_active_game))
        .route("/channels/:channel_id/games/leaderboard", get(get_channel_leaderboard))
}

// =============================================================================
// Request/Response Types
// =============================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateGameRequest {
    channel_id: String,
    game_type: String,
    bot_id: String,
    #[serde(default)]
    config: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinGameRequest {
    bot_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartGameRequest {
    bot_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelGameRequest {
    bot_id: String,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncQuery {
    bot_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OperateRequest {
    bot_id: String,
    turn_id: u32,
    action: String,
    #[serde(default)]
    data: serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OperateResponse {
    ok: bool,
    new_turn_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GameListItem {
    game_id: String,
    game_type: GameType,
    status: GameStatus,
    player_count: u32,
    created_by: String,
    created_at: String,
}

// =============================================================================
// Handlers
// =============================================================================

/// POST /games/create - Create a new game instance
async fn create_game(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateGameRequest>,
) -> AppResult<Json<Game>> {
    // Validate game type
    let game_type = GameType::from_str(&body.game_type)
        .ok_or_else(|| err(StatusCode::BAD_REQUEST, format!("Unknown game type: {}", body.game_type)))?;

    let registry = GameRegistry::new();
    let game_logic = registry.get(game_type)
        .ok_or_else(|| err(StatusCode::BAD_REQUEST, "Game type not supported"))?;

    // Validate bot exists and is in the channel
    let bot = state.db.get_bot(&body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Bot not found"))?;

    if bot.current_channel_id.as_ref() != Some(&body.channel_id) {
        return Err(err(StatusCode::BAD_REQUEST, "Bot is not in this channel"));
    }

    // Check no active game in channel
    if let Some(existing) = state.db.get_active_game_in_channel(&body.channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        return Err(err(StatusCode::CONFLICT, format!("Active game already exists: {}", existing.game_id)));
    }

    // Validate config
    let config = body.config.unwrap_or(serde_json::json!({"rounds": 3, "timeoutSecs": 30}));
    game_logic.validate_config(&config)
        .map_err(|e| err(StatusCode::BAD_REQUEST, e))?;

    // Create game
    let game_id = format!("game_{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string());
    let now = chrono::Utc::now().to_rfc3339();

    let game = Game {
        game_id: game_id.clone(),
        channel_id: body.channel_id.clone(),
        game_type,
        status: GameStatus::Waiting,
        config,
        state: serde_json::json!({}),
        turn_id: 0,
        current_phase: "waiting".to_string(),
        phase_started_at: now.clone(),
        winner_bot_id: None,
        created_by: body.bot_id.clone(),
        created_at: now.clone(),
        finished_at: None,
    };

    state.db.create_game(&game)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Add creator as first player
    let player = GamePlayer {
        game_id: game_id.clone(),
        bot_id: body.bot_id.clone(),
        seat_order: 0,
        role: String::new(),
        private_state: serde_json::json!({}),
        public_state: serde_json::json!({}),
        score: 0,
        is_alive: true,
        joined_at: now,
    };

    state.db.add_game_player(&player)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get alias for event (privacy protection)
    let bot_alias = state.db.get_or_create_bot_alias(&body.channel_id, &body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit GameCreated event (with alias, not real botId)
    state.events.send(&body.channel_id, ChannelEvent::GameCreated {
        game_id: game_id.clone(),
        game_type: game_type.to_string(),
        created_by_bot_id: bot_alias,
        created_by_name: bot.name.clone(),
    }).await;

    tracing::info!("Game created: {} ({}) by {}", game_id, game_type, body.bot_id);

    Ok(Json(game))
}

/// GET /games/:id - Get game info
async fn get_game(
    State(state): State<Arc<AppState>>,
    Path(game_id): Path<String>,
) -> AppResult<Json<Game>> {
    let game = state.db.get_game(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Game not found"))?;

    Ok(Json(game))
}

/// POST /games/:id/join - Join a game
async fn join_game(
    State(state): State<Arc<AppState>>,
    Path(game_id): Path<String>,
    Json(body): Json<JoinGameRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let game = state.db.get_game(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Game not found"))?;

    // Validate game is in waiting state
    if game.status != GameStatus::Waiting {
        return Err(err(StatusCode::BAD_REQUEST, "Game is not accepting players"));
    }

    // Validate bot exists and is in the channel
    let bot = state.db.get_bot(&body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Bot not found"))?;

    if bot.current_channel_id.as_ref() != Some(&game.channel_id) {
        return Err(err(StatusCode::BAD_REQUEST, "Bot is not in this channel"));
    }

    // Check if already joined
    if state.db.get_game_player(&game_id, &body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .is_some() {
        return Err(err(StatusCode::CONFLICT, "Already joined this game"));
    }

    // Check player limit
    let registry = GameRegistry::new();
    let game_logic = registry.get(game.game_type)
        .ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "Game type not found"))?;

    let (_, max_players) = game_logic.player_range();
    let current_count = state.db.count_game_players(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if current_count >= max_players {
        return Err(err(StatusCode::BAD_REQUEST, "Game is full"));
    }

    // Add player
    let now = chrono::Utc::now().to_rfc3339();
    let player = GamePlayer {
        game_id: game_id.clone(),
        bot_id: body.bot_id.clone(),
        seat_order: current_count,
        role: String::new(),
        private_state: serde_json::json!({}),
        public_state: serde_json::json!({}),
        score: 0,
        is_alive: true,
        joined_at: now,
    };

    state.db.add_game_player(&player)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let new_count = current_count + 1;

    // Get alias for event (privacy protection)
    let bot_alias = state.db.get_or_create_bot_alias(&game.channel_id, &body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit GamePlayerJoined event (with alias, not real botId)
    state.events.send(&game.channel_id, ChannelEvent::GamePlayerJoined {
        game_id: game_id.clone(),
        bot_id: bot_alias,
        bot_name: bot.name.clone(),
        player_count: new_count,
    }).await;

    tracing::info!("Bot {} joined game {}", body.bot_id, game_id);

    Ok(Json(serde_json::json!({ "ok": true, "playerCount": new_count })))
}

/// POST /games/:id/start - Start a game
async fn start_game(
    State(state): State<Arc<AppState>>,
    Path(game_id): Path<String>,
    Json(body): Json<StartGameRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let mut game = state.db.get_game(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Game not found"))?;

    // Only creator can start
    if game.created_by != body.bot_id {
        return Err(err(StatusCode::FORBIDDEN, "Only game creator can start"));
    }

    // Validate game is in waiting state
    if game.status != GameStatus::Waiting {
        return Err(err(StatusCode::BAD_REQUEST, "Game already started or finished"));
    }

    // Check minimum players
    let registry = GameRegistry::new();
    let game_logic = registry.get(game.game_type)
        .ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "Game type not found"))?;

    let (min_players, _) = game_logic.player_range();
    let player_count = state.db.count_game_players(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if player_count < min_players {
        return Err(err(StatusCode::BAD_REQUEST, format!("Need at least {} players", min_players)));
    }

    // Get players and initialize game state
    let players = state.db.get_game_players(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let initial_state = game_logic.init_state(&players, &game.config);

    // Update game
    let now = chrono::Utc::now().to_rfc3339();
    game.status = GameStatus::Playing;
    game.state = initial_state;
    game.current_phase = "choosing".to_string(); // RPS-specific
    game.phase_started_at = now;
    game.turn_id = 1;

    state.db.update_game(&game)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit GameStarted event
    state.events.send(&game.channel_id, ChannelEvent::GameStarted {
        game_id: game_id.clone(),
        player_count,
    }).await;

    tracing::info!("Game {} started with {} players", game_id, player_count);

    Ok(Json(serde_json::json!({ "ok": true, "turnId": game.turn_id })))
}

/// POST /games/:id/cancel - Cancel a game
async fn cancel_game(
    State(state): State<Arc<AppState>>,
    Path(game_id): Path<String>,
    Json(body): Json<CancelGameRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let mut game = state.db.get_game(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Game not found"))?;

    // Only creator can cancel
    if game.created_by != body.bot_id {
        return Err(err(StatusCode::FORBIDDEN, "Only game creator can cancel"));
    }

    // Can only cancel waiting or playing games
    if game.status != GameStatus::Waiting && game.status != GameStatus::Playing {
        return Err(err(StatusCode::BAD_REQUEST, "Game already finished or cancelled"));
    }

    let reason = body.reason.unwrap_or_else(|| "Cancelled by creator".to_string());

    // Update game
    game.status = GameStatus::Cancelled;
    game.finished_at = Some(chrono::Utc::now().to_rfc3339());

    state.db.update_game(&game)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Emit GameCancelled event
    state.events.send(&game.channel_id, ChannelEvent::GameCancelled {
        game_id: game_id.clone(),
        reason: reason.clone(),
    }).await;

    tracing::info!("Game {} cancelled: {}", game_id, reason);

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /games/:id/sync - Poll game state (filtered by bot_id)
async fn sync_game(
    State(state): State<Arc<AppState>>,
    Path(game_id): Path<String>,
    Query(query): Query<SyncQuery>,
) -> AppResult<Json<GameSyncView>> {
    let game = state.db.get_game(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Game not found"))?;

    // Validate bot is a participant
    let my_player = state.db.get_game_player(&game_id, &query.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::FORBIDDEN, "Not a participant in this game"))?;

    // Get all players
    let players = state.db.get_game_players(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get aliases for this channel (for privacy protection)
    let aliases = state.db.get_channel_aliases(&game.channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get game logic for filtering
    let registry = GameRegistry::new();
    let game_logic = registry.get(game.game_type)
        .ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "Game type not found"))?;

    // Filter state for this player (information asymmetry)
    let public_state = game_logic.filter_state_for_player(&game, &players, &query.bot_id);

    // Get available actions
    let available_actions = game_logic.available_actions(&game, &my_player);

    // Build player public views (with aliases)
    let mut player_views = Vec::with_capacity(players.len());
    for p in &players {
        let bot = state.db.get_bot(&p.bot_id)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let bot_alias = aliases.get(&p.bot_id).cloned()
            .unwrap_or_else(|| p.bot_id.clone());
        player_views.push(GamePlayerPublicView {
            bot_id: bot_alias,  // Use alias instead of real botId
            bot_name: bot.map(|b| b.name).unwrap_or_else(|| "Unknown".to_string()),
            seat_order: p.seat_order,
            public_state: p.public_state.clone(),
            score: p.score,
            is_alive: p.is_alive,
        });
    }

    // Convert winner_bot_id to alias if present
    let winner_alias = game.winner_bot_id.as_ref()
        .and_then(|id| aliases.get(id).cloned().or_else(|| Some(id.clone())));

    Ok(Json(GameSyncView {
        game_id: game.game_id,
        game_type: game.game_type,
        status: game.status,
        turn_id: game.turn_id,
        current_phase: game.current_phase,
        my_role: my_player.role,
        my_private_state: my_player.private_state,
        my_public_state: my_player.public_state,
        players: player_views,
        public_state,
        available_actions,
        winner_bot_id: winner_alias,  // Use alias for winner
    }))
}

/// GET /games/:id/watch - Spectator view (public state only, no bot_id required)
async fn watch_game(
    State(state): State<Arc<AppState>>,
    Path(game_id): Path<String>,
) -> AppResult<Json<GameSyncView>> {
    let game = state.db.get_game(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Game not found"))?;

    // Get all players
    let players = state.db.get_game_players(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get aliases for this channel (for privacy protection)
    let aliases = state.db.get_channel_aliases(&game.channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get game logic for filtering
    let registry = GameRegistry::new();
    let game_logic = registry.get(game.game_type)
        .ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "Game type not found"))?;

    // Get public state (spectator sees what's publicly visible)
    // Use empty string as bot_id - filter_state_for_player will return public-only view
    let public_state = game_logic.filter_state_for_player(&game, &players, "");

    // Build player public views (with aliases)
    let mut player_views = Vec::with_capacity(players.len());
    for p in &players {
        let bot = state.db.get_bot(&p.bot_id)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let bot_alias = aliases.get(&p.bot_id).cloned()
            .unwrap_or_else(|| p.bot_id.clone());
        player_views.push(GamePlayerPublicView {
            bot_id: bot_alias,  // Use alias instead of real botId
            bot_name: bot.map(|b| b.name).unwrap_or_else(|| "Unknown".to_string()),
            seat_order: p.seat_order,
            public_state: p.public_state.clone(),
            score: p.score,
            is_alive: p.is_alive,
        });
    }

    // Convert winner_bot_id to alias if present
    let winner_alias = game.winner_bot_id.as_ref()
        .and_then(|id| aliases.get(id).cloned().or_else(|| Some(id.clone())));

    Ok(Json(GameSyncView {
        game_id: game.game_id,
        game_type: game.game_type,
        status: game.status,
        turn_id: game.turn_id,
        current_phase: game.current_phase,
        my_role: String::new(),  // Spectator has no role
        my_private_state: serde_json::json!({}),  // No private state
        my_public_state: serde_json::json!({}),
        players: player_views,
        public_state,
        available_actions: vec![],  // Spectators can't act
        winner_bot_id: winner_alias,  // Use alias for winner
    }))
}

/// POST /games/:id/operate - Execute a game action
async fn operate(
    State(state): State<Arc<AppState>>,
    Path(game_id): Path<String>,
    Json(body): Json<OperateRequest>,
) -> AppResult<Json<OperateResponse>> {
    let mut game = state.db.get_game(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Game not found"))?;

    // Validate game is playing
    if game.status != GameStatus::Playing {
        return Err(err(StatusCode::BAD_REQUEST, "Game is not in playing state"));
    }

    // Validate turn_id (prevents replay attacks)
    if body.turn_id != game.turn_id {
        return Err(err(StatusCode::CONFLICT, format!(
            "Turn ID mismatch: expected {}, got {}",
            game.turn_id, body.turn_id
        )));
    }

    // Validate bot is a participant
    let my_player = state.db.get_game_player(&game_id, &body.bot_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::FORBIDDEN, "Not a participant in this game"))?;

    // Get all players
    let mut players = state.db.get_game_players(&game_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get game logic
    let registry = GameRegistry::new();
    let game_logic = registry.get(game.game_type)
        .ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "Game type not found"))?;

    // Validate action is available
    let available = game_logic.available_actions(&game, &my_player);
    if !available.contains(&body.action) {
        return Err(err(StatusCode::BAD_REQUEST, format!(
            "Action '{}' not available. Available: {:?}",
            body.action, available
        )));
    }

    // Execute action
    let result = game_logic.execute_action(
        &mut game,
        &mut players,
        &body.bot_id,
        &body.action,
        &body.data,
    ).map_err(|e| err(StatusCode::BAD_REQUEST, e))?;

    // Log action
    let action_log = GameAction {
        action_id: 0,
        game_id: game_id.clone(),
        turn_id: body.turn_id,
        bot_id: body.bot_id.clone(),
        action_type: body.action.clone(),
        action_data: body.data.clone(),
        result: result.result_data.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state.db.log_game_action(&action_log)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update game state
    state.db.update_game(&game)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update player states
    for player in &players {
        state.db.update_game_player(player)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // Emit GameUpdate event
    state.events.send(&game.channel_id, ChannelEvent::GameUpdate {
        game_id: game_id.clone(),
        turn_id: result.new_turn_id,
        phase: game.current_phase.clone(),
        summary: result.public_summary.clone(),
    }).await;

    // Check if game finished
    if game.status == GameStatus::Finished {
        let (winner_alias, winner_name) = if let Some(ref winner_id) = game.winner_bot_id {
            let alias = state.db.get_bot_alias(&game.channel_id, winner_id)
                .ok()
                .flatten()
                .unwrap_or_else(|| winner_id.clone());
            let name = state.db.get_bot(winner_id)
                .ok()
                .flatten()
                .map(|b| b.name);
            (Some(alias), name)
        } else {
            (None, None)
        };

        state.events.send(&game.channel_id, ChannelEvent::GameFinished {
            game_id: game_id.clone(),
            winner_bot_id: winner_alias,  // Use alias instead of real botId
            winner_name,
            results: result.result_data.clone(),
        }).await;

        tracing::info!("Game {} finished, winner: {:?}", game_id, game.winner_bot_id);
    }

    Ok(Json(OperateResponse {
        ok: true,
        new_turn_id: result.new_turn_id,
        error: None,
        result: Some(result.result_data),
    }))
}

/// GET /channels/:channel_id/games - List games in a channel
async fn list_channel_games(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
) -> AppResult<Json<Vec<GameListItem>>> {
    let games = state.db.list_channel_games(&channel_id, 20)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get aliases for this channel (for privacy protection)
    let aliases = state.db.get_channel_aliases(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut items = Vec::with_capacity(games.len());
    for g in games {
        let player_count = state.db.count_game_players(&g.game_id)
            .unwrap_or(0);
        // Use alias for created_by
        let created_by_alias = aliases.get(&g.created_by).cloned()
            .unwrap_or_else(|| g.created_by.clone());
        items.push(GameListItem {
            game_id: g.game_id,
            game_type: g.game_type,
            status: g.status,
            player_count,
            created_by: created_by_alias,  // Use alias instead of real botId
            created_at: g.created_at,
        });
    }

    Ok(Json(items))
}

/// GET /channels/:channel_id/games/active - Get active game in channel
async fn get_active_game(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
) -> AppResult<Json<Option<Game>>> {
    let game = state.db.get_active_game_in_channel(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(game))
}

/// GET /channels/:channel_id/games/leaderboard - Get game leaderboard for channel
async fn get_channel_leaderboard(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<String>,
) -> AppResult<Json<Vec<GameLeaderboard>>> {
    // Get raw leaderboard data (game_type, bot_id, wins)
    let data = state.db.get_channel_leaderboard(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get aliases for privacy
    let aliases = state.db.get_channel_aliases(&channel_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Group by game_type and build leaderboards
    let mut leaderboards: std::collections::HashMap<String, Vec<LeaderboardEntry>> = std::collections::HashMap::new();

    for (game_type, bot_id, wins) in data {
        let entries = leaderboards.entry(game_type).or_insert_with(Vec::new);

        // Only keep top 3
        if entries.len() >= 3 {
            continue;
        }

        // Get bot name
        let bot_name = state.db.get_bot(&bot_id)
            .ok()
            .flatten()
            .map(|b| b.name)
            .unwrap_or_else(|| "Unknown".to_string());

        // Use alias for privacy
        let bot_alias = aliases.get(&bot_id).cloned()
            .unwrap_or_else(|| bot_id.clone());

        entries.push(LeaderboardEntry {
            bot_id: bot_alias,
            bot_name,
            wins,
            rank: (entries.len() + 1) as u32,
        });
    }

    // Convert to response format
    let result: Vec<GameLeaderboard> = leaderboards.into_iter()
        .map(|(game_type_str, entries)| {
            let game_type = GameType::from_str(&game_type_str).unwrap_or(GameType::Rps);
            let game_name = match game_type {
                GameType::Rps => "Rock Paper Scissors",
                GameType::Werewolf => "Werewolf",
                GameType::Poker => "Poker",
                GameType::Riddle => "Riddle",
            }.to_string();

            GameLeaderboard {
                game_type,
                game_name,
                entries,
            }
        })
        .collect();

    Ok(Json(result))
}
