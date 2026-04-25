use crate::{
    domain::{timestamp_now, HarnessConfig, Project, Task, TaskLogEntry, TaskQuestion, TaskStatus},
    git_ops,
    harness::build_harness_payload,
    storage::Storage,
};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, Command},
    sync::Mutex,
    time::{sleep, Duration},
};
use uuid::Uuid;

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

#[derive(Debug, Clone)]
pub struct AppState {
    storage: Storage,
    runtime: Arc<RuntimeState>,
}

#[derive(Debug)]
struct RuntimeState {
    active_tasks: Mutex<HashSet<String>>,
    stdin_handles: Mutex<HashMap<String, Arc<Mutex<ChildStdin>>>>,
    max_concurrency: Mutex<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTaskInput {
    pub project_id: String,
    pub project_path: String,
    pub base_branch: String,
    pub description: String,
    pub cli_command: String,
    #[serde(default)]
    pub cli_args: Vec<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
}

impl AppState {
    pub fn new() -> Result<Self> {
        Ok(Self {
            storage: Storage::default()?,
            runtime: Arc::new(RuntimeState {
                active_tasks: Mutex::new(HashSet::new()),
                stdin_handles: Mutex::new(HashMap::new()),
                max_concurrency: Mutex::new(2),
            }),
        })
    }

    pub fn default_projects_root(&self) -> String {
        self.storage
            .root()
            .parent()
            .map(|path| path.join("projects"))
            .unwrap_or_else(|| PathBuf::from("projects"))
            .to_string_lossy()
            .to_string()
    }

    pub async fn detect_cli_tools(&self) -> Vec<String> {
        let candidates = ["copilot", "codex", "claude", "gemini"];
        let mut found = Vec::new();

        for candidate in candidates {
            if command_exists(candidate).await {
                found.push(candidate.to_string());
            }
        }

        found
    }

    pub fn find_projects(&self, _root_dir: &Path) -> Result<Vec<Project>> {
        let mut projects = self.storage.load_registered_projects()?;
        for project in &mut projects {
            project.is_linked = true;
        }

        for project in &mut projects {
            let project_path = Path::new(&project.path);
            let branch = git_ops::default_branch(project_path).unwrap_or_else(|_| "main".into());
            project.default_branch = branch;
            project.remote_url = git_ops::origin_remote_url(project_path).ok();
            project.is_linked = project.is_linked && project.remote_url.is_some();
        }

        projects.retain(|project| project.is_linked);
        projects.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(projects)
    }

    pub fn register_project(&self, project_path: &Path) -> Result<Project> {
        if !project_path.exists() || !project_path.is_dir() {
            return Err(anyhow!("repository path does not exist or is not a directory"));
        }

        if !project_path.join(".git").exists() {
            return Err(anyhow!("project must point to a git repository"));
        }

        let name = project_path
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("project")
            .to_string();

        let remote_url = git_ops::origin_remote_url(project_path)
            .context("project must have an origin remote to support collaboration flows")?;

        let project = Project {
            id: project_id_from_path(project_path),
            name,
            path: project_path.to_string_lossy().to_string(),
            default_branch: git_ops::default_branch(project_path).unwrap_or_else(|_| "main".into()),
            is_linked: true,
            remote_url: Some(remote_url),
        };

        self.storage.upsert_registered_project(&project)?;
        Ok(project)
    }

    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        self.storage.load_tasks(project_id)
    }

    pub fn load_task_logs(&self, task_id: &str) -> Result<Vec<TaskLogEntry>> {
        self.storage.read_logs(task_id)
    }

    pub fn get_task(&self, project_id: &str, task_id: &str) -> Result<Task> {
        let tasks = self.storage.load_tasks(project_id)?;
        tasks
            .into_iter()
            .find(|task| task.id == task_id)
            .context("task not found")
    }

    pub fn load_harness_config(&self, project_id: &str) -> Result<HarnessConfig> {
        self.storage.load_harness_config(project_id)
    }

    pub async fn save_harness_config(&self, project_id: &str, config: HarnessConfig) -> Result<HarnessConfig> {
        self.storage.save_harness_config(project_id, &config)?;
        *self.runtime.max_concurrency.lock().await = config.max_concurrency.max(1);
        Ok(config)
    }

    pub fn create_task(&self, input: CreateTaskInput) -> Result<Task> {
        let is_registered = self
            .storage
            .load_registered_projects()?
            .into_iter()
            .any(|project| normalize_project_path(&project.path) == normalize_project_path(&input.project_path));

        if !is_registered {
            return Err(anyhow!("project must be linked in Agent Kanban before creating tasks"));
        }

        git_ops::origin_remote_url(Path::new(&input.project_path))
            .context("project must be linked to a git origin before creating tasks")?;

        let mut task = Task::new(
            Uuid::new_v4().to_string(),
            input.project_id.clone(),
            create_task_title(&input.description),
            input.description,
            input.cli_command,
            input.cli_args,
            input.base_branch,
        );
        task.project_path = Some(input.project_path);
        task.env_vars = input.env_vars;

        let mut tasks = self.storage.load_tasks(&input.project_id)?;
        tasks.insert(0, task.clone());
        self.storage.save_tasks(&input.project_id, &tasks)?;
        Ok(task)
    }

    pub async fn start_task(&self, app: AppHandle, project_id: String, task_id: String) -> Result<()> {
        let state = self.clone();
        tokio::spawn(async move {
            let _ = state.run_task(app, project_id, task_id).await;
        });
        Ok(())
    }

    pub async fn retry_task(&self, app: AppHandle, project_id: String, task_id: String) -> Result<Task> {
        let mut task = self.get_task(&project_id, &task_id)?;
        task = task.transition(TaskStatus::Executing)?;
        task.latest_error = None;
        task.pending_question = None;
        self.save_task(&project_id, task.clone())?;
        self.emit_task_update(&app, &project_id, &task);
        self.start_task(app, project_id, task_id).await?;
        Ok(task)
    }

    pub async fn answer_question(&self, app: AppHandle, project_id: String, task_id: String, reply: String) -> Result<Task> {
        let key = runtime_key(&project_id, &task_id);
        if let Some(stdin) = self.runtime.stdin_handles.lock().await.get(&key).cloned() {
            let mut stdin = stdin.lock().await;
            stdin.write_all(reply.as_bytes()).await?;
            stdin.write_all(b"\n").await?;
            stdin.flush().await?;
        }

        let mut task = self.get_task(&project_id, &task_id)?;
        task.pending_question = None;
        task = task.transition(TaskStatus::Executing)?;
        self.save_task(&project_id, task.clone())?;
        self.emit_task_update(&app, &project_id, &task);
        Ok(task)
    }

    pub async fn reject_task(&self, app: AppHandle, project_id: String, task_id: String, feedback: String) -> Result<Task> {
        let mut task = self.get_task(&project_id, &task_id)?;
        task.feedback_history.push(feedback);
        task.review = None;
        task = task.transition(TaskStatus::Executing)?;
        self.save_task(&project_id, task.clone())?;
        self.emit_task_update(&app, &project_id, &task);
        self.start_task(app, project_id, task_id).await?;
        Ok(task)
    }

    pub fn approve_task(&self, app: AppHandle, project_id: String, task_id: String) -> Result<Task> {
        let mut task = self.get_task(&project_id, &task_id)?;
        let source_path = task.project_path.clone().context("task is missing source project path")?;
        let workspace_path = task.workspace_path.clone().context("task is missing workspace path")?;
        git_ops::merge_workspace_branch(
            Path::new(&source_path),
            Path::new(&workspace_path),
            &task.branch_name,
            &task.base_branch,
        )?;
        task = task.transition(TaskStatus::Completed)?;
        self.save_task(&project_id, task.clone())?;
        self.emit_task_update(&app, &project_id, &task);
        Ok(task)
    }

    async fn run_task(&self, app: AppHandle, project_id: String, task_id: String) -> Result<()> {
        let key = runtime_key(&project_id, &task_id);
        self.acquire_slot(&key).await;

        let result = self.run_task_inner(&app, &project_id, &task_id).await;

        self.runtime.active_tasks.lock().await.remove(&key);
        self.runtime.stdin_handles.lock().await.remove(&key);

        if let Err(error) = result {
            let _ = self.fail_task(&app, &project_id, &task_id, error.to_string());
        }

        Ok(())
    }

    async fn run_task_inner(&self, app: &AppHandle, project_id: &str, task_id: &str) -> Result<()> {
        loop {
            let mut task = self.get_task(project_id, task_id)?;
            let source_path = task.project_path.clone().context("task is missing source project path")?;
            let config = self.storage.load_harness_config(project_id)?;
            *self.runtime.max_concurrency.lock().await = config.max_concurrency.max(1);

            let workspace_path = if let Some(existing) = task.workspace_path.clone() {
                PathBuf::from(existing)
            } else {
                let dir = self.storage.create_workspace_dir(task_id)?;
                git_ops::create_workspace(Path::new(&source_path), &dir, &task.base_branch, &task.branch_name)?;
                task.workspace_path = Some(dir.to_string_lossy().to_string());
                self.save_task(project_id, task.clone())?;
                dir
            };

            let executing_task = if task.status == TaskStatus::Executing {
                task.clone()
            } else {
                let updated = task.transition(TaskStatus::Executing)?;
                self.save_task(project_id, updated.clone())?;
                self.emit_task_update(app, project_id, &updated);
                updated
            };

            let payload = build_harness_payload(Path::new(&source_path), &executing_task, &config)?;
            let exit_ok = self
                .run_cli_process(app, project_id, &executing_task, &workspace_path, payload.prompt, payload.env_vars)
                .await?;

            if !exit_ok {
                let latest = self.get_task(project_id, task_id)?;
                if latest.status != TaskStatus::Failed {
                    self.fail_task(app, project_id, task_id, latest.latest_error.unwrap_or_else(|| "task execution failed".into()))?;
                }
                return Ok(());
            }

            let mut guarded = self.get_task(project_id, task_id)?;
            guarded = guarded.transition(TaskStatus::GuardrailCheck)?;
            self.save_task(project_id, guarded.clone())?;
            self.emit_task_update(app, project_id, &guarded);

            git_ops::commit_all(&workspace_path, &format!("task: {}", guarded.title))?;

            match self.run_guardrails(&workspace_path, &guarded, &config).await? {
                GuardrailOutcome::Passed => {
                    let diff = git_ops::diff_against_base(&workspace_path, &guarded.base_branch, &guarded.branch_name)
                        .unwrap_or_default();
                    let mut review_task = self.get_task(project_id, task_id)?;
                    review_task.diff = Some(diff.clone());

                    if let Err(error) = git_ops::push_branch(&workspace_path, &review_task.branch_name) {
                        review_task.latest_error = Some(error.to_string());
                        review_task = review_task.transition(TaskStatus::Blocked)?;
                        self.save_task(project_id, review_task.clone())?;
                        self.emit_task_update(app, project_id, &review_task);
                        return Ok(());
                    }

                    review_task.remote_branch = Some(review_task.branch_name.clone());
                    review_task = review_task.transition(TaskStatus::AiReview)?;
                    self.save_task(project_id, review_task.clone())?;
                    self.emit_task_update(app, project_id, &review_task);

                    let review = self.run_review(&workspace_path, &review_task, &config, &diff).await;

                    let mut awaiting = self.get_task(project_id, task_id)?;
                    awaiting.review = Some(review.unwrap_or_else(|error| error.to_string()));
                    awaiting = awaiting.transition(TaskStatus::AwaitingAcceptance)?;
                    self.save_task(project_id, awaiting.clone())?;
                    self.emit_task_update(app, project_id, &awaiting);
                    return Ok(());
                }
                GuardrailOutcome::NeedsRevision(report) => {
                    let mut revised = self.get_task(project_id, task_id)?;
                    revised.latest_guardrail_report = Some(report.clone());
                    if revised.revision_count >= config.max_retries {
                        revised = revised.transition(TaskStatus::Blocked)?;
                        revised.latest_error = Some(report);
                        self.save_task(project_id, revised.clone())?;
                        self.emit_task_update(app, project_id, &revised);
                        return Ok(());
                    }

                    revised.feedback_history.push(report);
                    revised.revision_count += 1;
                    revised = revised.transition(TaskStatus::NeedsRevision)?;
                    self.save_task(project_id, revised.clone())?;
                    self.emit_task_update(app, project_id, &revised);
                    continue;
                }
            }
        }
    }

    async fn run_cli_process(
        &self,
        app: &AppHandle,
        project_id: &str,
        task: &Task,
        workspace_path: &Path,
        prompt: String,
        env_vars: HashMap<String, String>,
    ) -> Result<bool> {
        let mut command = Command::new(&task.cli_command);
        command
            .args(&task.cli_args)
            .arg(prompt)
            .current_dir(workspace_path)
            .envs(env_vars)
            .env("AGENTKANBAN_TASK_ID", &task.id)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn().with_context(|| format!("failed to launch {}", task.cli_command))?;
        let stdout = child.stdout.take().context("missing stdout pipe")?;
        let stderr = child.stderr.take().context("missing stderr pipe")?;
        let stdin = child.stdin.take().context("missing stdin pipe")?;

        self.runtime
            .stdin_handles
            .lock()
            .await
            .insert(runtime_key(project_id, &task.id), Arc::new(Mutex::new(stdin)));

        let stdout_task = tokio::spawn(Self::stream_output(
            self.clone(),
            app.clone(),
            project_id.to_string(),
            task.id.clone(),
            stdout,
            "stdout".into(),
        ));
        let stderr_task = tokio::spawn(Self::stream_output(
            self.clone(),
            app.clone(),
            project_id.to_string(),
            task.id.clone(),
            stderr,
            "stderr".into(),
        ));

        let status = child.wait().await?;
        stdout_task.await??;
        stderr_task.await??;

        if !status.success() {
            let message = format!("command exited with code {:?}", status.code());
            self.fail_task(app, project_id, &task.id, message)?;
            return Ok(false);
        }

        Ok(true)
    }

    async fn stream_output<R>(
        state: AppState,
        app: AppHandle,
        project_id: String,
        task_id: String,
        reader: R,
        stream: String,
    ) -> Result<()>
    where
        R: tokio::io::AsyncRead + Unpin,
    {
        let mut lines = BufReader::new(reader).lines();
        while let Some(line) = lines.next_line().await? {
            if let Some(payload) = line.strip_prefix("___QUESTION___") {
                if let Ok(question) = serde_json::from_str::<IncomingQuestion>(payload) {
                    let mut task = state.get_task(&project_id, &task_id)?;
                    task.pending_question = Some(TaskQuestion {
                        task_id: task_id.clone(),
                        q: question.q,
                        opts: question.opts,
                        allow_freeform: true,
                    });
                    task = task.transition(TaskStatus::WaitingForInput)?;
                    state.save_task(&project_id, task.clone())?;
                    state.emit_task_update(&app, &project_id, &task);
                    continue;
                }
            }

            let entry = TaskLogEntry {
                timestamp: timestamp_now(),
                stream: stream.clone(),
                message: line,
            };
            state.storage.append_log(&task_id, &entry)?;
            app.emit(
                "task-log",
                TaskLogPayload {
                    project_id: project_id.clone(),
                    task_id: task_id.clone(),
                    entry,
                },
            )?;
        }

        Ok(())
    }

    async fn run_guardrails(&self, workspace_path: &Path, task: &Task, config: &HarnessConfig) -> Result<GuardrailOutcome> {
        for command_line in &config.guardrail_commands {
            if command_line.trim().is_empty() {
                continue;
            }

            let output = run_shell_command(workspace_path, command_line, &task.env_vars).await?;
            if !output.success {
                return Ok(GuardrailOutcome::NeedsRevision(output.output));
            }
        }

        Ok(GuardrailOutcome::Passed)
    }

    async fn run_review(&self, workspace_path: &Path, task: &Task, config: &HarnessConfig, diff: &str) -> Result<String> {
        let review_prompt = format!(
            "Review the following diff for task '{}' and summarize the most important findings.\n\n{}",
            task.title, diff
        );

        if !config.review_command.trim().is_empty() {
            let output = run_shell_command(
                workspace_path,
                &config.review_command,
                &HashMap::from([(String::from("AGENTKANBAN_DIFF"), diff.to_string())]),
            )
            .await?;

            return Ok(if output.output.trim().is_empty() {
                "Review command completed without output.".into()
            } else {
                output.output
            });
        }

        let output = run_direct_command(
            workspace_path,
            &task.cli_command,
            &task.cli_args,
            &task.env_vars,
            Some(review_prompt),
        )
        .await?;

        if output.output.trim().is_empty() {
            Ok("No review output produced.".into())
        } else {
            Ok(output.output)
        }
    }

    async fn acquire_slot(&self, key: &str) {
        loop {
            {
                let mut active = self.runtime.active_tasks.lock().await;
                let max_concurrency = *self.runtime.max_concurrency.lock().await;
                if active.contains(key) {
                    return;
                }
                if active.len() < max_concurrency {
                    active.insert(key.to_string());
                    return;
                }
            }

            sleep(Duration::from_millis(200)).await;
        }
    }

    fn fail_task(&self, app: &AppHandle, project_id: &str, task_id: &str, error: String) -> Result<()> {
        let task = self.get_task(project_id, task_id)?;
        let mut failed = if task.status == TaskStatus::Failed {
            task
        } else {
            task.transition(TaskStatus::Failed)?
        };
        failed.latest_error = Some(error);
        failed.pending_question = None;
        self.save_task(project_id, failed.clone())?;
        self.emit_task_update(app, project_id, &failed);
        Ok(())
    }

    fn save_task(&self, project_id: &str, task: Task) -> Result<()> {
        let mut tasks = self.storage.load_tasks(project_id)?;
        if let Some(existing) = tasks.iter_mut().find(|entry| entry.id == task.id) {
            *existing = task;
        } else {
            tasks.insert(0, task);
        }
        self.storage.save_tasks(project_id, &tasks)
    }

    fn emit_task_update(&self, app: &AppHandle, project_id: &str, task: &Task) {
        let _ = app.emit(
            "task-updated",
            TaskUpdatedPayload {
                project_id: project_id.to_string(),
                task: task.clone(),
            },
        );
    }
}

#[derive(Debug, Deserialize)]
struct IncomingQuestion {
    q: String,
    #[serde(default)]
    opts: Vec<String>,
}

enum GuardrailOutcome {
    Passed,
    NeedsRevision(String),
}

struct CommandOutput {
    success: bool,
    output: String,
}

async fn run_shell_command(cwd: &Path, command_line: &str, env_vars: &HashMap<String, String>) -> Result<CommandOutput> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command_line]);
        cmd
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut cmd = Command::new("sh");
        cmd.args(["-lc", command_line]);
        cmd
    };

    let output = command
        .current_dir(cwd)
        .envs(env_vars)
        .output()
        .await?;

    Ok(CommandOutput {
        success: output.status.success(),
        output: if output.status.success() {
            String::from_utf8_lossy(&output.stdout).to_string()
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stderr.trim().is_empty() {
                String::from_utf8_lossy(&output.stdout).to_string()
            } else {
                stderr
            }
        },
    })
}

async fn run_direct_command(
    cwd: &Path,
    program: &str,
    args: &[String],
    env_vars: &HashMap<String, String>,
    prompt: Option<String>,
) -> Result<CommandOutput> {
    let mut command = Command::new(program);
    command
        .current_dir(cwd)
        .args(args)
        .envs(env_vars)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(prompt) = prompt {
        command.arg(prompt);
    }

    let output = command.output().await?;
    Ok(CommandOutput {
        success: output.status.success(),
        output: if output.status.success() {
            String::from_utf8_lossy(&output.stdout).to_string()
        } else {
            String::from_utf8_lossy(&output.stderr).to_string()
        },
    })
}

async fn command_exists(command_name: &str) -> bool {
    #[cfg(target_os = "windows")]
    let output = Command::new("where").arg(command_name).output().await;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("which").arg(command_name).output().await;

    output.map(|value| value.status.success()).unwrap_or(false)
}

fn create_task_title(description: &str) -> String {
    let collapsed = description.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        "Untitled task".into()
    } else if collapsed.len() > 60 {
        format!("{}...", &collapsed[..57])
    } else {
        collapsed
    }
}

fn runtime_key(project_id: &str, task_id: &str) -> String {
    format!("{project_id}:{task_id}")
}

fn project_id_from_path(project_path: &Path) -> String {
    let path_text = project_path.to_string_lossy();
    let mut key = String::new();

    for ch in path_text.chars() {
        if ch.is_ascii_alphanumeric() {
            key.push(ch.to_ascii_lowercase());
        } else if !key.ends_with('-') {
            key.push('-');
        }
    }

    let key = key.trim_matches('-').to_string();
    if key.is_empty() {
        "project".to_string()
    } else {
        key
    }
}

fn normalize_project_path(value: &str) -> String {
    value.replace('\\', "/").to_ascii_lowercase()
}