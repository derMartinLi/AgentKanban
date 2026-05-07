use crate::domain::TaskStatus;
use serde_json::{json, Value};
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    InvalidRequest,
    ProjectNotFound,
    ProjectNotLinked,
    ProjectMissingOriginRemote,
    ProjectPathMismatch,
    TaskNotFound,
    IllegalTransition,
    CommandFailed,
    PermissionDenied,
    InternalError,
}

impl ErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::ProjectNotFound => "project_not_found",
            Self::ProjectNotLinked => "project_not_linked",
            Self::ProjectMissingOriginRemote => "project_missing_origin_remote",
            Self::ProjectPathMismatch => "project_path_mismatch",
            Self::TaskNotFound => "task_not_found",
            Self::IllegalTransition => "illegal_transition",
            Self::CommandFailed => "command_failed",
            Self::PermissionDenied => "permission_denied",
            Self::InternalError => "internal_error",
        }
    }
}

#[derive(Debug, Error, Clone)]
pub enum AppError {
    #[error("{message}")]
    InvalidRequest { message: String },
    #[error("Project '{project_id}' does not exist")]
    ProjectNotFound { project_id: String },
    #[error("Project '{project_id}' is not linked in AgentKanban")]
    ProjectNotLinked { project_id: String },
    #[error("project must have an origin remote to support collaboration flows")]
    ProjectMissingOriginRemote { project_path: String },
    #[error("Provided project_path does not match linked project '{project_id}'")]
    ProjectPathMismatch {
        project_id: String,
        expected_path: String,
        received_path: String,
    },
    #[error("Task '{task_id}' does not exist")]
    TaskNotFound { task_id: String },
    #[error("illegal status transition: {from:?} -> {to:?}")]
    IllegalTransition { from: TaskStatus, to: TaskStatus },
    #[error("{message}")]
    CommandFailed {
        message: String,
        #[allow(dead_code)]
        command: Option<String>,
    },
    #[error("{message}")]
    PermissionDenied { message: String },
    #[error("{message}")]
    Internal { message: String },
}

impl AppError {
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::InvalidRequest {
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }

    pub fn command_failed(message: impl Into<String>) -> Self {
        Self::CommandFailed {
            message: message.into(),
            command: None,
        }
    }

    pub const fn code(&self) -> ErrorCode {
        match self {
            Self::InvalidRequest { .. } => ErrorCode::InvalidRequest,
            Self::ProjectNotFound { .. } => ErrorCode::ProjectNotFound,
            Self::ProjectNotLinked { .. } => ErrorCode::ProjectNotLinked,
            Self::ProjectMissingOriginRemote { .. } => ErrorCode::ProjectMissingOriginRemote,
            Self::ProjectPathMismatch { .. } => ErrorCode::ProjectPathMismatch,
            Self::TaskNotFound { .. } => ErrorCode::TaskNotFound,
            Self::IllegalTransition { .. } => ErrorCode::IllegalTransition,
            Self::CommandFailed { .. } => ErrorCode::CommandFailed,
            Self::PermissionDenied { .. } => ErrorCode::PermissionDenied,
            Self::Internal { .. } => ErrorCode::InternalError,
        }
    }

    pub fn details(&self) -> Value {
        match self {
            Self::InvalidRequest { .. }
            | Self::CommandFailed { .. }
            | Self::PermissionDenied { .. }
            | Self::Internal { .. } => json!({}),
            Self::ProjectNotFound { project_id } | Self::ProjectNotLinked { project_id } => {
                json!({ "project_id": project_id })
            }
            Self::ProjectMissingOriginRemote { project_path } => {
                json!({ "project_path": project_path })
            }
            Self::ProjectPathMismatch {
                project_id,
                expected_path,
                received_path,
            } => json!({
                "project_id": project_id,
                "expected_path": expected_path,
                "received_path": received_path,
            }),
            Self::TaskNotFound { task_id } => json!({ "task_id": task_id }),
            Self::IllegalTransition { from, to } => json!({
                "from": from,
                "to": to,
            }),
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(error: anyhow::Error) -> Self {
        if let Some(app_error) = error.downcast_ref::<AppError>() {
            return app_error.clone();
        }

        Self::internal(error.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::internal(error.to_string())
    }
}