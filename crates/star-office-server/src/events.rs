use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use serde::Serialize;

/// SSE event types
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChannelEvent {
    AgentJoin {
        agent_id: String,
        bot_id: String,
        name: String,
        avatar: String,
    },
    AgentLeave {
        agent_id: String,
        bot_id: String,
    },
    AgentState {
        agent_id: String,
        bot_id: String,
        state: String,
        detail: String,
        area: String,
    },
    LayoutUpdate {
        layout: serde_json::Value,
    },
    ChannelUpdate {
        name: String,
        is_public: bool,
        max_members: u32,
    },
    Keepalive,
}

/// Event broadcaster for a single channel
struct ChannelBroadcaster {
    tx: broadcast::Sender<ChannelEvent>,
}

impl ChannelBroadcaster {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        ChannelBroadcaster { tx }
    }

    fn subscribe(&self) -> broadcast::Receiver<ChannelEvent> {
        self.tx.subscribe()
    }

    fn send(&self, event: ChannelEvent) {
        // Ignore error if no receivers
        let _ = self.tx.send(event);
    }

    fn receiver_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

/// Global event hub managing all channel broadcasters
pub struct EventHub {
    channels: RwLock<HashMap<String, Arc<ChannelBroadcaster>>>,
}

impl EventHub {
    pub fn new() -> Self {
        EventHub {
            channels: RwLock::new(HashMap::new()),
        }
    }

    /// Get or create a broadcaster for a channel (internal use)
    async fn get_broadcaster(&self, channel_id: &str) -> Arc<ChannelBroadcaster> {
        // Try read lock first
        {
            let channels = self.channels.read().await;
            if let Some(broadcaster) = channels.get(channel_id) {
                return broadcaster.clone();
            }
        }

        // Need to create new broadcaster
        let mut channels = self.channels.write().await;
        // Double-check after acquiring write lock
        if let Some(broadcaster) = channels.get(channel_id) {
            return broadcaster.clone();
        }

        let broadcaster = Arc::new(ChannelBroadcaster::new());
        channels.insert(channel_id.to_string(), broadcaster.clone());
        broadcaster
    }

    /// Subscribe to a channel's events
    pub async fn subscribe(&self, channel_id: &str) -> broadcast::Receiver<ChannelEvent> {
        let broadcaster = self.get_broadcaster(channel_id).await;
        broadcaster.subscribe()
    }

    /// Send an event to a channel
    pub async fn send(&self, channel_id: &str, event: ChannelEvent) {
        let broadcaster = self.get_broadcaster(channel_id).await;
        broadcaster.send(event);
    }

    /// Cleanup empty broadcasters (called periodically)
    pub async fn cleanup(&self) {
        let mut channels = self.channels.write().await;
        channels.retain(|_, broadcaster| broadcaster.receiver_count() > 0);
    }
}

impl Default for EventHub {
    fn default() -> Self {
        Self::new()
    }
}
