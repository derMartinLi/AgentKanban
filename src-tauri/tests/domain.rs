use app_lib::domain::{Task, TaskStatus};

#[test]
fn allows_guardrail_revision_loop_but_rejects_invalid_completion() {
    let task = Task::new(
        "task-1".into(),
        "project-alpha".into(),
        "Demo task".into(),
        "Demo task".into(),
        "codex".into(),
        vec![],
        "main".into(),
    );

    let executing = task.transition(TaskStatus::Executing).unwrap();
    let guardrail = executing.transition(TaskStatus::GuardrailCheck).unwrap();
    let revision = guardrail.transition(TaskStatus::NeedsRevision).unwrap();

    assert_eq!(revision.status, TaskStatus::NeedsRevision);
    assert!(revision.transition(TaskStatus::Completed).is_err());
    assert!(revision.transition(TaskStatus::Executing).is_ok());
}