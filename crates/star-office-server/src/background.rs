use std::sync::Arc;
use tokio::time::{interval, Duration};
use crate::AppState;

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
