use app_lib::domain::{HarnessConfig, Project, Task};
use app_lib::storage::Storage;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

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

    storage
        .save_tasks("project-alpha", &[task.clone()])
        .unwrap();
    let loaded_tasks = storage.load_tasks("project-alpha").unwrap();

    assert_eq!(loaded_tasks, vec![task]);

    let mut config = HarnessConfig::default();
    config.env_vars.insert("API_KEY".into(), "demo".into());
    config.resource_files.push("CONTRIBUTING.md".into());
    config.semgrep_enabled = true;
    config.semgrep_config = "p/security-audit".into();

    storage
        .save_harness_config("project-alpha", &config)
        .unwrap();
    let loaded_config = storage.load_harness_config("project-alpha").unwrap();

    assert_eq!(loaded_config, config);
}

#[test]
fn persists_registered_projects_across_reloads() {
    let root = unique_temp_dir("agent-kanban-project-registry");
    let storage = Storage::new(root.clone()).unwrap();

    let projects = vec![
        Project {
            id: "alpha".into(),
            name: "Alpha".into(),
            path: "C:/repos/alpha".into(),
            default_branch: "main".into(),
            is_linked: true,
            remote_url: Some("git@github.com:example/alpha.git".into()),
        },
        Project {
            id: "beta".into(),
            name: "Beta".into(),
            path: "C:/repos/beta".into(),
            default_branch: "develop".into(),
            is_linked: true,
            remote_url: Some("git@github.com:example/beta.git".into()),
        },
    ];

    storage.save_registered_projects(&projects).unwrap();
    let loaded_projects = storage.load_registered_projects().unwrap();

    assert_eq!(loaded_projects, projects);
}

#[test]
fn loads_task_templates_from_templates_directory() {
    let root = unique_temp_dir("agent-kanban-templates");
    let storage = Storage::new(root.clone()).unwrap();
    let templates_dir = root.join("templates");

    fs::write(
        templates_dir.join("bugfix.md"),
        "Bugfix Template\nInvestigate the regression, add a focused fix, and update tests.\n",
    )
    .unwrap();
    fs::write(templates_dir.join("ignored.md"), "\nbody without title").unwrap();

    let templates = storage.load_task_templates().unwrap();

    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0].title, "Bugfix Template");
    assert_eq!(
        templates[0].description,
        "Investigate the regression, add a focused fix, and update tests."
    );
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
