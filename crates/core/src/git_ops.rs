use anyhow::{anyhow, Context, Result};
use std::{fs, path::Path, process::Command};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn configure_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_command(_command: &mut Command) {}

pub fn current_branch(project_path: &Path) -> Result<String> {
    let output = git(project_path, ["branch", "--show-current"])?;
    let branch = output.trim();
    if branch.is_empty() {
        Ok("main".into())
    } else {
        Ok(branch.to_string())
    }
}

pub fn default_branch(project_path: &Path) -> Result<String> {
    if let Ok(output) = git(
        project_path,
        ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    ) {
        let branch = output.trim().trim_start_matches("origin/");
        if !branch.is_empty() {
            return Ok(branch.to_string());
        }
    }

    for candidate in ["main", "master"] {
        if branch_exists(project_path, candidate)? {
            return Ok(candidate.to_string());
        }
    }

    current_branch(project_path)
}

pub fn origin_remote_url(project_path: &Path) -> Result<String> {
    let output = git(project_path, ["remote", "get-url", "origin"])?;
    let remote_url = output.trim();
    if remote_url.is_empty() {
        Err(anyhow!("origin remote is not configured"))
    } else {
        Ok(remote_url.to_string())
    }
}

pub fn create_workspace(
    project_path: &Path,
    workspace_path: &Path,
    base_branch: &str,
    branch_name: &str,
) -> Result<()> {
    if workspace_path.join(".git").exists() {
        return Ok(());
    }

    if workspace_path.exists() {
        fs::remove_dir_all(workspace_path)?;
    }

    let upstream_origin = origin_remote_url(project_path)?;

    if let Some(parent) = workspace_path.parent() {
        fs::create_dir_all(parent)?;
    }

    command(
        project_path,
        "git",
        [
            "clone",
            project_path.to_string_lossy().as_ref(),
            workspace_path.to_string_lossy().as_ref(),
        ],
    )?;
    git(workspace_path, ["config", "user.name", "AI Assistant"])?;
    git(
        workspace_path,
        ["config", "user.email", "ai-assistant@local"],
    )?;
    git(workspace_path, ["remote", "rename", "origin", "source"])?;
    git(
        workspace_path,
        ["remote", "add", "origin", &upstream_origin],
    )?;
    git(workspace_path, ["fetch", "origin"])?;
    checkout_base_branch(workspace_path, base_branch)?;
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

pub fn diff_against_base(
    workspace_path: &Path,
    base_branch: &str,
    branch_name: &str,
) -> Result<String> {
    git(
        workspace_path,
        ["diff", &format!("{base_branch}...{branch_name}")],
    )
}

pub fn push_branch(workspace_path: &Path, branch_name: &str) -> Result<()> {
    if !has_remote(workspace_path, "origin")? {
        return Err(anyhow!("origin remote is not configured"));
    }

    git(workspace_path, ["push", "-u", "origin", branch_name])?;
    Ok(())
}

pub fn merge_workspace_branch(
    source_project_path: &Path,
    workspace_path: &Path,
    branch_name: &str,
    base_branch: &str,
) -> Result<()> {
    git(
        source_project_path,
        [
            "fetch",
            workspace_path.to_string_lossy().as_ref(),
            branch_name,
        ],
    )?;
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
    let mut command = Command::new(program);
    configure_command(&mut command);

    let output = command
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

fn branch_exists(project_path: &Path, branch_name: &str) -> Result<bool> {
    let local = git(project_path, ["branch", "--list", branch_name])?;
    if !local.trim().is_empty() {
        return Ok(true);
    }

    let remote = git(
        project_path,
        [
            "branch",
            "--remote",
            "--list",
            &format!("origin/{branch_name}"),
        ],
    )?;
    Ok(!remote.trim().is_empty())
}

fn checkout_base_branch(workspace_path: &Path, base_branch: &str) -> Result<()> {
    let remote_branch = format!("origin/{base_branch}");
    let remote = git(
        workspace_path,
        ["branch", "--remote", "--list", &remote_branch],
    )?;
    if !remote.trim().is_empty() {
        git(
            workspace_path,
            ["checkout", "-B", base_branch, &remote_branch],
        )?;
        return Ok(());
    }

    let local = git(workspace_path, ["branch", "--list", base_branch])?;
    if !local.trim().is_empty() {
        git(workspace_path, ["checkout", base_branch])?;
        return Ok(());
    }

    Err(anyhow!(format!(
        "base branch {base_branch} was not found in the linked repository"
    )))
}
