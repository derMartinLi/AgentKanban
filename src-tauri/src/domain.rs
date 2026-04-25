use anyhow::{anyhow, Result};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskStatus {
    Pending,
    Executing,
    WaitingForInput,
    GuardrailCheck,
    NeedsRevision,
    Blocked,
    AiReview,
    AwaitingAcceptance,
    Failed,
    Completed,
}

impl TaskStatus {
    pub fn can_transition_to(&self, next: &TaskStatus) -> bool {
        use TaskStatus as S;

        matches!(
            (self, next),
            (S::Pending, S::Executing)
                | (S::Pending, S::Failed)
                | (S::Executing, S::WaitingForInput)
                | (S::Executing, S::GuardrailCheck)
                | (S::Executing, S::Failed)
                | (S::Executing, S::Blocked)
                | (S::WaitingForInput, S::Executing)
                | (S::WaitingForInput, S::Failed)
                | (S::WaitingForInput, S::Blocked)
                | (S::GuardrailCheck, S::NeedsRevision)
                | (S::GuardrailCheck, S::AiReview)
                | (S::GuardrailCheck, S::Blocked)
                | (S::GuardrailCheck, S::Failed)
                | (S::NeedsRevision, S::Executing)
                | (S::NeedsRevision, S::Blocked)
                | (S::NeedsRevision, S::Failed)
                | (S::Blocked, S::Executing)
                | (S::Blocked, S::Failed)
                | (S::AiReview, S::AwaitingAcceptance)
                | (S::AiReview, S::Failed)
                | (S::AwaitingAcceptance, S::Executing)
                | (S::AwaitingAcceptance, S::Completed)
                | (S::AwaitingAcceptance, S::Failed)
                | (S::Failed, S::Pending)
                | (S::Failed, S::Executing)
        )
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Blocked | Self::Failed | Self::Completed)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub default_branch: String,
    #[serde(default)]
    pub is_linked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskQuestion {
    pub task_id: String,
    pub q: String,
    pub opts: Vec<String>,
    #[serde(default)]
    pub allow_freeform: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskLogEntry {
    pub timestamp: String,
    pub stream: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HarnessConfig {
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
    #[serde(default)]
    pub resource_files: Vec<String>,
    #[serde(default = "default_guardrail_commands")]
    pub guardrail_commands: Vec<String>,
    #[serde(default = "default_max_concurrency")]
    pub max_concurrency: usize,
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    #[serde(default)]
    pub review_command: String,
    #[serde(default = "default_question_timeout")]
    pub question_timeout_secs: u64,
}

impl Default for HarnessConfig {
    fn default() -> Self {
        Self {
            env_vars: HashMap::new(),
            resource_files: Vec::new(),
            guardrail_commands: default_guardrail_commands(),
            max_concurrency: default_max_concurrency(),
            max_retries: default_max_retries(),
            review_command: String::new(),
            question_timeout_secs: default_question_timeout(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub cli_command: String,
    #[serde(default)]
    pub cli_args: Vec<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
    #[serde(default)]
    pub feedback_history: Vec<String>,
    #[serde(default)]
    pub revision_count: u32,
    pub branch_name: String,
    pub base_branch: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_guardrail_report: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_question: Option<TaskQuestion>,
}

impl Task {
    pub fn new(
        id: String,
        project_id: String,
        title: String,
        description: String,
        cli_command: String,
        cli_args: Vec<String>,
        base_branch: String,
    ) -> Self {
        let branch_slug = slugify(&title);
        let now = timestamp_now();

        Self {
            id,
            project_id,
            project_path: None,
            title,
            description,
            status: TaskStatus::Pending,
            cli_command,
            cli_args,
            env_vars: HashMap::new(),
            feedback_history: Vec::new(),
            revision_count: 0,
            branch_name: format!("ai/{branch_slug}"),
            base_branch,
            created_at: now.clone(),
            updated_at: now,
            review: None,
            diff: None,
            latest_error: None,
            workspace_path: None,
            remote_branch: None,
            latest_guardrail_report: None,
            pending_question: None,
        }
    }

    pub fn transition(&self, next: TaskStatus) -> Result<Self> {
        if !self.status.can_transition_to(&next) {
            return Err(anyhow!(
                "illegal status transition: {:?} -> {:?}",
                self.status,
                next
            ));
        }

        let mut updated = self.clone();
        updated.status = next;
        updated.updated_at = timestamp_now();
        Ok(updated)
    }
}

pub fn timestamp_now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn default_guardrail_commands() -> Vec<String> {
    vec!["pnpm lint".into(), "pnpm test".into()]
}

fn default_max_concurrency() -> usize {
    2
}

fn default_max_retries() -> u32 {
    2
}

fn default_question_timeout() -> u64 {
    120
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if (ch.is_ascii_whitespace() || ch == '-' || ch == '_') && !slug.ends_with('-') {
            slug.push('-');
        }
    }

    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "task".to_string()
    } else {
        slug.to_string()
    }
}