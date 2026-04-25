use crate::domain::{HarnessConfig, Task};
use anyhow::Result;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

pub struct HarnessPayload {
    pub prompt: String,
    pub env_vars: HashMap<String, String>,
}

pub fn build_harness_payload(project_path: &Path, task: &Task, config: &HarnessConfig) -> Result<HarnessPayload> {
    let merged_env = merge_env_vars(project_path, task, config)?;
    let prompt = build_prompt(project_path, task, config)?;
    Ok(HarnessPayload {
        prompt,
        env_vars: merged_env,
    })
}

fn build_prompt(project_path: &Path, task: &Task, config: &HarnessConfig) -> Result<String> {
    let files = collect_context_files(project_path, config);
    let mut sections = vec![format!("Task:\n{}", task.description)];

    if !task.feedback_history.is_empty() {
        sections.push(format!(
            "Feedback History:\n{}",
            task.feedback_history.join("\n---\n")
        ));
    }

    for file in files {
        if let Ok(content) = fs::read_to_string(&file) {
            if !content.trim().is_empty() {
                sections.push(format!(
                    "Context File: {}\n{}",
                    file.strip_prefix(project_path)
                        .unwrap_or(&file)
                        .display(),
                    content
                ));
            }
        }
    }

    Ok(sections.join("\n\n"))
}

fn merge_env_vars(project_path: &Path, task: &Task, config: &HarnessConfig) -> Result<HashMap<String, String>> {
    let mut merged = config.env_vars.clone();

    for (key, value) in parse_dotenv(project_path.join(".env.example"))? {
        merged.entry(key).or_insert(value);
    }

    for (key, value) in parse_dotenv(project_path.join(".env"))? {
        merged.insert(key, value);
    }

    for (key, value) in &task.env_vars {
        merged.insert(key.clone(), value.clone());
    }

    Ok(merged)
}

fn collect_context_files(project_path: &Path, config: &HarnessConfig) -> Vec<PathBuf> {
    let mut files = vec![
        project_path.join(".editorconfig"),
        project_path.join("CONTRIBUTING.md"),
        project_path.join("README.md"),
    ];

    for file in &config.resource_files {
        files.push(project_path.join(file));
    }

    files
}

fn parse_dotenv(path: PathBuf) -> Result<HashMap<String, String>> {
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(path)?;
    let mut values = HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if let Some((key, value)) = trimmed.split_once('=') {
            values.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    Ok(values)
}