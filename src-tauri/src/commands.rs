use crate::{domain::{HarnessConfig, Project, Task, TaskLogEntry}, task_runner::{AppState, CreateTaskInput}};
use tauri::{AppHandle, State};

fn map_error(error: impl ToString) -> String {
    error.to_string()
}

#[tauri::command]
pub fn default_projects_root(state: State<'_, AppState>) -> String {
    state.default_projects_root()
}

#[tauri::command]
pub async fn detect_cli_tools(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.detect_cli_tools().await)
}

#[tauri::command]
pub fn find_projects(state: State<'_, AppState>, root_dir: String) -> Result<Vec<Project>, String> {
    state.find_projects(root_dir.as_ref()).map_err(map_error)
}

#[tauri::command]
pub fn register_project(state: State<'_, AppState>, project_path: String) -> Result<Project, String> {
    state.register_project(project_path.as_ref()).map_err(map_error)
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>, project_id: String) -> Result<Vec<Task>, String> {
    state.list_tasks(&project_id).map_err(map_error)
}

#[tauri::command]
pub fn get_task(state: State<'_, AppState>, project_id: String, task_id: String) -> Result<Task, String> {
    state.get_task(&project_id, &task_id).map_err(map_error)
}

#[tauri::command]
pub fn create_task(state: State<'_, AppState>, input: CreateTaskInput) -> Result<Task, String> {
    state.create_task(input).map_err(map_error)
}

#[tauri::command]
pub async fn start_task(app: AppHandle, state: State<'_, AppState>, project_id: String, task_id: String) -> Result<(), String> {
    state.start_task(app, project_id, task_id).await.map_err(map_error)
}

#[tauri::command]
pub async fn retry_task(app: AppHandle, state: State<'_, AppState>, project_id: String, task_id: String) -> Result<Task, String> {
    state.retry_task(app, project_id, task_id).await.map_err(map_error)
}

#[tauri::command]
pub async fn answer_question(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    task_id: String,
    reply: String,
) -> Result<Task, String> {
    state.answer_question(app, project_id, task_id, reply).await.map_err(map_error)
}

#[tauri::command]
pub fn approve_task(app: AppHandle, state: State<'_, AppState>, project_id: String, task_id: String) -> Result<Task, String> {
    state.approve_task(app, project_id, task_id).map_err(map_error)
}

#[tauri::command]
pub async fn reject_task(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    task_id: String,
    feedback: String,
) -> Result<Task, String> {
    state.reject_task(app, project_id, task_id, feedback).await.map_err(map_error)
}

#[tauri::command]
pub fn load_task_logs(state: State<'_, AppState>, task_id: String) -> Result<Vec<TaskLogEntry>, String> {
    state.load_task_logs(&task_id).map_err(map_error)
}

#[tauri::command]
pub fn load_harness_config(state: State<'_, AppState>, project_id: String) -> Result<HarnessConfig, String> {
    state.load_harness_config(&project_id).map_err(map_error)
}

#[tauri::command]
pub async fn save_harness_config(
    state: State<'_, AppState>,
    project_id: String,
    config: HarnessConfig,
) -> Result<HarnessConfig, String> {
    state.save_harness_config(&project_id, config).await.map_err(map_error)
}