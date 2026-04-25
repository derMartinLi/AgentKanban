use app_lib::git_ops;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn create_workspace_keeps_source_and_real_origin_separate() {
    let root = unique_temp_dir("agent-kanban-git-ops");
    let upstream = root.join("upstream.git");
    let source = root.join("source");
    let workspace = root.join("workspace");

    git(&root, ["init", "--bare", "--initial-branch=main", upstream.to_string_lossy().as_ref()]);
    git(&root, ["init", "--initial-branch=main", source.to_string_lossy().as_ref()]);
    git(&source, ["config", "user.name", "Test User"]);
    git(&source, ["config", "user.email", "test@example.com"]);
    fs::write(source.join("README.md"), "hello world\n").unwrap();
    git(&source, ["add", "README.md"]);
    git(&source, ["commit", "-m", "initial"]);
    git(&source, ["remote", "add", "origin", upstream.to_string_lossy().as_ref()]);
    git(&source, ["push", "-u", "origin", "main"]);

    git_ops::create_workspace(&source, &workspace, "main", "ai/test-branch").unwrap();

    let current_branch = git(&workspace, ["branch", "--show-current"]);
    assert_eq!(current_branch.trim(), "ai/test-branch");

    let source_remote = git(&workspace, ["remote", "get-url", "source"]);
    assert_eq!(normalize_path(&source_remote), normalize_path(source.to_string_lossy().as_ref()));

    let origin_remote = git(&workspace, ["remote", "get-url", "origin"]);
    assert_eq!(normalize_path(&origin_remote), normalize_path(upstream.to_string_lossy().as_ref()));
}

fn git<I, S>(cwd: &Path, args: I) -> String
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let output = Command::new("git")
        .current_dir(cwd)
        .args(args.into_iter().map(|value| value.as_ref().to_string()))
        .output()
        .unwrap();

    if !output.status.success() {
        panic!(
            "git command failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn normalize_path(value: &str) -> String {
    value.trim().replace('\\', "/").to_ascii_lowercase()
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