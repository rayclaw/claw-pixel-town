use std::sync::Arc;
use tokio::time::{interval, Duration};
use chrono::{DateTime, Utc};
use pixel_town_core::types::GameStatus;
use crate::AppState;
use crate::events::ChannelEvent;

pub fn spawn_presence_task(state: Arc<AppState>) {
    let scan_secs = state.config.presence.scan_interval_secs;
    tokio::spawn(async move {
        let mut tick = interval(Duration::from_secs(scan_secs));
        loop {
            tick.tick().await;

            // Sync main agent state from main_state table
            if let Err(e) = state.db.sync_main_agent_state() {
                tracing::warn!("Failed to sync main agent state: {}", e);
            }

            // Auto-idle: working agents past TTL → idle
            match state.db.mark_idle_expired(state.config.presence.auto_idle_ttl_secs) {
                Ok(n) if n > 0 => tracing::info!("Auto-idle: {} agents moved to idle", n),
                Err(e) => tracing::warn!("Auto-idle error: {}", e),
                _ => {}
            }

            // Auto-offline: agents with no heartbeat → offline
            match state.db.mark_offline_expired(state.config.presence.auto_offline_ttl_secs) {
                Ok(n) if n > 0 => tracing::info!("Auto-offline: {} agents marked offline", n),
                Err(e) => tracing::warn!("Auto-offline error: {}", e),
                _ => {}
            }
        }
    });
}

/// Background task to check for game timeouts
pub fn spawn_game_timeout_task(state: Arc<AppState>) {
    tokio::spawn(async move {
        // Check every 5 seconds
        let mut tick = interval(Duration::from_secs(5));
        loop {
            tick.tick().await;

            // Get all playing games
            let games = match state.db.get_playing_games() {
                Ok(g) => g,
                Err(e) => {
                    tracing::warn!("Failed to get playing games for timeout check: {}", e);
                    continue;
                }
            };

            let now = Utc::now();

            for mut game in games {
                // Get timeout from config (default 60 seconds)
                let timeout_secs = game.config.get("timeoutSecs")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(60) as i64;

                // Parse phase_started_at
                let phase_started = match DateTime::parse_from_rfc3339(&game.phase_started_at) {
                    Ok(dt) => dt.with_timezone(&Utc),
                    Err(_) => continue,
                };

                let elapsed = now.signed_duration_since(phase_started).num_seconds();

                if elapsed > timeout_secs {
                    tracing::info!(
                        "Game {} timed out (phase: {}, elapsed: {}s, timeout: {}s)",
                        game.game_id, game.current_phase, elapsed, timeout_secs
                    );

                    // Cancel the game due to timeout
                    game.status = GameStatus::Cancelled;
                    game.finished_at = Some(now.to_rfc3339());

                    if let Err(e) = state.db.update_game(&game) {
                        tracing::error!("Failed to cancel timed-out game {}: {}", game.game_id, e);
                        continue;
                    }

                    // Emit GameCancelled event
                    let channel_id = game.channel_id.clone();
                    let game_id = game.game_id.clone();
                    state.events.send(&channel_id, ChannelEvent::GameCancelled {
                        game_id,
                        reason: format!("Timeout: no action for {}s", timeout_secs),
                    }).await;
                }
            }
        }
    });
}
