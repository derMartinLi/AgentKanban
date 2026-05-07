use agentkanban_core::{
    domain::HarnessConfig,
    error::AppError,
    task_runner::{AppState, CreateTaskInput},
};
use crate::event_sink::WsEventSink;
use axum::{
    extract::{
        rejection::{JsonRejection, QueryRejection},
        Path, Query, State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};

#[derive(Clone)]
pub struct ServerState {
    pub app_state: Arc<AppState>,
    pub event_sink: Arc<WsEventSink>,
}

// ---------- helpers ----------

fn ok<T: serde::Serialize>(value: T) -> axum::response::Response {
    Json(serde_json::json!({"data": value, "meta": {}})).into_response()
}

#[derive(Serialize)]
struct ErrorEnvelope {
    error: ErrorBody,
    meta: serde_json::Value,
}

#[derive(Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
    details: serde_json::Value,
}

fn error_response(error: impl Into<AppError>) -> axum::response::Response {
    let error = error.into();
    let status = status_for_error(&error);
    let body = ErrorEnvelope {
        error: ErrorBody {
            code: error.code().as_str(),
            message: error.to_string(),
            details: error.details(),
        },
        meta: serde_json::json!({}),
    };
    (status, Json(body)).into_response()
}

fn invalid_request_response(error: impl Into<String>) -> axum::response::Response {
    error_response(AppError::invalid_request(error.into()))
}

fn status_for_error(error: &AppError) -> StatusCode {
    match error.code().as_str() {
        "invalid_request" => StatusCode::BAD_REQUEST,
        "project_not_found" => StatusCode::NOT_FOUND,
        "project_not_linked" => StatusCode::CONFLICT,
        "project_missing_origin_remote" => StatusCode::CONFLICT,
        "project_path_mismatch" => StatusCode::BAD_REQUEST,
        "task_not_found" => StatusCode::NOT_FOUND,
        "illegal_transition" => StatusCode::CONFLICT,
        "command_failed" => StatusCode::INTERNAL_SERVER_ERROR,
        "permission_denied" => StatusCode::FORBIDDEN,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

// ---------- query / body types ----------

#[derive(Deserialize)]
pub struct ProjectIdQuery {
    pub project_id: String,
}

#[derive(Deserialize)]
pub struct RootDirBody {
    pub root_dir: String,
}

#[derive(Deserialize)]
pub struct TaskActionQuery {
    pub project_id: String,
}

#[derive(Deserialize)]
pub struct RegisterBody {
    pub project_path: String,
}

#[derive(Deserialize)]
pub struct TaskCreateBody {
    pub project_id: String,
    #[serde(default)]
    pub project_path: Option<String>,
    pub base_branch: String,
    pub description: String,
    pub cli_command: String,
    #[serde(default)]
    pub cli_args: Vec<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct AnswerBody {
    pub project_id: String,
    pub reply: String,
}

#[derive(Deserialize)]
pub struct RejectBody {
    pub project_id: String,
    pub feedback: String,
}

#[derive(Deserialize)]
pub struct ApproveBody {
    pub project_id: String,
}

// ---------- project routes ----------

pub async fn default_projects_root(State(state): State<ServerState>) -> impl IntoResponse {
    ok(serde_json::json!({ "root": state.app_state.default_projects_root() }))
}

pub async fn detect_cli_tools(State(state): State<ServerState>) -> impl IntoResponse {
    let tools = state.app_state.detect_cli_tools().await;
    ok(serde_json::json!({ "tools": tools }))
}

pub async fn list_registered_projects(State(state): State<ServerState>) -> impl IntoResponse {
    match state.app_state.list_registered_projects() {
        Ok(projects) => ok(projects),
        Err(error) => error_response(error),
    }
}

pub async fn discover_projects(
    State(state): State<ServerState>,
    body: Result<Json<RootDirBody>, JsonRejection>,
) -> impl IntoResponse {
    let Json(body) = match body {
        Ok(body) => body,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    match state.app_state.discover_projects(body.root_dir.as_ref()) {
        Ok(projects) => ok(projects),
        Err(error) => error_response(error),
    }
}

pub async fn register_project(
    State(state): State<ServerState>,
    body: Result<Json<RegisterBody>, JsonRejection>,
) -> impl IntoResponse {
    let Json(body) = match body {
        Ok(body) => body,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    match state.app_state.register_project(body.project_path.as_ref()) {
        Ok(project) => ok(project),
        Err(error) => error_response(error),
    }
}

pub async fn list_task_templates(State(state): State<ServerState>) -> impl IntoResponse {
    match state.app_state.list_task_templates() {
        Ok(templates) => ok(templates),
        Err(error) => error_response(error),
    }
}

// ---------- task routes ----------

pub async fn list_tasks(
    State(state): State<ServerState>,
    query: Result<Query<ProjectIdQuery>, QueryRejection>,
) -> impl IntoResponse {
    let Query(query) = match query {
        Ok(query) => query,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    match state.app_state.list_tasks(&query.project_id) {
        Ok(tasks) => ok(tasks),
        Err(error) => error_response(error),
    }
}

pub async fn get_task(
    State(state): State<ServerState>,
    Path(task_id): Path<String>,
    query: Result<Query<ProjectIdQuery>, QueryRejection>,
) -> impl IntoResponse {
    let Query(query) = match query {
        Ok(query) => query,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    match state.app_state.get_task(&query.project_id, &task_id) {
        Ok(task) => ok(task),
        Err(error) => error_response(error),
    }
}

pub async fn create_task(
    State(state): State<ServerState>,
    body: Result<Json<TaskCreateBody>, JsonRejection>,
) -> impl IntoResponse {
    let Json(body) = match body {
        Ok(body) => body,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    let input = CreateTaskInput {
        project_id: body.project_id,
        project_path: body.project_path,
        base_branch: body.base_branch,
        description: body.description,
        cli_command: body.cli_command,
        cli_args: body.cli_args,
        env_vars: body.env_vars,
    };
    match state.app_state.create_task(input) {
        Ok(task) => ok(task),
        Err(error) => error_response(error),
    }
}

pub async fn start_task(
    State(state): State<ServerState>,
    Path(task_id): Path<String>,
    query: Result<Query<TaskActionQuery>, QueryRejection>,
) -> impl IntoResponse {
    let Query(query) = match query {
        Ok(query) => query,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    let sink: WsEventSink = (*state.event_sink).clone();
    match state.app_state.start_task(sink, query.project_id, task_id).await {
        Ok(()) => ok(serde_json::json!({ "status": "started" })),
        Err(error) => error_response(error),
    }
}

pub async fn retry_task(
    State(state): State<ServerState>,
    Path(task_id): Path<String>,
    query: Result<Query<TaskActionQuery>, QueryRejection>,
) -> impl IntoResponse {
    let Query(query) = match query {
        Ok(query) => query,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    let sink: WsEventSink = (*state.event_sink).clone();
    match state.app_state.retry_task(sink, query.project_id, task_id).await {
        Ok(task) => ok(task),
        Err(error) => error_response(error),
    }
}

pub async fn answer_question(
    State(state): State<ServerState>,
    Path(task_id): Path<String>,
    body: Result<Json<AnswerBody>, JsonRejection>,
) -> impl IntoResponse {
    let Json(body) = match body {
        Ok(body) => body,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    let sink: WsEventSink = (*state.event_sink).clone();
    match state.app_state.answer_question(sink, body.project_id, task_id, body.reply).await {
        Ok(task) => ok(task),
        Err(error) => error_response(error),
    }
}

pub async fn approve_task(
    State(state): State<ServerState>,
    Path(task_id): Path<String>,
    body: Result<Json<ApproveBody>, JsonRejection>,
) -> impl IntoResponse {
    let Json(body) = match body {
        Ok(body) => body,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    let sink: WsEventSink = (*state.event_sink).clone();
    match state.app_state.approve_task(sink, body.project_id, task_id) {
        Ok(task) => ok(task),
        Err(error) => error_response(error),
    }
}

pub async fn reject_task(
    State(state): State<ServerState>,
    Path(task_id): Path<String>,
    body: Result<Json<RejectBody>, JsonRejection>,
) -> impl IntoResponse {
    let Json(body) = match body {
        Ok(body) => body,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    let sink: WsEventSink = (*state.event_sink).clone();
    match state.app_state.reject_task(sink, body.project_id, task_id, body.feedback).await {
        Ok(task) => ok(task),
        Err(error) => error_response(error),
    }
}

pub async fn load_task_logs(
    State(state): State<ServerState>,
    Path(task_id): Path<String>,
) -> impl IntoResponse {
    match state.app_state.load_task_logs(&task_id) {
        Ok(logs) => ok(logs),
        Err(error) => error_response(error),
    }
}

// ---------- config routes ----------

pub async fn load_harness_config(
    State(state): State<ServerState>,
    Path(project_id): Path<String>,
) -> impl IntoResponse {
    match state.app_state.load_harness_config(&project_id) {
        Ok(config) => ok(config),
        Err(error) => error_response(error),
    }
}

pub async fn save_harness_config(
    State(state): State<ServerState>,
    Path(project_id): Path<String>,
    config: Result<Json<HarnessConfig>, JsonRejection>,
) -> impl IntoResponse {
    let Json(config) = match config {
        Ok(config) => config,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    match state.app_state.save_harness_config(&project_id, config).await {
        Ok(config) => ok(config),
        Err(error) => error_response(error),
    }
}

// ---------- WebSocket ----------

pub async fn ws_handler(
    State(state): State<ServerState>,
    ws: WebSocketUpgrade,
    query: Result<Query<TaskActionQuery>, QueryRejection>,
) -> impl IntoResponse {
    let Query(query) = match query {
        Ok(query) => query,
        Err(error) => return invalid_request_response(error.body_text()),
    };

    let rx = state.event_sink.sender().subscribe();
    let project_id = query.project_id;
    ws.on_upgrade(move |socket| crate::event_sink::handle_ws(socket, project_id, rx))
}
