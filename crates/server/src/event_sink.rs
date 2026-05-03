use agentkanban_core::{domain::{Task, TaskLogEntry}, events::TaskEventSink};
use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use serde_json;
use tokio::sync::broadcast;

#[derive(Debug, Clone)]
pub(crate) struct WsMessage {
    pub(crate) project_id: String,
    pub(crate) payload: String,
}

#[derive(Debug, Clone)]
pub struct WsEventSink {
    tx: broadcast::Sender<WsMessage>,
}

impl WsEventSink {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self { tx }
    }

    pub(crate) fn sender(&self) -> broadcast::Sender<WsMessage> {
        self.tx.clone()
    }
}

impl TaskEventSink for WsEventSink {
    fn task_updated(&self, project_id: &str, task: &Task) {
        let payload = serde_json::json!({
            "project_id": project_id,
            "task": task,
        });
        let _ = self.tx.send(WsMessage {
            project_id: project_id.to_string(),
            payload: serde_json::to_string(&payload).unwrap_or_default(),
        });
    }

    fn task_log(&self, project_id: &str, task_id: &str, entry: &TaskLogEntry) {
        let payload = serde_json::json!({
            "project_id": project_id,
            "task_id": task_id,
            "entry": entry,
        });
        let _ = self.tx.send(WsMessage {
            project_id: project_id.to_string(),
            payload: serde_json::to_string(&payload).unwrap_or_default(),
        });
    }
}

pub(crate) async fn handle_ws(
    socket: WebSocket,
    project_id: String,
    mut rx: broadcast::Receiver<WsMessage>,
) {
    let (mut sender, mut receiver) = socket.split();

    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if project_id != "all" && msg.project_id != project_id {
                continue;
            }

            if sender.send(Message::Text(msg.payload.into())).await.is_err() {
                break;
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(_msg)) = receiver.next().await {
            // Client messages are acknowledged but not otherwise processed
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}
