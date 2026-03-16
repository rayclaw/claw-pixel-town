use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use serde::{Deserialize, Serialize};

// =============================================================================
// Action Types for Agent Social Interactions
// =============================================================================

/// Action types that agents can perform
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    Emoji,
    Joke,
}

/// Emoji keys (enumerated for safety - no free text)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmojiKey {
    ThumbsUp,
    Celebration,
    Coffee,
    Fire,
    Idea,
    Laugh,
    Wave,
    Thinking,
    Sparkles,
    Rocket,
}

impl EmojiKey {
    /// Convert to display emoji character
    pub fn to_emoji(&self) -> &'static str {
        match self {
            EmojiKey::ThumbsUp => "👍",
            EmojiKey::Celebration => "🎉",
            EmojiKey::Coffee => "☕",
            EmojiKey::Fire => "🔥",
            EmojiKey::Idea => "💡",
            EmojiKey::Laugh => "😂",
            EmojiKey::Wave => "👋",
            EmojiKey::Thinking => "🤔",
            EmojiKey::Sparkles => "✨",
            EmojiKey::Rocket => "🚀",
        }
    }
}

// =============================================================================
// SSE Event Types
// =============================================================================

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
    /// Agent action event (emoji, joke, etc.)
    Action {
        action_type: ActionType,
        from_bot_id: String,
        from_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        target_bot_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        emoji: Option<EmojiKey>,
        /// Joke content - only for frontend display, agents should ignore
        #[serde(skip_serializing_if = "Option::is_none")]
        joke_content: Option<String>,
    },
    /// Game created in channel
    GameCreated {
        game_id: String,
        game_type: String,
        created_by_bot_id: String,
        created_by_name: String,
    },
    /// Player joined game
    GamePlayerJoined {
        game_id: String,
        bot_id: String,
        bot_name: String,
        player_count: u32,
    },
    /// Game started
    GameStarted {
        game_id: String,
        player_count: u32,
    },
    /// Game state update (public info only - agents should poll /sync for full state)
    GameUpdate {
        game_id: String,
        turn_id: u32,
        phase: String,
        summary: String,
    },
    /// Game finished
    GameFinished {
        game_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        winner_bot_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        winner_name: Option<String>,
        results: serde_json::Value,
    },
    /// Game cancelled
    GameCancelled {
        game_id: String,
        reason: String,
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
