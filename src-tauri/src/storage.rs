use crate::domain::{HarnessConfig, Project, Task, TaskLogEntry};
use anyhow::{Context, Result};
use std::{
    env,
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone)]
pub struct Storage {
    root: PathBuf,
}

impl Storage {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(root.join("projects"))?;
        fs::create_dir_all(root.join("logs"))?;
        fs::create_dir_all(root.join("workspaces"))?;
        Ok(Self { root })
    }

    pub fn default() -> Result<Self> {
        let home = env::var_os("USERPROFILE")
            .or_else(|| env::var_os("HOME"))
            .map(PathBuf::from)
            .context("could not determine user home directory")?;
        Self::new(home.join(".aitask"))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn load_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        let path = self.tasks_path(project_id);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read tasks file at {}", path.display()))?;
        let tasks = serde_json::from_str(&content)
            .with_context(|| format!("failed to parse tasks file at {}", path.display()))?;
        Ok(tasks)
    }

    pub fn load_registered_projects(&self) -> Result<Vec<Project>> {
        let path = self.project_registry_path();
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read project registry at {}", path.display()))?;
        let projects = serde_json::from_str(&content)
            .with_context(|| format!("failed to parse project registry at {}", path.display()))?;
        Ok(projects)
    }

    pub fn save_registered_projects(&self, projects: &[Project]) -> Result<()> {
        let path = self.project_registry_path();
        self.ensure_parent(&path)?;
        let content = serde_json::to_string_pretty(projects)?;
        fs::write(&path, content)
            .with_context(|| format!("failed to write project registry at {}", path.display()))?;
        Ok(())
    }

    pub fn upsert_registered_project(&self, project: &Project) -> Result<()> {
        let mut projects = self.load_registered_projects()?;
        let key = normalize_project_path(&project.path);

        if let Some(existing) = projects
            .iter_mut()
            .find(|entry| normalize_project_path(&entry.path) == key)
        {
            *existing = project.clone();
        } else {
            projects.push(project.clone());
        }

        projects.sort_by(|left, right| left.name.cmp(&right.name));
        self.save_registered_projects(&projects)
    }

    pub fn save_tasks(&self, project_id: &str, tasks: &[Task]) -> Result<()> {
        let path = self.tasks_path(project_id);
        self.ensure_parent(&path)?;
        let content = serde_json::to_string_pretty(tasks)?;
        fs::write(&path, content)
            .with_context(|| format!("failed to write tasks file at {}", path.display()))?;
        Ok(())
    }

    pub fn load_harness_config(&self, project_id: &str) -> Result<HarnessConfig> {
        let path = self.harness_path(project_id);
        if !path.exists() {
            return Ok(HarnessConfig::default());
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read harness file at {}", path.display()))?;
        let config = serde_yaml::from_str(&content)
            .with_context(|| format!("failed to parse harness file at {}", path.display()))?;
        Ok(config)
    }

    pub fn save_harness_config(&self, project_id: &str, config: &HarnessConfig) -> Result<()> {
        let path = self.harness_path(project_id);
        self.ensure_parent(&path)?;
        let content = serde_yaml::to_string(config)?;
        fs::write(&path, content)
            .with_context(|| format!("failed to write harness file at {}", path.display()))?;
        Ok(())
    }

    pub fn append_log(&self, task_id: &str, entry: &TaskLogEntry) -> Result<()> {
        let path = self.log_path(task_id);
        self.ensure_parent(&path)?;
        let mut lines = if path.exists() {
            fs::read_to_string(&path)?
        } else {
            String::new()
        };
        if !lines.is_empty() {
            lines.push('\n');
        }
        lines.push_str(&serde_json::to_string(entry)?);
        fs::write(path, lines)?;
        Ok(())
    }

    pub fn read_logs(&self, task_id: &str) -> Result<Vec<TaskLogEntry>> {
        let path = self.log_path(task_id);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(path)?;
        content
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str(line).map_err(Into::into))
            .collect()
    }

    pub fn create_workspace_dir(&self, task_id: &str) -> Result<PathBuf> {
        let dir = self.root.join("workspaces").join(task_id);
        fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    pub fn discover_projects(&self, root_dir: &Path) -> Result<Vec<Project>> {
        if !root_dir.exists() {
            return Ok(Vec::new());
        }

        let mut projects = Vec::new();
        self.walk_projects(root_dir, 0, &mut projects)?;
        projects.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(projects)
    }

    fn walk_projects(&self, dir: &Path, depth: usize, projects: &mut Vec<Project>) -> Result<()> {
        if depth > 4 {
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            if path.join(".git").exists() {
                let name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("project")
                    .to_string();
                projects.push(Project {
                    id: sanitize_key(&name),
                    name,
                    path: path.to_string_lossy().to_string(),
                    default_branch: "main".into(),
                    is_linked: false,
                    remote_url: None,
                });
                continue;
            }

            self.walk_projects(&path, depth + 1, projects)?;
        }

        Ok(())
    }

    fn project_dir(&self, project_id: &str) -> PathBuf {
        self.root.join("projects").join(sanitize_key(project_id))
    }

    fn project_registry_path(&self) -> PathBuf {
        self.root.join("projects").join("registry.json")
    }

    fn tasks_path(&self, project_id: &str) -> PathBuf {
        self.project_dir(project_id).join("tasks.json")
    }

    fn harness_path(&self, project_id: &str) -> PathBuf {
        self.project_dir(project_id).join("harness.yaml")
    }

    fn log_path(&self, task_id: &str) -> PathBuf {
        self.root.join("logs").join(format!("{task_id}.log"))
    }

    fn ensure_parent(&self, path: &Path) -> Result<()> {
        let parent = path.parent().context("missing parent directory")?;
        fs::create_dir_all(parent)?;
        Ok(())
    }
}

fn sanitize_key(value: &str) -> String {
    let mut key = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            key.push(ch.to_ascii_lowercase());
        } else if !key.ends_with('-') {
            key.push('-');
        }
    }

    key.trim_matches('-').to_string()
}

fn normalize_project_path(value: &str) -> String {
    value.replace('\\', "/").to_ascii_lowercase()
}