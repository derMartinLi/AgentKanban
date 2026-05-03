use crate::domain::{Task, TaskLogEntry};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub trait TaskEventSink: Clone + Send + Sync + 'static {
    fn task_updated(&self, project_id: &str, task: &Task);
    fn task_log(&self, project_id: &str, task_id: &str, entry: &TaskLogEntry);
}

#[derive(Debug, Clone)]
pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: &AppHandle) -> Self {
        Self { app: app.clone() }
    }
}

impl TaskEventSink for TauriEventSink {
    fn task_updated(&self, project_id: &str, task: &Task) {
        let _ = self.app.emit(
            "task-updated",
            TaskUpdatedPayload {
                project_id: project_id.to_string(),
                task: task.clone(),
            },
        );
    }

    fn task_log(&self, project_id: &str, task_id: &str, entry: &TaskLogEntry) {
        let _ = self.app.emit(
            "task-log",
            TaskLogPayload {
                project_id: project_id.to_string(),
                task_id: task_id.to_string(),
                entry: entry.clone(),
            },
        );
    }
}

#[derive(Debug, Clone, Serialize)]
struct TaskUpdatedPayload {
    project_id: String,
    task: Task,
}

#[derive(Debug, Clone, Serialize)]
struct TaskLogPayload {
    project_id: String,
    task_id: String,
    entry: TaskLogEntry,
}