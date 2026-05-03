use crate::domain::{HarnessConfig, Task};
use anyhow::Result;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

const MAX_TREE_DEPTH: usize = 3;
const MAX_TREE_ENTRIES: usize = 60;
const IGNORED_TREE_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    "target",
    "coverage",
    "__pycache__",
];

pub struct HarnessPayload {
    pub prompt: String,
    pub env_vars: HashMap<String, String>,
}

pub fn build_harness_payload(
    project_path: &Path,
    task: &Task,
    config: &HarnessConfig,
) -> Result<HarnessPayload> {
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

    if let Some(tree) = summarize_project_tree(project_path) {
        sections.push(format!("Project Tree:\n{tree}"));
    }

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
                    file.strip_prefix(project_path).unwrap_or(&file).display(),
                    content
                ));
            }
        }
    }

    Ok(sections.join("\n\n"))
}

fn merge_env_vars(
    project_path: &Path,
    task: &Task,
    config: &HarnessConfig,
) -> Result<HashMap<String, String>> {
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

fn summarize_project_tree(project_path: &Path) -> Option<String> {
    let mut lines = vec![String::from(".")];
    let mut emitted = 0usize;
    append_tree_entries(project_path, 0, &mut emitted, &mut lines);

    if lines.len() == 1 {
        None
    } else {
        Some(lines.join("\n"))
    }
}

fn append_tree_entries(dir: &Path, depth: usize, emitted: &mut usize, lines: &mut Vec<String>) {
    if depth >= MAX_TREE_DEPTH || *emitted >= MAX_TREE_ENTRIES {
        return;
    }

    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut children = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            !IGNORED_TREE_DIRS.iter().any(|ignored| *ignored == name)
        })
        .collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.file_name().to_string_lossy().to_ascii_lowercase());

    for child in children {
        if *emitted >= MAX_TREE_ENTRIES {
            lines.push(format!("{}...", "  ".repeat(depth + 1)));
            return;
        }

        let path = child.path();
        let name = child.file_name().to_string_lossy().to_string();
        let suffix = if path.is_dir() { "/" } else { "" };
        lines.push(format!("{}{}{}", "  ".repeat(depth + 1), name, suffix));
        *emitted += 1;

        if path.is_dir() {
            append_tree_entries(&path, depth + 1, emitted, lines);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn build_prompt_includes_project_tree_and_ignores_noise_directories() {
        let root = unique_temp_dir("agentkanban-harness");
        fs::create_dir_all(root.join("src")).expect("create src");
        fs::create_dir_all(root.join("node_modules").join("left-pad")).expect("create ignored dir");
        fs::write(root.join("README.md"), "# Demo\n").expect("write readme");
        fs::write(root.join("src").join("main.ts"), "console.log('ok');\n").expect("write source");
        fs::write(root.join("node_modules").join("left-pad").join("index.js"), "module.exports = {};\n")
            .expect("write ignored file");

        let task = Task::new(
            "task-1".into(),
            "project-1".into(),
            "Inspect tree".into(),
            "Inspect tree".into(),
            "codex".into(),
            Vec::new(),
            "main".into(),
        );

        let prompt = build_prompt(&root, &task, &HarnessConfig::default()).expect("build prompt");

        assert!(prompt.contains("Project Tree:\n."));
        assert!(prompt.contains("README.md"));
        assert!(prompt.contains("src/"));
        assert!(prompt.contains("main.ts"));
        assert!(!prompt.contains("node_modules"));

        fs::remove_dir_all(root).expect("remove temp dir");
    }

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("{prefix}-{nanos}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }
}
