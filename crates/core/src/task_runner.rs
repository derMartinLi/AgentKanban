use crate::{
    domain::{
        timestamp_now, HarnessConfig, Project, Task, TaskLogEntry, TaskQuestion, TaskStatus,
        TaskTemplate,
    },
    events::TaskEventSink,
    git_ops,
    harness::build_harness_payload,
    storage::Storage,
};
use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, Command},
    sync::Mutex,
    time::{sleep, Duration},
};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AppState {
    storage: Storage,
    runtime: Arc<RuntimeState>,
}

#[derive(Debug)]
struct RuntimeState {
    active_tasks: Mutex<HashSet<String>>,
    stdin_handles: Mutex<HashMap<String, Arc<Mutex<ChildStdin>>>>,
    process_ids: Mutex<HashMap<String, u32>>,
    question_tokens: Mutex<HashMap<String, String>>,
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
        Ok(Self::with_storage(Storage::default()?))
    }

    pub fn with_storage(storage: Storage) -> Self {
        Self {
            storage,
            runtime: Arc::new(RuntimeState {
                active_tasks: Mutex::new(HashSet::new()),
                stdin_handles: Mutex::new(HashMap::new()),
                process_ids: Mutex::new(HashMap::new()),
                question_tokens: Mutex::new(HashMap::new()),
                max_concurrency: Mutex::new(2),
            }),
        }
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

    pub fn list_registered_projects(&self) -> Result<Vec<Project>> {
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

    pub fn find_projects(&self, _root_dir: &Path) -> Result<Vec<Project>> {
        self.list_registered_projects()
    }

    pub fn discover_projects(&self, root_dir: &Path) -> Result<Vec<Project>> {
        let registered_paths = self
            .storage
            .load_registered_projects()?
            .into_iter()
            .map(|project| normalize_project_path(&project.path))
            .collect::<HashSet<_>>();

        let mut projects = self.storage.discover_projects(root_dir)?;
        projects
            .retain(|project| !registered_paths.contains(&normalize_project_path(&project.path)));

        for project in &mut projects {
            let project_path = Path::new(&project.path);
            project.default_branch =
                git_ops::default_branch(project_path).unwrap_or_else(|_| "main".into());
            project.remote_url = git_ops::origin_remote_url(project_path).ok();
            project.is_linked = false;
        }

        projects.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(projects)
    }

    pub fn register_project(&self, project_path: &Path) -> Result<Project> {
        if !project_path.exists() || !project_path.is_dir() {
            return Err(anyhow!(
                "repository path does not exist or is not a directory"
            ));
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

    pub fn list_task_templates(&self) -> Result<Vec<TaskTemplate>> {
        self.storage.load_task_templates()
    }

    pub async fn save_harness_config(
        &self,
        project_id: &str,
        config: HarnessConfig,
    ) -> Result<HarnessConfig> {
        self.storage.save_harness_config(project_id, &config)?;
        *self.runtime.max_concurrency.lock().await = config.max_concurrency.max(1);
        Ok(config)
    }

    pub fn create_task(&self, input: CreateTaskInput) -> Result<Task> {
        let is_registered = self
            .storage
            .load_registered_projects()?
            .into_iter()
            .any(|project| {
                normalize_project_path(&project.path) == normalize_project_path(&input.project_path)
            });

        if !is_registered {
            return Err(anyhow!(
                "project must be linked in Agent Kanban before creating tasks"
            ));
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

    pub async fn start_task(
        &self,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
    ) -> Result<()> {
        let state = self.clone();
        tokio::spawn(async move {
            let _ = state.run_task(sink, project_id, task_id).await;
        });
        Ok(())
    }

    pub async fn retry_task(
        &self,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
    ) -> Result<Task> {
        let mut task = self.get_task(&project_id, &task_id)?;
        task = task.transition(TaskStatus::Executing)?;
        task.latest_error = None;
        task.pending_question = None;
        self.save_task(&project_id, task.clone())?;
        self.emit_task_update(&sink, &project_id, &task);
        self.start_task(sink, project_id, task_id).await?;
        Ok(task)
    }

    pub async fn answer_question(
        &self,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
        reply: String,
    ) -> Result<Task> {
        let key = runtime_key(&project_id, &task_id);
        if let Some(stdin) = self.runtime.stdin_handles.lock().await.get(&key).cloned() {
            let mut stdin = stdin.lock().await;
            stdin.write_all(reply.as_bytes()).await?;
            stdin.write_all(b"\n").await?;
            stdin.flush().await?;
        }
        self.runtime.question_tokens.lock().await.remove(&key);

        let mut task = self.get_task(&project_id, &task_id)?;
        task.pending_question = None;
        task = task.transition(TaskStatus::Executing)?;
        self.save_task(&project_id, task.clone())?;
        self.emit_task_update(&sink, &project_id, &task);
        Ok(task)
    }

    pub async fn reject_task(
        &self,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
        feedback: String,
    ) -> Result<Task> {
        let mut task = self.get_task(&project_id, &task_id)?;
        task.feedback_history.push(feedback);
        task.review = None;
        task = task.transition(TaskStatus::Executing)?;
        self.save_task(&project_id, task.clone())?;
        self.emit_task_update(&sink, &project_id, &task);
        self.start_task(sink, project_id, task_id).await?;
        Ok(task)
    }

    pub fn approve_task(
        &self,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
    ) -> Result<Task> {
        let mut task = self.get_task(&project_id, &task_id)?;
        let source_path = task
            .project_path
            .clone()
            .context("task is missing source project path")?;
        let workspace_path = task
            .workspace_path
            .clone()
            .context("task is missing workspace path")?;
        git_ops::merge_workspace_branch(
            Path::new(&source_path),
            Path::new(&workspace_path),
            &task.branch_name,
            &task.base_branch,
        )?;
        if let Some(message) = cleanup_workspace_after_completion(&mut task) {
            self.append_system_log(&sink, &project_id, &task.id, message)?;
        }
        task = task.transition(TaskStatus::Completed)?;
        self.save_task(&project_id, task.clone())?;
        self.emit_task_update(&sink, &project_id, &task);
        Ok(task)
    }

    async fn run_task(
        &self,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
    ) -> Result<()> {
        let key = runtime_key(&project_id, &task_id);
        self.acquire_slot(&key).await;

        let result = self.run_task_inner(&sink, &project_id, &task_id).await;

        self.runtime.active_tasks.lock().await.remove(&key);
        self.runtime.stdin_handles.lock().await.remove(&key);
        self.runtime.process_ids.lock().await.remove(&key);
        self.runtime.question_tokens.lock().await.remove(&key);

        if let Err(error) = result {
            let _ = self.fail_task(&sink, &project_id, &task_id, error.to_string());
        }

        Ok(())
    }

    async fn run_task_inner(
        &self,
        sink: &impl TaskEventSink,
        project_id: &str,
        task_id: &str,
    ) -> Result<()> {
        loop {
            let mut task = self.get_task(project_id, task_id)?;
            let source_path = task
                .project_path
                .clone()
                .context("task is missing source project path")?;
            let config = self.storage.load_harness_config(project_id)?;
            *self.runtime.max_concurrency.lock().await = config.max_concurrency.max(1);

            let workspace_path = if let Some(existing) = task.workspace_path.clone() {
                PathBuf::from(existing)
            } else {
                let dir = self.storage.create_workspace_dir(task_id)?;
                git_ops::create_workspace(
                    Path::new(&source_path),
                    &dir,
                    &task.base_branch,
                    &task.branch_name,
                )?;
                task.workspace_path = Some(dir.to_string_lossy().to_string());
                self.save_task(project_id, task.clone())?;
                dir
            };

            let executing_task = if task.status == TaskStatus::Executing {
                task.clone()
            } else {
                let updated = task.transition(TaskStatus::Executing)?;
                self.save_task(project_id, updated.clone())?;
                self.emit_task_update(sink, project_id, &updated);
                updated
            };

            let payload = build_harness_payload(Path::new(&source_path), &executing_task, &config)?;
            let exit_ok = self
                .run_cli_process(
                    sink,
                    project_id,
                    &executing_task,
                    &workspace_path,
                    payload.prompt,
                    payload.env_vars,
                    config.question_timeout_secs,
                )
                .await?;

            if !exit_ok {
                let latest = self.get_task(project_id, task_id)?;
                if latest.status != TaskStatus::Failed {
                    self.fail_task(
                        sink,
                        project_id,
                        task_id,
                        latest
                            .latest_error
                            .unwrap_or_else(|| "task execution failed".into()),
                    )?;
                }
                return Ok(());
            }

            let mut guarded = self.get_task(project_id, task_id)?;
            guarded = guarded.transition(TaskStatus::GuardrailCheck)?;
            self.save_task(project_id, guarded.clone())?;
            self.emit_task_update(sink, project_id, &guarded);

            git_ops::commit_all(&workspace_path, &format!("task: {}", guarded.title))?;

            match self
                .run_guardrails(&workspace_path, &guarded, &config)
                .await?
            {
                GuardrailOutcome::Passed => {
                    let diff = git_ops::diff_against_base(
                        &workspace_path,
                        &guarded.base_branch,
                        &guarded.branch_name,
                    )
                    .unwrap_or_default();
                    let mut review_task = self.get_task(project_id, task_id)?;
                    review_task.diff = Some(diff.clone());

                    if let Err(error) =
                        git_ops::push_branch(&workspace_path, &review_task.branch_name)
                    {
                        review_task.latest_error = Some(error.to_string());
                        review_task = review_task.transition(TaskStatus::Blocked)?;
                        self.save_task(project_id, review_task.clone())?;
                        self.emit_task_update(sink, project_id, &review_task);
                        return Ok(());
                    }

                    review_task.remote_branch = Some(review_task.branch_name.clone());
                    review_task = review_task.transition(TaskStatus::AiReview)?;
                    self.save_task(project_id, review_task.clone())?;
                    self.emit_task_update(sink, project_id, &review_task);

                    let review = self
                        .run_review(&workspace_path, &review_task, &config, &diff)
                        .await;

                    let mut awaiting = self.get_task(project_id, task_id)?;
                    awaiting.review = Some(review.unwrap_or_else(|error| error.to_string()));
                    awaiting = awaiting.transition(TaskStatus::AwaitingAcceptance)?;
                    self.save_task(project_id, awaiting.clone())?;
                    self.emit_task_update(sink, project_id, &awaiting);
                    return Ok(());
                }
                GuardrailOutcome::NeedsRevision(report) => {
                    let mut revised = self.get_task(project_id, task_id)?;
                    revised.latest_guardrail_report = Some(report.clone());
                    if revised.revision_count >= config.max_retries {
                        revised = revised.transition(TaskStatus::Blocked)?;
                        revised.latest_error = Some(report);
                        self.save_task(project_id, revised.clone())?;
                        self.emit_task_update(sink, project_id, &revised);
                        return Ok(());
                    }

                    revised.feedback_history.push(report);
                    revised.revision_count += 1;
                    revised = revised.transition(TaskStatus::NeedsRevision)?;
                    self.save_task(project_id, revised.clone())?;
                    self.emit_task_update(sink, project_id, &revised);
                    continue;
                }
            }
        }
    }

    async fn run_cli_process(
        &self,
        sink: &impl TaskEventSink,
        project_id: &str,
        task: &Task,
        workspace_path: &Path,
        prompt: String,
        env_vars: HashMap<String, String>,
        question_timeout_secs: u64,
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

        let mut child = command
            .spawn()
            .with_context(|| format!("failed to launch {}", task.cli_command))?;
        let key = runtime_key(project_id, &task.id);
        if let Some(process_id) = child.id() {
            self.runtime
                .process_ids
                .lock()
                .await
                .insert(key.clone(), process_id);
        }
        let stdout = child.stdout.take().context("missing stdout pipe")?;
        let stderr = child.stderr.take().context("missing stderr pipe")?;
        let stdin = child.stdin.take().context("missing stdin pipe")?;

        self.runtime
            .stdin_handles
            .lock()
            .await
            .insert(key.clone(), Arc::new(Mutex::new(stdin)));

        let stdout_task = tokio::spawn(Self::stream_output(
            self.clone(),
            sink.clone(),
            project_id.to_string(),
            task.id.clone(),
            stdout,
            "stdout".into(),
            question_timeout_secs,
        ));
        let stderr_task = tokio::spawn(Self::stream_output(
            self.clone(),
            sink.clone(),
            project_id.to_string(),
            task.id.clone(),
            stderr,
            "stderr".into(),
            question_timeout_secs,
        ));

        let status = child.wait().await?;
        self.runtime.process_ids.lock().await.remove(&key);
        stdout_task.await??;
        stderr_task.await??;

        if !status.success() {
            let latest = self.get_task(project_id, &task.id)?;
            if latest.status != TaskStatus::Failed {
                let message = format!("command exited with code {:?}", status.code());
                self.fail_task(sink, project_id, &task.id, message)?;
            }
            return Ok(false);
        }

        Ok(true)
    }

    async fn stream_output<R>(
        state: AppState,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
        reader: R,
        stream: String,
        question_timeout_secs: u64,
    ) -> Result<()>
    where
        R: tokio::io::AsyncRead + Unpin,
    {
        let mut lines = BufReader::new(reader).lines();
        while let Some(line) = lines.next_line().await? {
            if let Some(payload) = line.strip_prefix("___QUESTION___") {
                if let Ok(question) = serde_json::from_str::<IncomingQuestion>(payload) {
                    let key = runtime_key(&project_id, &task_id);
                    let token = Uuid::new_v4().to_string();
                    let mut task = state.get_task(&project_id, &task_id)?;
                    task.pending_question = Some(TaskQuestion {
                        task_id: task_id.clone(),
                        q: question.q,
                        opts: question.opts,
                        allow_freeform: true,
                    });
                    task = task.transition(TaskStatus::WaitingForInput)?;
                    state.save_task(&project_id, task.clone())?;
                    state
                        .runtime
                        .question_tokens
                        .lock()
                        .await
                        .insert(key, token.clone());
                    state.emit_task_update(&sink, &project_id, &task);
                    state.schedule_question_timeout(
                        sink.clone(),
                        project_id.clone(),
                        task_id.clone(),
                        token,
                        question_timeout_secs,
                    );
                    continue;
                }
            }

            let entry = TaskLogEntry {
                timestamp: timestamp_now(),
                stream: stream.clone(),
                message: line,
            };
            state.storage.append_log(&task_id, &entry)?;
            sink.task_log(&project_id, &task_id, &entry);
        }

        Ok(())
    }

    async fn run_guardrails(
        &self,
        workspace_path: &Path,
        task: &Task,
        config: &HarnessConfig,
    ) -> Result<GuardrailOutcome> {
        for command_line in &config.guardrail_commands {
            if command_line.trim().is_empty() {
                continue;
            }

            let output = run_shell_command(workspace_path, command_line, &task.env_vars).await?;
            if !output.success {
                return Ok(GuardrailOutcome::NeedsRevision(output.output));
            }
        }

        if config.semgrep_enabled && command_exists("semgrep").await {
            let output = run_semgrep_guardrail(workspace_path, task, config).await?;
            if !output.success {
                return Ok(GuardrailOutcome::NeedsRevision(output.output));
            }
        }

        Ok(GuardrailOutcome::Passed)
    }

    async fn run_review(
        &self,
        workspace_path: &Path,
        task: &Task,
        config: &HarnessConfig,
        diff: &str,
    ) -> Result<String> {
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

    fn fail_task(
        &self,
        sink: &impl TaskEventSink,
        project_id: &str,
        task_id: &str,
        error: String,
    ) -> Result<()> {
        let task = self.get_task(project_id, task_id)?;
        let mut failed = if task.status == TaskStatus::Failed {
            task
        } else {
            task.transition(TaskStatus::Failed)?
        };
        failed.latest_error = Some(error);
        failed.pending_question = None;
        self.save_task(project_id, failed.clone())?;
        self.emit_task_update(sink, project_id, &failed);
        Ok(())
    }

    fn schedule_question_timeout(
        &self,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
        token: String,
        timeout_secs: u64,
    ) {
        let state = self.clone();
        tokio::spawn(async move {
            let _ = state
                .handle_question_timeout(sink, project_id, task_id, token, timeout_secs)
                .await;
        });
    }

    async fn handle_question_timeout(
        &self,
        sink: impl TaskEventSink,
        project_id: String,
        task_id: String,
        token: String,
        timeout_secs: u64,
    ) -> Result<()> {
        sleep(Duration::from_secs(timeout_secs)).await;

        let key = runtime_key(&project_id, &task_id);
        let active_token = self.runtime.question_tokens.lock().await.get(&key).cloned();
        if active_token.as_deref() != Some(token.as_str()) {
            return Ok(());
        }

        let task = self.get_task(&project_id, &task_id)?;
        if task.status != TaskStatus::WaitingForInput || task.pending_question.is_none() {
            self.runtime.question_tokens.lock().await.remove(&key);
            return Ok(());
        }

        let message = format!("Question timed out after {timeout_secs} seconds");
        self.append_system_log(&sink, &project_id, &task_id, message.clone())?;
        if let Err(error) = self.kill_tracked_process(&key).await {
            self.append_system_log(
                &sink,
                &project_id,
                &task_id,
                format!("Failed to terminate timed out process: {error}"),
            )?;
        }
        self.runtime.question_tokens.lock().await.remove(&key);
        self.fail_task(&sink, &project_id, &task_id, message)?;
        Ok(())
    }

    async fn kill_tracked_process(&self, key: &str) -> Result<()> {
        let process_id = self.runtime.process_ids.lock().await.remove(key);
        if let Some(process_id) = process_id {
            kill_process(process_id).await?;
        }
        Ok(())
    }

    fn append_system_log(
        &self,
        sink: &impl TaskEventSink,
        project_id: &str,
        task_id: &str,
        message: String,
    ) -> Result<()> {
        let entry = TaskLogEntry {
            timestamp: timestamp_now(),
            stream: "system".into(),
            message,
        };
        self.storage.append_log(task_id, &entry)?;
        sink.task_log(project_id, task_id, &entry);
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

    fn emit_task_update(&self, sink: &impl TaskEventSink, project_id: &str, task: &Task) {
        sink.task_updated(project_id, task);
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

async fn kill_process(process_id: u32) -> Result<()> {
    #[cfg(target_os = "windows")]
    let output = Command::new("taskkill")
        .args(["/PID", &process_id.to_string(), "/T", "/F"])
        .output()
        .await?;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("kill")
        .args(["-9", &process_id.to_string()])
        .output()
        .await?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if stderr.is_empty() { stdout } else { stderr };
        Err(anyhow!(
            "failed to terminate process {process_id}: {detail}"
        ))
    }
}

async fn run_shell_command(
    cwd: &Path,
    command_line: &str,
    env_vars: &HashMap<String, String>,
) -> Result<CommandOutput> {
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

    let output = command.current_dir(cwd).envs(env_vars).output().await?;

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

async fn run_semgrep_guardrail(
    cwd: &Path,
    task: &Task,
    config: &HarnessConfig,
) -> Result<CommandOutput> {
    let semgrep_config = if config.semgrep_config.trim().is_empty() {
        String::from("auto")
    } else {
        config.semgrep_config.trim().to_string()
    };

    run_direct_command(
        cwd,
        "semgrep",
        &[
            String::from("scan"),
            String::from("--config"),
            semgrep_config,
            String::from("--error"),
            String::from("."),
        ],
        &task.env_vars,
        None,
    )
    .await
}

async fn command_exists(command_name: &str) -> bool {
    if looks_like_path(command_name) {
        return Path::new(command_name).exists();
    }

    #[cfg(target_os = "windows")]
    let output = Command::new("where").arg(command_name).output().await;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("which").arg(command_name).output().await;

    output.map(|value| value.status.success()).unwrap_or(false)
}

fn looks_like_path(value: &str) -> bool {
    value.contains('\\') || value.contains('/') || value.contains(':')
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

fn cleanup_workspace_after_completion(task: &mut Task) -> Option<String> {
    let workspace_path = task.workspace_path.clone()?;
    match std::fs::remove_dir_all(&workspace_path) {
        Ok(()) => {
            task.workspace_path = None;
            None
        }
        Err(error) => Some(format!(
            "Workspace cleanup failed for {workspace_path}: {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::{Path, PathBuf},
        process::Command as StdCommand,
        sync::{Arc, Mutex as StdMutex},
    };
    use tokio::io::{duplex, AsyncWriteExt};
    use tokio::time::{sleep as tokio_sleep, Duration as TokioDuration};

    #[derive(Clone, Default)]
    struct MockSink {
        updates: Arc<StdMutex<Vec<(String, Task)>>>,
        logs: Arc<StdMutex<Vec<(String, String, TaskLogEntry)>>>,
    }

    impl TaskEventSink for MockSink {
        fn task_updated(&self, project_id: &str, task: &Task) {
            self.updates
                .lock()
                .expect("updates mutex poisoned")
                .push((project_id.to_string(), task.clone()));
        }

        fn task_log(&self, project_id: &str, task_id: &str, entry: &TaskLogEntry) {
            self.logs.lock().expect("logs mutex poisoned").push((
                project_id.to_string(),
                task_id.to_string(),
                entry.clone(),
            ));
        }
    }

    fn build_test_state() -> (AppState, PathBuf) {
        let root = std::env::temp_dir().join(format!("agentkanban-task-runner-{}", Uuid::new_v4()));
        let storage = Storage::new(root.clone()).expect("create test storage");
        (AppState::with_storage(storage), root)
    }

    #[tokio::test]
    async fn stream_output_sets_pending_question_and_emits_update() {
        let (state, root) = build_test_state();
        let task = Task::new(
            "task-1".into(),
            "project-1".into(),
            "Review prompt".into(),
            "Need operator input".into(),
            "codex".into(),
            Vec::new(),
            "main".into(),
        )
        .transition(TaskStatus::Executing)
        .expect("move task into executing state");
        state
            .storage
            .save_tasks("project-1", &[task.clone()])
            .expect("seed task");

        let sink = MockSink::default();
        let (mut writer, reader) = duplex(256);
        let payload =
            serde_json::json!({ "q": "Need approval", "opts": ["yes", "no"] }).to_string();
        writer
            .write_all(format!("___QUESTION___{payload}\n").as_bytes())
            .await
            .expect("write question payload");
        drop(writer);

        AppState::stream_output(
            state.clone(),
            sink.clone(),
            "project-1".into(),
            task.id.clone(),
            reader,
            "stdout".into(),
            120,
        )
        .await
        .expect("process output");

        let updated = state
            .get_task("project-1", &task.id)
            .expect("load updated task");

        assert_eq!(updated.status, TaskStatus::WaitingForInput);
        assert_eq!(
            updated
                .pending_question
                .as_ref()
                .map(|question| question.q.as_str()),
            Some("Need approval")
        );
        assert_eq!(sink.updates.lock().expect("read updates").len(), 1);
        assert!(sink.logs.lock().expect("read logs").is_empty());

        fs::remove_dir_all(root).expect("remove test storage");
    }

    #[test]
    fn discover_projects_excludes_registered_paths() {
        let (state, root) = build_test_state();
        let repos_root = root.join("repos");
        let alpha = repos_root.join("alpha");
        let beta = repos_root.join("beta");
        fs::create_dir_all(alpha.join(".git")).expect("create alpha repo");
        fs::create_dir_all(beta.join(".git")).expect("create beta repo");

        state
            .storage
            .save_registered_projects(&[Project {
                id: "alpha".into(),
                name: "Alpha".into(),
                path: alpha.to_string_lossy().to_string(),
                default_branch: "main".into(),
                is_linked: true,
                remote_url: Some("git@example.com:alpha.git".into()),
            }])
            .expect("save registered project");

        let discovered = state
            .discover_projects(&repos_root)
            .expect("discover projects");

        assert_eq!(discovered.len(), 1);
        assert_eq!(discovered[0].name, "beta");

        fs::remove_dir_all(root).expect("remove test storage");
    }

    #[tokio::test]
    async fn question_timeout_marks_task_failed_and_logs_system_message() {
        let (state, root) = build_test_state();
        let task = Task::new(
            "task-timeout".into(),
            "project-1".into(),
            "Timeout prompt".into(),
            "Wait for input".into(),
            "codex".into(),
            Vec::new(),
            "main".into(),
        )
        .transition(TaskStatus::Executing)
        .expect("move task into executing state")
        .transition(TaskStatus::WaitingForInput)
        .expect("move task into waiting state");

        let mut waiting_task = task.clone();
        waiting_task.pending_question = Some(TaskQuestion {
            task_id: waiting_task.id.clone(),
            q: "Need approval".into(),
            opts: vec!["yes".into()],
            allow_freeform: true,
        });

        state
            .storage
            .save_tasks("project-1", &[waiting_task.clone()])
            .expect("seed waiting task");

        let key = runtime_key("project-1", &waiting_task.id);
        state
            .runtime
            .question_tokens
            .lock()
            .await
            .insert(key, "token-1".into());

        let sink = MockSink::default();
        state
            .handle_question_timeout(
                sink.clone(),
                "project-1".into(),
                waiting_task.id.clone(),
                "token-1".into(),
                0,
            )
            .await
            .expect("handle question timeout");

        let failed = state
            .get_task("project-1", &waiting_task.id)
            .expect("load failed task");
        assert_eq!(failed.status, TaskStatus::Failed);
        assert_eq!(
            failed.latest_error.as_deref(),
            Some("Question timed out after 0 seconds")
        );

        let logs = state
            .storage
            .read_logs(&waiting_task.id)
            .expect("read timeout logs");
        assert!(logs.iter().any(|entry| entry.stream == "system"
            && entry.message.contains("Question timed out after 0 seconds")));
        assert!(sink
            .logs
            .lock()
            .expect("read logs")
            .iter()
            .any(|(_, _, entry)| entry.stream == "system"));

        fs::remove_dir_all(root).expect("remove test storage");
    }

    #[test]
    fn cleanup_workspace_after_completion_removes_directory_and_clears_path() {
        let workspace_root =
            std::env::temp_dir().join(format!("agentkanban-workspace-cleanup-{}", Uuid::new_v4()));
        fs::create_dir_all(&workspace_root).expect("create workspace root");
        fs::write(workspace_root.join("marker.txt"), "ok").expect("seed workspace file");

        let mut task = Task::new(
            "task-cleanup".into(),
            "project-1".into(),
            "Cleanup workspace".into(),
            "Cleanup workspace".into(),
            "codex".into(),
            Vec::new(),
            "main".into(),
        );
        task.workspace_path = Some(workspace_root.to_string_lossy().to_string());

        let result = cleanup_workspace_after_completion(&mut task);

        assert!(result.is_none());
        assert!(task.workspace_path.is_none());
        assert!(!workspace_root.exists());
    }

    #[tokio::test]
    async fn smoke_flow_covers_discovery_register_answer_approve_cleanup_and_timeout() {
        let (state, root) = build_test_state();
        let sink = MockSink::default();
        let fixture = create_linked_repo_fixture(&root);

        let discovered = state
            .discover_projects(&fixture.scan_root)
            .expect("discover unregistered projects");
        assert_eq!(discovered.len(), 1);
        assert_eq!(
            normalize_test_path(&discovered[0].path),
            normalize_test_path(fixture.source_repo.to_string_lossy().as_ref())
        );

        let project = state
            .register_project(&fixture.source_repo)
            .expect("register discovered project");
        let registered = state
            .list_registered_projects()
            .expect("load registered projects");
        assert_eq!(registered.len(), 1);
        assert_eq!(registered[0].id, project.id);

        let mut harness_config = HarnessConfig::default();
        harness_config.guardrail_commands.clear();
        harness_config.review_command = format!("node {}", fixture.review_script.to_string_lossy());
        harness_config.question_timeout_secs = 1;
        state
            .save_harness_config(&project.id, harness_config)
            .await
            .expect("save harness config");

        let answer_task = state
            .create_task(CreateTaskInput {
                project_id: project.id.clone(),
                project_path: project.path.clone(),
                base_branch: project.default_branch.clone(),
                description: "ANSWER FLOW - implement feature file".into(),
                cli_command: "node".into(),
                cli_args: vec![fixture.agent_script.to_string_lossy().into_owned()],
                env_vars: HashMap::new(),
            })
            .expect("create answer-flow task");

        let answer_handle = {
            let state = state.clone();
            let sink = sink.clone();
            let project_id = project.id.clone();
            let task_id = answer_task.id.clone();
            tokio::spawn(async move { state.run_task(sink, project_id, task_id).await })
        };

        let waiting = wait_for_task_status(
            &state,
            &project.id,
            &answer_task.id,
            TaskStatus::WaitingForInput,
        )
        .await;
        assert_eq!(
            waiting
                .pending_question
                .as_ref()
                .map(|question| question.q.as_str()),
            Some("Apply generated change?")
        );

        let answered = state
            .answer_question(
                sink.clone(),
                project.id.clone(),
                answer_task.id.clone(),
                "approve".into(),
            )
            .await
            .expect("answer question");
        assert_eq!(answered.status, TaskStatus::Executing);

        answer_handle
            .await
            .expect("join answer task runner")
            .expect("run answer task");

        let awaiting_acceptance = wait_for_task_status(
            &state,
            &project.id,
            &answer_task.id,
            TaskStatus::AwaitingAcceptance,
        )
        .await;
        let answer_workspace_path = awaiting_acceptance
            .workspace_path
            .clone()
            .expect("workspace path should exist before approval");
        assert!(
            awaiting_acceptance
                .review
                .as_deref()
                .unwrap_or_default()
                .contains("Review ok"),
            "unexpected review output: {:?}",
            awaiting_acceptance.review
        );
        assert!(Path::new(&answer_workspace_path).exists());

        let completed = state
            .approve_task(sink.clone(), project.id.clone(), answer_task.id.clone())
            .expect("approve answer task");
        assert_eq!(completed.status, TaskStatus::Completed);
        assert!(completed.workspace_path.is_none());
        assert!(!Path::new(&answer_workspace_path).exists());
        assert_eq!(
            fs::read_to_string(fixture.source_repo.join("feature.txt"))
                .expect("read merged file")
                .replace("\r\n", "\n"),
            "approved change\n"
        );

        let timeout_task = state
            .create_task(CreateTaskInput {
                project_id: project.id.clone(),
                project_path: project.path.clone(),
                base_branch: project.default_branch.clone(),
                description: "TIMEOUT FLOW - wait for operator forever".into(),
                cli_command: "node".into(),
                cli_args: vec![fixture.agent_script.to_string_lossy().into_owned()],
                env_vars: HashMap::new(),
            })
            .expect("create timeout task");

        let timeout_handle = {
            let state = state.clone();
            let sink = sink.clone();
            let project_id = project.id.clone();
            let task_id = timeout_task.id.clone();
            tokio::spawn(async move { state.run_task(sink, project_id, task_id).await })
        };

        let failed =
            wait_for_task_status(&state, &project.id, &timeout_task.id, TaskStatus::Failed).await;
        timeout_handle
            .await
            .expect("join timeout task runner")
            .expect("run timeout task");

        assert_eq!(
            failed.latest_error.as_deref(),
            Some("Question timed out after 1 seconds")
        );
        assert!(failed.pending_question.is_none());
        let timeout_logs = state
            .storage
            .read_logs(&timeout_task.id)
            .expect("read timeout logs");
        assert!(timeout_logs.iter().any(|entry| entry.stream == "system"
            && entry.message.contains("Question timed out after 1 seconds")));

        fs::remove_dir_all(root).expect("remove test storage");
    }

    fn create_linked_repo_fixture(root: &Path) -> RepoFixture {
        let scan_root = root.join("scan-root");
        let script_root = root.join("test-scripts");
        let upstream = root.join("upstream.git");
        let source_repo = scan_root.join("alpha-app");
        let agent_script = script_root.join("fake-agent.js");
        let review_script = script_root.join("review.js");

        fs::create_dir_all(&scan_root).expect("create scan root");
        fs::create_dir_all(&script_root).expect("create script root");
        git_cmd(
            root,
            [
                "init",
                "--bare",
                "--initial-branch=main",
                upstream.to_string_lossy().as_ref(),
            ],
        );
        git_cmd(
            &scan_root,
            [
                "init",
                "--initial-branch=main",
                source_repo.to_string_lossy().as_ref(),
            ],
        );
        git_cmd(&source_repo, ["config", "user.name", "Test User"]);
        git_cmd(&source_repo, ["config", "user.email", "test@example.com"]);
        fs::write(source_repo.join("README.md"), "# Smoke Flow\n").expect("write readme");
        fs::write(&agent_script, fake_agent_script()).expect("write fake agent");
        fs::write(&review_script, "console.log('Review ok')\n").expect("write review script");
        git_cmd(&source_repo, ["add", "README.md"]);
        git_cmd(&source_repo, ["commit", "-m", "initial"]);
        git_cmd(
            &source_repo,
            [
                "remote",
                "add",
                "origin",
                upstream.to_string_lossy().as_ref(),
            ],
        );
        git_cmd(&source_repo, ["push", "-u", "origin", "main"]);

        RepoFixture {
            scan_root,
            source_repo,
            agent_script,
            review_script,
        }
    }

    async fn wait_for_task_status(
        state: &AppState,
        project_id: &str,
        task_id: &str,
        expected: TaskStatus,
    ) -> Task {
        for _ in 0..120 {
            let task = state
                .get_task(project_id, task_id)
                .expect("load task while waiting");
            if task.status == expected {
                return task;
            }

            tokio_sleep(TokioDuration::from_millis(50)).await;
        }

        let task = state
            .get_task(project_id, task_id)
            .expect("load task after waiting");
        let recent_logs = state
            .storage
            .read_logs(task_id)
            .map(|entries| {
                entries
                    .into_iter()
                    .rev()
                    .take(5)
                    .map(|entry| format!("[{}] {}", entry.stream, entry.message))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        panic!(
            "task {task_id} did not reach status {:?}; latest status was {:?}; latest error was {:?}; recent logs: {:?}",
            expected,
            task.status,
            task.latest_error,
            recent_logs
        );
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

    fn normalize_test_path(value: &str) -> String {
        value.trim().replace('\\', "/").to_ascii_lowercase()
    }

    fn fake_agent_script() -> &'static str {
        r#"const fs = require('fs');
const prompt = process.argv[2] ?? '';

if (prompt.includes('Review the following diff')) {
  console.log('Review ok');
  process.exit(0);
} else if (prompt.includes('ANSWER FLOW')) {
  console.log('___QUESTION___' + JSON.stringify({ q: 'Apply generated change?', opts: ['approve'] }));
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', (data) => {
    const reply = data.trim();
    if (reply !== 'approve') {
      console.error('unexpected reply: ' + reply);
      process.exit(1);
      return;
    }

    fs.writeFileSync('feature.txt', 'approved change\n');
    console.log('implemented');
    process.exit(0);
  });
  process.stdin.resume();
} else if (prompt.includes('TIMEOUT FLOW')) {
  console.log('___QUESTION___' + JSON.stringify({ q: 'Need approval', opts: ['approve'] }));
  process.stdin.resume();
  setInterval(() => {}, 1000);
} else {
    fs.writeFileSync('feature.txt', 'default\n');
    process.exit(0);
}
"#
    }

    struct RepoFixture {
        scan_root: PathBuf,
        source_repo: PathBuf,
        agent_script: PathBuf,
        review_script: PathBuf,
    }
}
