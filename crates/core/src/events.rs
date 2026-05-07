use crate::domain::{Task, TaskLogEntry};

pub trait TaskEventSink: Clone + Send + Sync + 'static {
    fn task_updated(&self, project_id: &str, task: &Task);
    fn task_log(&self, project_id: &str, task_id: &str, entry: &TaskLogEntry);
}
