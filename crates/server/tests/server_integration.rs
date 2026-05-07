use agentkanban_core::{
    domain::Task,
    events::TaskEventSink,
    storage::Storage,
    task_runner::AppState,
};
use agentkanban_server::{app, build_state};
use futures::StreamExt;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command as StdCommand,
    time::Duration,
};
use tokio::{net::TcpListener, task::JoinHandle, time::timeout};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

struct TestServer {
    base_url: String,
    ws_url: String,
    root: PathBuf,
    state: agentkanban_server::api::ServerState,
    handle: JoinHandle<()>,
}

impl TestServer {
    async fn spawn() -> Self {
        let root = unique_temp_dir("agentkanban-server-test");
        let storage_root = root.join("storage");
        let static_root = root.join("static");
        fs::create_dir_all(&static_root).expect("create static root");
        fs::write(static_root.join("index.html"), "<html><body>ok</body></html>")
            .expect("write test index");

        let app_state = AppState::with_storage(Storage::new(storage_root).expect("create storage"));
        let state = build_state(app_state);
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind test listener");
        let addr = listener.local_addr().expect("read local addr");
        let server = app(state.clone(), &static_root);
        let handle = tokio::spawn(async move {
            axum::serve(listener, server).await.expect("serve test app");
        });

        Self {
            base_url: format!("http://{}", addr),
            ws_url: format!("ws://{}/ws", addr),
            root,
            state,
            handle,
        }
    }

    async fn shutdown(self) {
        self.handle.abort();
        let _ = self.handle.await;
        let _ = fs::remove_dir_all(self.root);
    }
}

#[tokio::test]
async fn discover_projects_accepts_post_body_root_dir() {
    let server = TestServer::spawn().await;
    let scan_root = server.root.join("scan");
    fs::create_dir_all(scan_root.join("alpha").join(".git")).expect("create git marker");

    let response = reqwest::Client::new()
        .post(format!("{}/api/projects/discover", server.base_url))
        .json(&json!({ "root_dir": scan_root.to_string_lossy() }))
        .send()
        .await
        .expect("send discover request");

    assert!(response.status().is_success());

    let body: Value = response.json().await.expect("parse discover response");
    let projects = body["data"].as_array().expect("discover data should be an array");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0]["name"], "alpha");
    assert!(body["meta"].is_object());

    server.shutdown().await;
}

#[tokio::test]
async fn register_project_returns_structured_error_when_origin_is_missing() {
    let server = TestServer::spawn().await;
    let repo = init_git_repo(&server.root, "missing-origin", false);

    let response = reqwest::Client::new()
        .post(format!("{}/api/projects/register", server.base_url))
        .json(&json!({ "project_path": repo.to_string_lossy() }))
        .send()
        .await
        .expect("send register request");

    assert_eq!(response.status(), reqwest::StatusCode::CONFLICT);

    let body: Value = response.json().await.expect("parse register error response");
    assert_eq!(body["error"]["code"], "project_missing_origin_remote");
    assert_eq!(
        body["error"]["message"],
        "project must have an origin remote to support collaboration flows"
    );
    assert_eq!(body["error"]["details"]["project_path"], repo.to_string_lossy().as_ref());
    assert!(body["meta"].is_object());

    server.shutdown().await;
}

#[tokio::test]
async fn create_task_accepts_project_id_without_compat_project_path() {
    let server = TestServer::spawn().await;
    let repo = init_git_repo(&server.root, "linked-project", true);

    let register_response = reqwest::Client::new()
        .post(format!("{}/api/projects/register", server.base_url))
        .json(&json!({ "project_path": repo.to_string_lossy() }))
        .send()
        .await
        .expect("register linked project");
    assert!(register_response.status().is_success());

    let register_body: Value = register_response
        .json()
        .await
        .expect("parse register response");
    let project_id = register_body["data"]["id"]
        .as_str()
        .expect("project id should exist")
        .to_string();

    let create_response = reqwest::Client::new()
        .post(format!("{}/api/tasks", server.base_url))
        .json(&json!({
            "project_id": project_id,
            "base_branch": "main",
            "description": "Create task with project_id only",
            "cli_command": "codex",
            "cli_args": [],
            "env_vars": {}
        }))
        .send()
        .await
        .expect("send create task request");

    assert!(create_response.status().is_success());

    let body: Value = create_response
        .json()
        .await
        .expect("parse create task response");
    assert_eq!(body["data"]["project_id"], register_body["data"]["id"]);
    assert_eq!(body["data"]["project_path"], repo.to_string_lossy().as_ref());
    assert!(body["meta"].is_object());

    server.shutdown().await;
}

#[tokio::test]
async fn websocket_filters_events_to_the_requested_project() {
    let server = TestServer::spawn().await;
    let (mut socket, _) = connect_async(format!("{}?project_id=alpha", server.ws_url))
        .await
        .expect("connect websocket");

    TaskEventSink::task_updated(&*server.state.event_sink, "beta", &test_task("task-beta", "project-beta"));

    let unexpected = timeout(Duration::from_millis(150), socket.next()).await;
    assert!(unexpected.is_err(), "unexpected event leaked across project subscriptions");

    TaskEventSink::task_updated(&*server.state.event_sink, "alpha", &test_task("task-alpha", "project-alpha"));

    let message = timeout(Duration::from_secs(1), socket.next())
        .await
        .expect("timed out waiting for alpha event")
        .expect("websocket stream ended")
        .expect("websocket message should be ok");
    let payload = parse_text_message(message);

    assert_eq!(payload["project_id"], "alpha");
    assert_eq!(payload["task"]["id"], "task-alpha");

    server.shutdown().await;
}

#[tokio::test]
async fn websocket_all_subscription_receives_any_project_event() {
    let server = TestServer::spawn().await;
    let (mut socket, _) = connect_async(format!("{}?project_id=all", server.ws_url))
        .await
        .expect("connect websocket");

    TaskEventSink::task_updated(&*server.state.event_sink, "beta", &test_task("task-beta", "project-beta"));

    let message = timeout(Duration::from_secs(1), socket.next())
        .await
        .expect("timed out waiting for beta event")
        .expect("websocket stream ended")
        .expect("websocket message should be ok");
    let payload = parse_text_message(message);

    assert_eq!(payload["project_id"], "beta");
    assert_eq!(payload["task"]["id"], "task-beta");

    server.shutdown().await;
}

fn test_task(id: &str, project_id: &str) -> Task {
    Task::new(
        id.to_string(),
        project_id.to_string(),
        format!("Task {id}"),
        format!("Description for {id}"),
        "codex".into(),
        Vec::new(),
        "main".into(),
    )
}

fn parse_text_message(message: Message) -> Value {
    match message {
        Message::Text(text) => serde_json::from_str(&text).expect("parse websocket text payload"),
        other => panic!("expected text websocket message, got {other:?}"),
    }
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("{prefix}-{}", Uuid::new_v4()));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn init_git_repo(root: &Path, name: &str, with_origin: bool) -> PathBuf {
    let repo = root.join(name);
    git_cmd(
        root,
        ["init", "--initial-branch=main", repo.to_string_lossy().as_ref()],
    );
    git_cmd(&repo, ["config", "user.name", "Test User"]);
    git_cmd(&repo, ["config", "user.email", "test@example.com"]);
    fs::write(repo.join("README.md"), "# Test Repo\n").expect("write repo readme");
    git_cmd(&repo, ["add", "README.md"]);
    git_cmd(&repo, ["commit", "-m", "initial"]);

    if with_origin {
        let remote = root.join(format!("{name}.git"));
        git_cmd(
            root,
            [
                "init",
                "--bare",
                "--initial-branch=main",
                remote.to_string_lossy().as_ref(),
            ],
        );
        git_cmd(
            &repo,
            ["remote", "add", "origin", remote.to_string_lossy().as_ref()],
        );
        git_cmd(&repo, ["push", "-u", "origin", "main"]);
    }

    repo
}

fn git_cmd<I, S>(cwd: &Path, args: I) -> String
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let output = StdCommand::new("git")
        .current_dir(cwd)
        .args(args.into_iter().map(|value| value.as_ref().to_string()))
        .output()
        .expect("run git command");

    if !output.status.success() {
        panic!(
            "git command failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

#[allow(dead_code)]
fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").to_ascii_lowercase()
}