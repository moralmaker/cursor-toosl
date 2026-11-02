//! Accepts ordered Cursor Bidi append requests and routes them by request_id.
use prost::Message;

use crate::{
    cursor::{
        conversation::TransportCommand,
        protocol::{
            events,
            proto::{agent::v1 as agent, aiserver::v1 as ai},
        },
        transport::{TransportParent, TransportRegistry},
    },
    Error, Result,
};

pub struct DecodedAppend {
    pub request_id: String,
    pub seqno: i64,
    pub message: agent::AgentClientMessage,
}

impl DecodedAppend {
    pub fn model_id(&self) -> Option<&str> {
        let agent::agent_client_message::Message::RunRequest(request) =
            self.message.message.as_ref()?
        else {
            return None;
        };
        request
            .requested_model
            .as_ref()
            .map(|model| model.model_id.as_str())
            .filter(|model| !model.is_empty())
            .or_else(|| {
                request
                    .model_details
                    .as_ref()
                    .map(|model| model.model_id.as_str())
                    .filter(|model| !model.is_empty())
            })
    }

    pub fn conversation_id(&self) -> Option<&str> {
        let agent::agent_client_message::Message::RunRequest(request) =
            self.message.message.as_ref()?
        else {
            return None;
        };
        request.conversation_id.as_deref()
    }

    pub fn is_background_task_completion(&self) -> bool {
        let Some(agent::agent_client_message::Message::RunRequest(request)) =
            self.message.message.as_ref()
        else {
            return false;
        };
        matches!(
            request
                .action
                .as_ref()
                .and_then(|action| action.action.as_ref()),
            Some(agent::conversation_action::Action::BackgroundTaskCompletionAction(_))
        )
    }

    pub fn trace_metadata(&self) -> serde_json::Value {
        let Some(message) = self.message.message.as_ref() else {
            return serde_json::json!({
                "append_seqno": self.seqno,
                "message_type": "empty",
            });
        };
        let agent::agent_client_message::Message::RunRequest(request) = message else {
            return serde_json::json!({
                "append_seqno": self.seqno,
                "message_type": client_message_type(message),
            });
        };
        let (action_type, history_messages, history_images) = request
            .action
            .as_ref()
            .and_then(|action| action.action.as_ref())
            .map(|action| match action {
                agent::conversation_action::Action::UserMessageAction(action) => {
                    let history = action.conversation_history.as_ref();
                    (
                        "user_message",
                        history.map_or(0, |history| history.messages.len()),
                        history.map_or(0, history_image_count),
                    )
                }
                agent::conversation_action::Action::BackgroundTaskCompletionAction(_) => {
                    ("background_task_completion", 0, 0)
                }
                agent::conversation_action::Action::ExecutePlanAction(_) => ("execute_plan", 0, 0),
                agent::conversation_action::Action::SummarizeAction(_) => ("summarize", 0, 0),
                _ => ("other", 0, 0),
            })
            .unwrap_or(("none", 0, 0));
        let state = request.conversation_state.as_ref();
        serde_json::json!({
            "append_seqno": self.seqno,
            "message_type": "run_request",
            "conversation_id": request.conversation_id,
            "model_id": self.model_id(),
            "action_type": action_type,
            "conversation_history_messages": history_messages,
            "conversation_history_images": history_images,
            "root_message_count": state.map_or(0, |state| state.root_prompt_messages_json.len()),
            "turn_count": state.map_or(0, |state| state.turns.len()),
            "prefetched_blob_count": request.pre_fetched_blobs.len(),
        })
    }
}

fn client_message_type(message: &agent::agent_client_message::Message) -> &'static str {
    use agent::agent_client_message::Message;
    match message {
        Message::RunRequest(_) => "run_request",
        Message::ExecClientMessage(_) => "exec_client_message",
        Message::ExecClientControlMessage(_) => "exec_client_control_message",
        Message::KvClientMessage(_) => "kv_client_message",
        Message::ConversationAction(_) => "conversation_action",
        Message::InteractionResponse(_) => "interaction_response",
        Message::ClientHeartbeat(_) => "client_heartbeat",
        Message::PrewarmRequest(_) => "prewarm_request",
    }
}

fn history_image_count(history: &agent::ConversationHistory) -> usize {
    use agent::{
        conversation_history_message::Message,
        conversation_history_tool_result_content::Content as ToolContent,
        conversation_history_user_content::Content as UserContent,
    };
    history
        .messages
        .iter()
        .map(|message| match message.message.as_ref() {
            Some(Message::User(user)) => user
                .content
                .iter()
                .filter(|content| matches!(content.content, Some(UserContent::Image(_))))
                .count(),
            Some(Message::Tool(tool)) => tool
                .content
                .iter()
                .filter(|content| matches!(content.content, Some(ToolContent::Image(_))))
                .count(),
            _ => 0,
        })
        .sum()
}

pub fn decode(request: &ai::BidiAppendRequest) -> Result<DecodedAppend> {
    let request_id = request
        .request_id
        .as_ref()
        .map(|id| id.request_id.as_str())
        .filter(|id| !id.is_empty())
        .ok_or_else(|| Error::Protocol("BidiAppend request_id is required".into()))?;
    let payload = if !request.data_binary.is_empty() {
        request.data_binary.clone()
    } else if !request.data.is_empty() {
        hex::decode(&request.data)
            .map_err(|error| Error::Protocol(format!("invalid BidiAppend hex: {error}")))?
    } else {
        return Err(Error::Protocol(
            "BidiAppend contains no AgentClientMessage".into(),
        ));
    };
    Ok(DecodedAppend {
        request_id: request_id.into(),
        seqno: request.append_seqno,
        message: decode_agent_client(&payload)?,
    })
}

/// Cursor 3.27's HTTP fallback sends the bare `AgentRunRequest` in
/// `BidiAppend.data`. Reading those bytes as `AgentClientMessage` treats field 1
/// (the conversation state) as a nested run, then tries to parse its blob ids as
/// another conversation state.
fn decode_agent_client(payload: &[u8]) -> Result<agent::AgentClientMessage> {
    match agent::AgentClientMessage::decode(payload) {
        Ok(message) => Ok(message),
        Err(client_error) => match agent::AgentRunRequest::decode(payload) {
            Ok(run) if run_request_is_addressable(&run) => Ok(agent::AgentClientMessage {
                message: Some(agent::agent_client_message::Message::RunRequest(run)),
            }),
            _ => Err(client_error.into()),
        },
    }
}

fn run_request_is_addressable(run: &agent::AgentRunRequest) -> bool {
    let requested = run
        .requested_model
        .as_ref()
        .is_some_and(|model| !model.model_id.is_empty());
    let details = run
        .model_details
        .as_ref()
        .is_some_and(|model| !model.model_id.is_empty());
    let conversation = run
        .conversation_id
        .as_ref()
        .is_some_and(|id| !id.is_empty());
    requested || details || conversation
}

pub async fn append(
    registry: &TransportRegistry,
    request: DecodedAppend,
    parent: Option<TransportParent>,
) -> Result<ai::BidiAppendResponse> {
    let replace_closing = request.model_id().is_some();
    let handle = registry
        .get_or_create_for_append(&request.request_id, replace_closing)
        .await?;
    let _admission = handle.admit()?;
    if let Some(conversation_id) = request.conversation_id() {
        handle.set_conversation_id(conversation_id)?;
    }
    if let Some(parent) = parent {
        handle.set_parent(parent)?;
    }
    if matches!(
        request.message.message.as_ref(),
        Some(agent::agent_client_message::Message::ClientHeartbeat(_))
    ) {
        handle.emit(&events::heartbeat())?;
    }
    handle
        .command(TransportCommand::Append {
            seqno: request.seqno,
            message: Box::new(request.message),
        })
        .await?;
    Ok(ai::BidiAppendResponse {})
}

#[cfg(test)]
mod tests {
    use prost::Message;

    use super::*;

    fn run_with_blob() -> agent::AgentRunRequest {
        agent::AgentRunRequest {
            conversation_state: Some(agent::ConversationStateStructure {
                root_prompt_messages_json: vec![vec![0x16; 32]],
                turns: vec![vec![0x16; 32]],
                ..Default::default()
            }),
            requested_model: Some(agent::RequestedModel {
                model_id: "9d6cc56b55f933e8".into(),
                ..Default::default()
            }),
            conversation_id: Some("conv-1".into()),
            ..Default::default()
        }
    }

    fn append(payload: &[u8], binary: bool) -> ai::BidiAppendRequest {
        ai::BidiAppendRequest {
            data: if binary {
                String::new()
            } else {
                hex::encode(payload)
            },
            request_id: Some(ai::BidiRequestId {
                request_id: "request-1".into(),
            }),
            append_seqno: 0,
            data_binary: if binary { payload.to_vec() } else { Vec::new() },
        }
    }

    #[test]
    fn decodes_bare_agent_run_request_from_hex_or_binary() {
        let payload = run_with_blob().encode_to_vec();
        for binary in [false, true] {
            let decoded = decode(&append(&payload, binary)).expect("bare run request");
            assert_eq!(decoded.model_id(), Some("9d6cc56b55f933e8"));
            assert_eq!(decoded.conversation_id(), Some("conv-1"));
        }
    }

    #[test]
    fn decodes_wrapped_agent_client_message() {
        let client = agent::AgentClientMessage {
            message: Some(agent::agent_client_message::Message::RunRequest(
                run_with_blob(),
            )),
        };
        let decoded = decode(&append(&client.encode_to_vec(), false)).expect("wrapped message");
        assert_eq!(decoded.model_id(), Some("9d6cc56b55f933e8"));
    }

    #[test]
    fn does_not_promote_a_bare_run_that_has_no_model_or_conversation() {
        let run = agent::AgentRunRequest {
            conversation_state: Some(agent::ConversationStateStructure {
                root_prompt_messages_json: vec![vec![0x16; 32]],
                ..Default::default()
            }),
            ..Default::default()
        };
        match decode(&append(&run.encode_to_vec(), false)) {
            Err(error) => assert!(error.to_string().contains("protobuf decode error")),
            Ok(_) => panic!("unaddressed run must stay a decode error"),
        }
    }
}
