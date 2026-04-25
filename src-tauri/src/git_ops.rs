use anyhow::{anyhow, Context, Result};
use std::{
    fs,
    path::Path,
    process::Command,
};

pub fn current_branch(project_path: &Path) -> Result<String> {
    let output = git(project_path, ["branch", "--show-current"])?;
    let branch = output.trim();
    if branch.is_empty() {
        Ok("main".into())
    } else {
        Ok(branch.to_string())
    }
}

pub fn create_workspace(project_path: &Path, workspace_path: &Path, branch_name: &str) -> Result<()> {
    if workspace_path.exists() {
        return Ok(());
    }

    if let Some(parent) = workspace_path.parent() {
        fs::create_dir_all(parent)?;
    }

    command(project_path, "git", ["clone", project_path.to_string_lossy().as_ref(), workspace_path.to_string_lossy().as_ref()])?;
    git(workspace_path, ["config", "user.name", "AI Assistant"])?;
    git(workspace_path, ["config", "user.email", "ai-assistant@local"])?;
    git(workspace_path, ["checkout", "-B", branch_name])?;
    Ok(())
}

pub fn commit_all(workspace_path: &Path, message: &str) -> Result<()> {
    git(workspace_path, ["add", "-A"])?;
    let status = git(workspace_path, ["status", "--porcelain"])?;
    if status.trim().is_empty() {
        git(workspace_path, ["commit", "--allow-empty", "-m", message])?;
    } else {
        git(workspace_path, ["commit", "-m", message])?;
    }
    Ok(())
}

pub fn diff_against_base(workspace_path: &Path, base_branch: &str, branch_name: &str) -> Result<String> {
    git(
        workspace_path,
        ["diff", &format!("{base_branch}...{branch_name}")],
    )
}

pub fn push_branch(workspace_path: &Path, branch_name: &str) -> Result<()> {
    if !has_remote(workspace_path, "origin")? {
        return Ok(());
    }

    git(workspace_path, ["push", "-u", "origin", branch_name])?;
    Ok(())
}

pub fn merge_workspace_branch(source_project_path: &Path, workspace_path: &Path, branch_name: &str, base_branch: &str) -> Result<()> {
    git(source_project_path, ["fetch", workspace_path.to_string_lossy().as_ref(), branch_name])?;
    git(source_project_path, ["checkout", base_branch])?;
    git(source_project_path, ["merge", "--no-edit", "FETCH_HEAD"])?;

    if has_remote(source_project_path, "origin")? {
        let _ = git(source_project_path, ["push", "origin", base_branch]);
    }

    Ok(())
}

pub fn has_remote(project_path: &Path, remote_name: &str) -> Result<bool> {
    let output = git(project_path, ["remote"])?;
    Ok(output.lines().any(|line| line.trim() == remote_name))
}

pub fn command<I, S>(cwd: &Path, program: &str, args: I) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let output = Command::new(program)
        .current_dir(cwd)
        .args(args.into_iter().map(|value| value.as_ref().to_string()))
        .output()
        .with_context(|| format!("failed to run {program} in {}", cwd.display()))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(anyhow!(String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

pub fn shell(cwd: &Path, command_line: &str) -> Result<String> {
    #[cfg(target_os = "windows")]
    {
        return command(cwd, "cmd", ["/C", command_line]);
    }

    #[cfg(not(target_os = "windows"))]
    {
        command(cwd, "sh", ["-lc", command_line])
    }
}

fn git<I, S>(cwd: &Path, args: I) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    command(cwd, "git", args)
}