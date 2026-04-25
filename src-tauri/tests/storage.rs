use app_lib::domain::{HarnessConfig, Task};
use app_lib::storage::Storage;
use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

#[test]
fn persists_tasks_and_harness_config_per_project() {
    let root = unique_temp_dir("agent-kanban-storage");
    let storage = Storage::new(root.clone()).unwrap();

    let task = Task::new(
        "task-1".into(),
        "project-alpha".into(),
        "Persist me".into(),
        "Persist me".into(),
        "codex".into(),
        vec!["run".into()],
        "main".into(),
    );

    storage.save_tasks("project-alpha", &[task.clone()]).unwrap();
    let loaded_tasks = storage.load_tasks("project-alpha").unwrap();

    assert_eq!(loaded_tasks, vec![task]);

    let mut config = HarnessConfig::default();
    config.env_vars.insert("API_KEY".into(), "demo".into());
    config.resource_files.push("CONTRIBUTING.md".into());

    storage.save_harness_config("project-alpha", &config).unwrap();
    let loaded_config = storage.load_harness_config("project-alpha").unwrap();

    assert_eq!(loaded_config, config);
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("{prefix}-{nanos}"));
    fs::create_dir_all(&dir).unwrap();
    dir
}