use agentkanban_core::task_runner::AppState;
use agentkanban_server::{app, build_state, find_static_dir};
use std::{env, net::SocketAddr};
use tracing_subscriber;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app_state = AppState::new().expect("failed to initialize application state");
    let static_dir = find_static_dir();
    let app = app(build_state(app_state), &static_dir);

    let port = env::var("AGENTKANBAN_SERVER_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(5577);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("AgentKanban server listening on http://{}", addr);
    tracing::info!("Serving static files from {}", static_dir.display());

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
