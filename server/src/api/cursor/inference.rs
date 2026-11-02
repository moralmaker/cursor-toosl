//! Serves Cursor 3.27 InferenceService runs for locally configured models.
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use axum::{
    body::Body,
    extract::Extension,
    http::{header, HeaderValue, Request, Response, StatusCode},
};
use bytes::Bytes;
use futures_util::StreamExt;
use prost::Message;
use tokio_util::sync::CancellationToken;

use crate::{
    api::cursor::proxy::{self, CursorProxy},
    cursor::{
        protocol::{
            connect,
            proto::{aiserver::v1 as ai, inference::v1 as pb},
        },
        transport::TransportRegistry,
    },
    model::{
        ContentPart, ModelInvocation, ModelRequest, ModelSpec, ProjectedContent, ProjectedMessage,
        PromptSpec, Role, ToolCallContent, ToolDefinition, ToolResultContent,
    },
    plugin::ADAPTER_ID_PREFIX,
    provider::ModelEvent,
    Error, Result,
};

struct Session {
    model_id: String,
    conversation_id: String,
    user_text: String,
    cancel: CancellationToken,
    heartbeat: CancellationToken,
}

fn sessions() -> &'static Mutex<HashMap<String, Session>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, Session>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn request_id(request: &ai::BidiAppendRequest) -> Option<String> {
    request
        .request_id
        .as_ref()
        .map(|id| id.request_id.clone())
        .filter(|id| !id.is_empty())
}

pub fn has_session(request_id: &str) -> bool {
    sessions()
        .lock()
        .expect("inference sessions")
        .contains_key(request_id)
}

pub fn acknowledge() -> Response<Body> {
    empty_proto()
}

pub fn recognize(request: &ai::BidiAppendRequest) -> Option<pb::RunInferenceClientMessage> {
    let payload = message_bytes(request)?;
    let message = pb::RunInferenceClientMessage::decode(payload.as_slice()).ok()?;
    if message.message.is_none() {
        return None;
    }
    // A real AgentClientMessage can share field 1 with a run request. Keep that
    // path on the agent decoder. Sidecars and messages the agent decoder rejects
    // belong to InferenceService.
    if !is_sidecar(&message)
        && crate::cursor::protocol::proto::agent::v1::AgentClientMessage::decode(payload.as_slice())
            .is_ok()
    {
        return None;
    }
    Some(message)
}

fn message_bytes(request: &ai::BidiAppendRequest) -> Option<Vec<u8>> {
    if !request.data_binary.is_empty() {
        return Some(request.data_binary.clone());
    }
    if request.data.is_empty() {
        return None;
    }
    hex::decode(&request.data).ok()
}

pub async fn append(
    registry: &TransportRegistry,
    proxy: CursorProxy,
    parts: axum::http::request::Parts,
    body: Bytes,
    append: &ai::BidiAppendRequest,
    message: pb::RunInferenceClientMessage,
) -> Result<Response<Body>> {
    let request_id = request_id(append)
        .ok_or_else(|| Error::Protocol("BidiAppend request_id is required".into()))?;
    if is_sidecar(&message) {
        if registry.upstream(&request_id).await {
            return proxy::forward(
                Extension(proxy),
                Request::from_parts(parts, Body::from(body)),
            )
            .await;
        }
        return Ok(empty_proto());
    }
    let model_id = inference_model_id(&message);
    let local = if let Some(model_id) = model_id.as_deref() {
        model_id.starts_with(ADAPTER_ID_PREFIX) || registry.store().model(model_id).await?.is_some()
    } else if registry.local(&request_id).await.is_some() {
        true
    } else if registry.upstream(&request_id).await {
        false
    } else {
        false
    };
    if !local {
        tracing::info!(
            request_id,
            model_id = model_id.as_deref().unwrap_or(""),
            "routing Cursor Inference to Cursor upstream"
        );
        registry.mark_upstream(&request_id).await;
        return proxy::forward(
            Extension(proxy),
            Request::from_parts(parts, Body::from(body)),
        )
        .await;
    }
    let Some(pb::run_inference_client_message::Message::RunRequest(run)) = &message.message else {
        return dispatch_local(registry, &request_id, message).await;
    };
    tracing::info!(
        request_id,
        model_id = model_id.as_deref().unwrap_or(""),
        conversation_id = run.conversation_id,
        "routing Cursor Inference to TOOLS provider"
    );
    let handle = registry.get_or_create(&request_id).await?;
    let user_text = run
        .routing_conversation
        .iter()
        .find(|message| message.role == 1)
        .map(|message| message.text.clone())
        .unwrap_or_default();
    let heartbeat = CancellationToken::new();
    let configured = match model_id.as_deref() {
        Some(id) => registry.store().model(id).await.ok().flatten(),
        None => None,
    };
    {
        let mut sessions = sessions().lock().expect("inference sessions");
        if let Some(previous) = sessions.insert(
            request_id.clone(),
            Session {
                model_id: model_id.clone().unwrap_or_default(),
                conversation_id: run.conversation_id.clone(),
                user_text,
                cancel: CancellationToken::new(),
                heartbeat: heartbeat.clone(),
            },
        ) {
            previous.heartbeat.cancel();
        }
    }
    spawn_heartbeat(handle.clone(), heartbeat);
    let ready = pb::RunInferenceServerMessage {
        message: Some(pb::run_inference_server_message::Message::RunReady(
            pb::RunInferenceRunReady {
                prompt_model_metadata: Some(prompt_metadata(
                    run.requested_model.as_ref(),
                    configured.as_ref(),
                )),
                resolved_model: run.requested_model.clone(),
            },
        )),
    };
    handle.emit_frame(connect::encode_message(&ready)?);
    Ok(empty_proto())
}

async fn dispatch_local(
    registry: &TransportRegistry,
    request_id: &str,
    message: pb::RunInferenceClientMessage,
) -> Result<Response<Body>> {
    let Some(kind) = message.message else {
        return Ok(empty_proto());
    };
    match kind {
        pb::run_inference_client_message::Message::InvokeModel(invoke) => {
            let session = sessions()
                .lock()
                .expect("inference sessions")
                .get(request_id)
                .map(|session| Session {
                    model_id: session.model_id.clone(),
                    conversation_id: session.conversation_id.clone(),
                    user_text: session.user_text.clone(),
                    cancel: session.cancel.clone(),
                    heartbeat: session.heartbeat.clone(),
                });
            let Some(session) = session else {
                return Err(Error::Protocol(
                    "Cursor Inference invoke has no run request".into(),
                ));
            };
            let handle = registry.get_or_create(request_id).await?;
            let provider = registry.conversations().provider();
            let request_id = request_id.to_string();
            tokio::spawn(async move {
                if let Err(error) =
                    stream_invocation(provider, handle, session, invoke, request_id).await
                {
                    tracing::warn!(%error, "Cursor Inference invocation failed");
                }
            });
            Ok(empty_proto())
        }
        pb::run_inference_client_message::Message::CancelInvocation(_) => {
            if let Some(session) = sessions()
                .lock()
                .expect("inference sessions")
                .get(request_id)
            {
                session.cancel.cancel();
            }
            Ok(empty_proto())
        }
        pb::run_inference_client_message::Message::FinishRun(_) => {
            if let Some(session) = sessions()
                .lock()
                .expect("inference sessions")
                .remove(request_id)
            {
                session.heartbeat.cancel();
            }
            if let Some(handle) = registry.local(request_id).await {
                handle.emit_frame(connect::encode_end_stream());
                handle.close_output();
            }
            Ok(empty_proto())
        }
        pb::run_inference_client_message::Message::RunRequest(_)
        | pb::run_inference_client_message::Message::ClientHeartbeat(_)
        | pb::run_inference_client_message::Message::AgentEvent(_)
        | pb::run_inference_client_message::Message::RunRequestLog(_)
        | pb::run_inference_client_message::Message::ResolveSubagentModels(_)
        | pb::run_inference_client_message::Message::ClientFirstCallTimings(_) => Ok(empty_proto()),
    }
}

fn is_sidecar(message: &pb::RunInferenceClientMessage) -> bool {
    matches!(
        message.message,
        Some(
            pb::run_inference_client_message::Message::ClientHeartbeat(_)
                | pb::run_inference_client_message::Message::AgentEvent(_)
                | pb::run_inference_client_message::Message::RunRequestLog(_)
                | pb::run_inference_client_message::Message::ResolveSubagentModels(_)
                | pb::run_inference_client_message::Message::ClientFirstCallTimings(_)
        )
    )
}

async fn stream_invocation(
    provider: std::sync::Arc<dyn crate::provider::Provider>,
    handle: crate::cursor::transport::TransportHandle,
    session: Session,
    invoke: pb::RunInferenceInvokeModel,
    request_id: String,
) -> Result<()> {
    let invocation_id = invoke.invocation_id.clone();
    let messages = invoke
        .request
        .as_ref()
        .map(|request| request.messages.clone())
        .unwrap_or_default();
    let mut instructions = String::new();
    let mut history = Vec::new();
    for (index, message) in messages.iter().enumerate() {
        let message_id = format!("{request_id}:{index}");
        match message.role {
            4 => {
                let text = message_text(message);
                if text.is_empty() {
                    continue;
                }
                if !instructions.is_empty() {
                    instructions.push('\n');
                }
                instructions.push_str(&text);
            }
            3 => {
                for (part_index, result) in tool_results(message).into_iter().enumerate() {
                    history.push(ProjectedMessage {
                        message_id: format!("{message_id}:{part_index}"),
                        role: Role::Tool,
                        content: ProjectedContent::ToolResult(result),
                    });
                }
            }
            2 => {
                let text = message_text(message);
                let calls = inference_tool_calls(message);
                if text.is_empty() && calls.is_empty() {
                    continue;
                }
                history.push(ProjectedMessage {
                    message_id,
                    role: Role::Assistant,
                    content: ProjectedContent::Assistant {
                        text,
                        thinking: String::new(),
                        replay_state: None,
                        calls,
                    },
                });
            }
            _ => {
                let text = message_text(message);
                if text.is_empty() {
                    continue;
                }
                history.push(ProjectedMessage {
                    message_id,
                    role: Role::User,
                    content: ProjectedContent::Parts(vec![ContentPart::Text { text }]),
                });
            }
        }
    }
    if history.is_empty() && !session.user_text.is_empty() {
        history.push(ProjectedMessage {
            message_id: format!("{request_id}:user"),
            role: Role::User,
            content: ProjectedContent::Parts(vec![ContentPart::Text {
                text: session.user_text,
            }]),
        });
    }
    let model_id = invoke
        .request
        .as_ref()
        .map(|request| {
            if !request.model_id.is_empty() {
                request.model_id.clone()
            } else {
                request
                    .requested_model
                    .as_ref()
                    .map(|model| model.model_id.clone())
                    .unwrap_or_default()
            }
        })
        .filter(|model| !model.is_empty())
        .unwrap_or(session.model_id);
    let invocation = ModelInvocation {
        call_id: format!("{request_id}:{invocation_id}"),
        run_id: request_id.clone(),
        conversation_id: session.conversation_id,
        provider_call_index: 0,
        request: ModelRequest {
            prompt: PromptSpec {
                instructions,
                tools: invoke
                    .request
                    .as_ref()
                    .map(inference_tools)
                    .unwrap_or_default(),
            },
            model: ModelSpec::new(model_id),
            history,
        },
    };
    let mut stream = provider.stream(invocation, session.cancel.clone());
    let mut failed = None;
    let mut tool_calls = HashMap::<usize, PendingToolCall>::new();
    while let Some(event) = stream.next().await {
        if session.cancel.is_cancelled() {
            break;
        }
        match event {
            Ok(ModelEvent::TextDelta(text)) if !text.is_empty() => {
                emit_text(&handle, &invocation_id, &text, false)?;
            }
            Ok(ModelEvent::ToolCallStart {
                index,
                call_id,
                name,
            }) => {
                tool_calls.insert(
                    index,
                    PendingToolCall {
                        call_id,
                        name,
                        args: String::new(),
                    },
                );
            }
            Ok(ModelEvent::ToolCallArgumentsDelta { index, delta }) => {
                if let Some(call) = tool_calls.get_mut(&index) {
                    call.args.push_str(&delta);
                }
            }
            Ok(ModelEvent::ToolCallEnd { index }) => {
                if let Some(call) = tool_calls.remove(&index) {
                    emit_tool_call(&handle, &invocation_id, index, &call)?;
                }
            }
            Ok(ModelEvent::Done(_)) => break,
            Ok(_) => {}
            Err(error) => {
                failed = Some(error.to_string());
                break;
            }
        }
    }
    for (index, call) in tool_calls {
        emit_tool_call(&handle, &invocation_id, index, &call)?;
    }
    if failed.is_none() && !session.cancel.is_cancelled() {
        emit_text(&handle, &invocation_id, "", true)?;
    }
    let end = pb::RunInferenceServerMessage {
        message: Some(pb::run_inference_server_message::Message::InvocationEnd(
            pb::RunInferenceInvocationEnd {
                invocation_id,
                error: failed.map(|message| pb::InvocationError { code: 1, message }),
            },
        )),
    };
    handle.emit_frame(connect::encode_message(&end)?);
    Ok(())
}

fn spawn_heartbeat(handle: crate::cursor::transport::TransportHandle, stop: CancellationToken) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(10));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        ticker.tick().await;
        loop {
            tokio::select! {
                _ = stop.cancelled() => break,
                _ = ticker.tick() => {
                    let message = pb::RunInferenceServerMessage {
                        message: Some(pb::run_inference_server_message::Message::Heartbeat(
                            pb::RunInferenceHeartbeat {
                                accepts_speculative_invocations: false,
                            },
                        )),
                    };
                    let Ok(frame) = connect::encode_message(&message) else {
                        break;
                    };
                    if !handle.emit_frame(frame) {
                        break;
                    }
                }
            }
        }
    });
}

fn emit_text(
    handle: &crate::cursor::transport::TransportHandle,
    invocation_id: &str,
    text: &str,
    is_final: bool,
) -> Result<()> {
    let message = pb::RunInferenceServerMessage {
        message: Some(
            pb::run_inference_server_message::Message::InvocationResponse(
                pb::RunInferenceInvocationResponse {
                    invocation_id: invocation_id.into(),
                    response: Some(pb::InferenceStreamResponse {
                        response: Some(pb::inference_stream_response::Response::TextPart(
                            pb::InferenceTextStreamPart {
                                text: text.into(),
                                is_final,
                            },
                        )),
                    }),
                },
            ),
        ),
    };
    handle.emit_frame(connect::encode_message(&message)?);
    Ok(())
}

struct PendingToolCall {
    call_id: String,
    name: String,
    args: String,
}

fn emit_tool_call(
    handle: &crate::cursor::transport::TransportHandle,
    invocation_id: &str,
    index: usize,
    call: &PendingToolCall,
) -> Result<()> {
    let args = if call.args.is_empty() {
        "{}".to_string()
    } else {
        call.args.clone()
    };
    let message = pb::RunInferenceServerMessage {
        message: Some(
            pb::run_inference_server_message::Message::InvocationResponse(
                pb::RunInferenceInvocationResponse {
                    invocation_id: invocation_id.into(),
                    response: Some(pb::InferenceStreamResponse {
                        response: Some(pb::inference_stream_response::Response::ToolCallPart(
                            pb::InferenceToolCallStreamPart {
                                tool_call_id: call.call_id.clone(),
                                tool_name: call.name.clone(),
                                args,
                                is_complete: true,
                                tool_index: Some(i32::try_from(index).unwrap_or(i32::MAX)),
                            },
                        )),
                    }),
                },
            ),
        ),
    };
    handle.emit_frame(connect::encode_message(&message)?);
    Ok(())
}

fn inference_tools(request: &pb::InferenceStreamRequest) -> Vec<ToolDefinition> {
    request
        .tools
        .iter()
        .filter(|tool| !tool.name.is_empty())
        .map(|tool| {
            let parameters = tool
                .parameters
                .as_ref()
                .map(json_struct)
                .filter(|value| value.as_object().is_some_and(|fields| !fields.is_empty()))
                .unwrap_or_else(|| serde_json::json!({"type": "object", "properties": {}}));
            ToolDefinition {
                name: tool.name.clone(),
                description: tool.description.clone(),
                parameters,
            }
        })
        .collect()
}

fn inference_tool_calls(message: &pb::InferenceCoreMessage) -> Vec<ToolCallContent> {
    message
        .tool_calls
        .iter()
        .enumerate()
        .filter(|(_, call)| !call.tool_name.is_empty() || !call.tool_call_id.is_empty())
        .map(|(index, call)| {
            let arguments = if !call.raw_tool_call_args.is_empty() {
                serde_json::from_str(&call.raw_tool_call_args)
                    .unwrap_or_else(|_| serde_json::Value::Object(Default::default()))
            } else {
                call.args
                    .as_ref()
                    .map(json_struct)
                    .unwrap_or_else(|| serde_json::Value::Object(Default::default()))
            };
            ToolCallContent {
                index,
                call_id: call.tool_call_id.clone(),
                name: call.tool_name.clone(),
                arguments,
            }
        })
        .collect()
}

fn tool_results(message: &pb::InferenceCoreMessage) -> Vec<ToolResultContent> {
    let Some(pb::inference_core_message::Content::ToolContent(content)) = &message.content else {
        return Vec::new();
    };
    content
        .parts
        .iter()
        .filter(|part| !part.tool_call_id.is_empty())
        .map(|part| ToolResultContent {
            call_id: part.tool_call_id.clone(),
            name: part.tool_name.clone(),
            content: part
                .result
                .as_ref()
                .map(json_value_text)
                .unwrap_or_default(),
            is_error: part.is_error,
            image: None,
            provider_parts: Vec::new(),
        })
        .collect()
}

fn json_struct(value: &pb::JsonStruct) -> serde_json::Value {
    serde_json::Value::Object(
        value
            .fields
            .iter()
            .map(|(key, value)| (key.clone(), json_value(value)))
            .collect(),
    )
}

fn json_value(value: &pb::JsonValue) -> serde_json::Value {
    match &value.kind {
        Some(pb::json_value::Kind::NumberValue(number)) => serde_json::Number::from_f64(*number)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Some(pb::json_value::Kind::StringValue(text)) => serde_json::Value::String(text.clone()),
        Some(pb::json_value::Kind::BoolValue(flag)) => serde_json::Value::Bool(*flag),
        Some(pb::json_value::Kind::StructValue(fields)) => json_struct(fields),
        Some(pb::json_value::Kind::ListValue(list)) => {
            serde_json::Value::Array(list.values.iter().map(json_value).collect())
        }
        Some(pb::json_value::Kind::NullValue(_)) | None => serde_json::Value::Null,
    }
}

fn json_value_text(value: &pb::JsonValue) -> String {
    match &value.kind {
        Some(pb::json_value::Kind::StringValue(text)) => text.clone(),
        Some(_) => json_value(value).to_string(),
        None => String::new(),
    }
}

fn message_text(message: &pb::InferenceCoreMessage) -> String {
    match &message.content {
        Some(pb::inference_core_message::Content::Text(text)) => text.clone(),
        Some(pb::inference_core_message::Content::Parts(parts)) => parts
            .parts
            .iter()
            .filter_map(|part| part.text.as_ref())
            .map(|text| text.text.clone())
            .collect(),
        Some(pb::inference_core_message::Content::ToolContent(_)) | None => String::new(),
    }
}

fn prompt_metadata(
    requested: Option<&pb::RequestedModel>,
    configured: Option<&crate::model::ModelConfig>,
) -> pb::RunInferencePromptModelMetadata {
    let vendor = match configured.map(|model| model.model_type) {
        Some(crate::model::ModelType::Anthropic) => "anthropic",
        Some(crate::model::ModelType::OpenAi) | None => "openai",
    };
    let reasoning_effort = requested
        .and_then(|model| {
            model.parameters.iter().find_map(|parameter| {
                matches!(parameter.id.as_str(), "reasoning" | "effort")
                    .then_some(parameter.value.as_str())
            })
        })
        .filter(|effort| {
            matches!(
                *effort,
                "low" | "medium" | "high" | "extra-high" | "xhigh" | "max"
            )
        })
        .unwrap_or("")
        .to_string();
    let agent_token_limit = requested
        .and_then(|model| {
            model
                .parameters
                .iter()
                .find(|parameter| parameter.id == "context")
                .and_then(|parameter| parse_context_tokens(&parameter.value))
        })
        .or_else(|| {
            configured
                .and_then(|model| model.context_window_tokens)
                .and_then(|tokens| i32::try_from(tokens).ok())
                .filter(|tokens| *tokens > 0)
        })
        .unwrap_or(0);
    let self_identity_name = configured
        .map(|model| model.display_name.trim())
        .filter(|name| !name.is_empty())
        .unwrap_or("assistant")
        .to_string();
    pb::RunInferencePromptModelMetadata {
        vendor: vendor.into(),
        prompt_version: "latest".into(),
        reasoning_effort,
        use_dsv3_harness: false,
        agent_token_limit,
        self_identity_name,
    }
}

fn parse_context_tokens(value: &str) -> Option<i32> {
    let value = value.trim();
    let (number, multiplier) = if let Some(number) = value.strip_suffix(['k', 'K']) {
        (number, 1_000_i64)
    } else if let Some(number) = value.strip_suffix(['m', 'M']) {
        (number, 1_000_000)
    } else {
        (value, 1)
    };
    let number = number.trim().parse::<i64>().ok()?;
    i32::try_from(number.saturating_mul(multiplier))
        .ok()
        .filter(|tokens| *tokens > 0)
}

fn inference_model_id(message: &pb::RunInferenceClientMessage) -> Option<String> {
    let model = match &message.message {
        Some(pb::run_inference_client_message::Message::RunRequest(run)) => {
            run.requested_model.as_ref()
        }
        Some(pb::run_inference_client_message::Message::InvokeModel(invoke)) => {
            let request = invoke.request.as_ref()?;
            if !request.model_id.is_empty() {
                return Some(request.model_id.clone());
            }
            request.requested_model.as_ref()
        }
        _ => None,
    }?;
    (!model.model_id.is_empty()).then(|| model.model_id.clone())
}

fn empty_proto() -> Response<Body> {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/proto"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_captured_run_inference_request() {
        let bytes = include_bytes!("fixtures/run_inference_client.bin");
        let message = pb::RunInferenceClientMessage::decode(bytes.as_slice())
            .expect("captured inference request");
        let pb::run_inference_client_message::Message::RunRequest(run) =
            message.message.expect("run request")
        else {
            panic!("expected run request");
        };
        assert_eq!(run.conversation_id, "f69d52e7-552d-403a-b532-09a9235c1421");
        assert_eq!(
            run.requested_model
                .as_ref()
                .map(|model| model.model_id.as_str()),
            Some("9d6cc56b55f933e8")
        );
        assert_eq!(
            run.routing_conversation
                .iter()
                .find(|message| message.role == 1)
                .map(|message| message.text.as_str()),
            Some("测试 qwen 3.8 模型是否正常")
        );
    }

    #[test]
    fn recognizes_inference_sidecar_rejected_by_agent_decoder() {
        // Field 6 agent_event, whose field 1 is a string. AgentClientMessage
        // reads that as InteractionResponse.id and rejects the varint mismatch.
        let name = b"tool";
        let mut event = Vec::new();
        event.push(0x0a);
        event.push(name.len() as u8);
        event.extend_from_slice(name);
        let mut payload = Vec::new();
        payload.push(0x32);
        payload.push(event.len() as u8);
        payload.extend_from_slice(&event);
        let request = ai::BidiAppendRequest {
            data: hex::encode(payload),
            request_id: Some(ai::BidiRequestId {
                request_id: "sidecar".into(),
            }),
            ..Default::default()
        };
        let message = recognize(&request).expect("agent event");
        assert!(matches!(
            message.message,
            Some(pb::run_inference_client_message::Message::AgentEvent(_))
        ));
    }

    #[test]
    fn prompt_metadata_uses_an_openai_compatible_family() {
        let model = pb::RequestedModel {
            model_id: "9d6cc56b55f933e8".into(),
            parameters: vec![
                pb::ModelParameter {
                    id: "reasoning".into(),
                    value: "high".into(),
                },
                pb::ModelParameter {
                    id: "context".into(),
                    value: "200k".into(),
                },
            ],
            ..Default::default()
        };
        let metadata = prompt_metadata(Some(&model), None);
        assert_eq!(metadata.vendor, "openai");
        assert_eq!(metadata.prompt_version, "latest");
        assert!(!metadata.use_dsv3_harness);
        assert_eq!(metadata.reasoning_effort, "high");
        assert_eq!(metadata.agent_token_limit, 200_000);
    }

    #[test]
    fn passes_agent_tools_and_prior_tool_results() {
        let mut fields = HashMap::new();
        fields.insert(
            "type".into(),
            pb::JsonValue {
                kind: Some(pb::json_value::Kind::StringValue("object".into())),
            },
        );
        let request = pb::InferenceStreamRequest {
            tools: vec![pb::InferenceAgentTool {
                name: "Read".into(),
                description: "read a file".into(),
                parameters: Some(pb::JsonStruct { fields }),
            }],
            ..Default::default()
        };
        let tools = inference_tools(&request);
        assert_eq!(tools[0].name, "Read");
        assert_eq!(tools[0].parameters["type"], "object");

        let message = pb::InferenceCoreMessage {
            role: 3,
            content: Some(pb::inference_core_message::Content::ToolContent(
                pb::InferenceToolResultContent {
                    parts: vec![pb::InferenceToolResultPart {
                        tool_call_id: "call-1".into(),
                        tool_name: "Read".into(),
                        result: Some(pb::JsonValue {
                            kind: Some(pb::json_value::Kind::StringValue("file text".into())),
                        }),
                        is_error: false,
                    }],
                },
            )),
            ..Default::default()
        };
        let results = tool_results(&message);
        assert_eq!(results[0].call_id, "call-1");
        assert_eq!(results[0].content, "file text");
    }
}
