use crate::types::AgentState;

/// Normalize a raw state string into a canonical AgentState.
pub fn normalize_state(raw: &str) -> AgentState {
    AgentState::from_str_normalized(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize() {
        assert_eq!(normalize_state("working"), AgentState::Writing);
        assert_eq!(normalize_state("busy"), AgentState::Writing);
        assert_eq!(normalize_state("run"), AgentState::Executing);
        assert_eq!(normalize_state("running"), AgentState::Executing);
        assert_eq!(normalize_state("sync"), AgentState::Syncing);
        assert_eq!(normalize_state("research"), AgentState::Researching);
        assert_eq!(normalize_state("error"), AgentState::Error);
        assert_eq!(normalize_state("gibberish"), AgentState::Idle);
        assert_eq!(normalize_state("WRITING"), AgentState::Writing);
    }
}
