pub mod api;
pub mod event_sink;

use agentkanban_core::task_runner::AppState;
use axum::{routing::{get, post, put}, Router};
use std::{path::PathBuf, sync::Arc};
use tower_http::{cors::CorsLayer, services::ServeDir};

pub fn build_state(app_state: AppState) -> api::ServerState {
    let event_sink = Arc::new(event_sink::WsEventSink::new());
    api::ServerState {
        app_state: Arc::new(app_state),
        event_sink,
    }
}

pub fn app(state: api::ServerState, static_dir: impl Into<PathBuf>) -> Router {
    let api_routes = Router::new()
        .route("/api/projects/root", get(api::default_projects_root))
        .route("/api/cli-tools", get(api::detect_cli_tools))
        .route("/api/projects/registered", get(api::list_registered_projects))
        .route("/api/projects/discover", post(api::discover_projects))
        .route("/api/projects/register", post(api::register_project))
        .route("/api/templates", get(api::list_task_templates))
        .route("/api/tasks", get(api::list_tasks))
        .route("/api/tasks/{task_id}", get(api::get_task))
        .route("/api/tasks", post(api::create_task))
        .route("/api/tasks/{task_id}/start", post(api::start_task))
        .route("/api/tasks/{task_id}/retry", post(api::retry_task))
        .route("/api/tasks/{task_id}/answer", post(api::answer_question))
        .route("/api/tasks/{task_id}/approve", post(api::approve_task))
        .route("/api/tasks/{task_id}/reject", post(api::reject_task))
        .route("/api/tasks/{task_id}/logs", get(api::load_task_logs))
        .route("/api/config/{project_id}", get(api::load_harness_config))
        .route("/api/config/{project_id}", put(api::save_harness_config))
        .route("/ws", get(api::ws_handler));

    Router::new()
        .merge(api_routes.with_state(state))
        .layer(CorsLayer::permissive())
        .fallback_service(ServeDir::new(static_dir.into()))
}

pub fn find_static_dir() -> PathBuf {
    let candidates = [
        PathBuf::from("dist"),
        PathBuf::from("../dist"),
        PathBuf::from("../../dist"),
    ];

    for candidate in &candidates {
        if candidate.join("index.html").exists() {
            return candidate.clone();
        }
    }

    PathBuf::from("../dist")
}