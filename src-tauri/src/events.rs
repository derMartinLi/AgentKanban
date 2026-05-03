use crate::domain::{Task, TaskLogEntry, TaskStatus};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::{NotificationExt, PermissionState};

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

        if let Some(notification) = notification_for_task(task) {
            let api = self.app.notification();
            let permission = api
                .permission_state()
                .ok()
                .or_else(|| api.request_permission().ok())
                .unwrap_or(PermissionState::Denied);

            if permission == PermissionState::Granted {
                let _ = api
                    .builder()
                    .title(notification.title)
                    .body(notification.body)
                    .show();
            }
        }
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

struct TaskNotification {
    title: String,
    body: String,
}

fn notification_for_task(task: &Task) -> Option<TaskNotification> {
    match task.status {
        TaskStatus::WaitingForInput => Some(TaskNotification {
            title: format!("Input needed: {}", task.title),
            body: task
                .pending_question
                .as_ref()
                .map(|question| question.q.clone())
                .unwrap_or_else(|| String::from("Agent Kanban is waiting for your answer.")),
        }),
        TaskStatus::Failed => Some(TaskNotification {
            title: format!("Task failed: {}", task.title),
            body: task
                .latest_error
                .clone()
                .unwrap_or_else(|| String::from("The task failed without an explicit error message.")),
        }),
        TaskStatus::AwaitingAcceptance => Some(TaskNotification {
            title: format!("Ready for review: {}", task.title),
            body: String::from("The task finished and is awaiting your approval."),
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_mapping_only_targets_operator_attention_states() {
        let mut task = Task::new(
            "task-1".into(),
            "project-1".into(),
            "Review branch".into(),
            "Review branch".into(),
            "codex".into(),
            Vec::new(),
            "main".into(),
        );

        assert!(notification_for_task(&task).is_none());

        task.status = TaskStatus::Failed;
        task.latest_error = Some("boom".into());
        assert_eq!(
            notification_for_task(&task).map(|payload| payload.body),
            Some(String::from("boom"))
        );

        task.status = TaskStatus::AwaitingAcceptance;
        assert!(notification_for_task(&task)
            .map(|payload| payload.title)
            .unwrap_or_default()
            .contains("Ready for review"));
    }
}
