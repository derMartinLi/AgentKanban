use agentkanban_core::domain::{Task, TaskStatus};

fn make_test_task(id: &str) -> Task {
    Task::new(
        id.into(),
        "project-alpha".into(),
        "Demo task".into(),
        "Demo task".into(),
        "codex".into(),
        vec![],
        "main".into(),
    )
}

#[test]
fn allows_guardrail_revision_loop_but_rejects_invalid_completion() {
    let task = make_test_task("task-1");

    let executing = task.transition(TaskStatus::Executing).unwrap();
    let guardrail = executing.transition(TaskStatus::GuardrailCheck).unwrap();
    let revision = guardrail.transition(TaskStatus::NeedsRevision).unwrap();

    assert_eq!(revision.status, TaskStatus::NeedsRevision);
    assert!(revision.transition(TaskStatus::Completed).is_err());
    assert!(revision.transition(TaskStatus::Executing).is_ok());
}

// Phase 0.4 — state machine coverage for key transitions
// ----------------------------------------------------------------

#[test]
fn question_enters_waiting_for_input_and_recovers() {
    let task = make_test_task("task-q");
    let executing = task.transition(TaskStatus::Executing).unwrap();
    let waiting = executing.transition(TaskStatus::WaitingForInput).unwrap();

    assert_eq!(waiting.status, TaskStatus::WaitingForInput);
    assert!(
        waiting.transition(TaskStatus::Completed).is_err(),
        "can't complete while waiting for input"
    );
    assert!(
        waiting.transition(TaskStatus::Executing).is_ok(),
        "answering resumes execution"
    );
}

#[test]
fn guardrail_failure_to_needs_revision() {
    let task = make_test_task("task-g");
    let guardrail = task
        .transition(TaskStatus::Executing)
        .unwrap()
        .transition(TaskStatus::GuardrailCheck)
        .unwrap();
    let revision = guardrail.transition(TaskStatus::NeedsRevision).unwrap();

    assert_eq!(revision.status, TaskStatus::NeedsRevision);
    assert!(
        revision.transition(TaskStatus::Executing).is_ok(),
        "revision should loop back to executing"
    );
}

#[test]
fn guardrail_failure_can_block() {
    let task = make_test_task("task-gb");
    let guardrail = task
        .transition(TaskStatus::Executing)
        .unwrap()
        .transition(TaskStatus::GuardrailCheck)
        .unwrap();
    let blocked = guardrail.transition(TaskStatus::Blocked).unwrap();

    assert_eq!(blocked.status, TaskStatus::Blocked);
    assert!(blocked.status.is_terminal());
}

#[test]
fn ai_review_to_awaiting_acceptance_then_completed() {
    let task = make_test_task("task-r");
    let awaiting = task
        .transition(TaskStatus::Executing)
        .unwrap()
        .transition(TaskStatus::GuardrailCheck)
        .unwrap()
        .transition(TaskStatus::AiReview)
        .unwrap()
        .transition(TaskStatus::AwaitingAcceptance)
        .unwrap();

    assert_eq!(awaiting.status, TaskStatus::AwaitingAcceptance);
    assert!(awaiting.transition(TaskStatus::Completed).is_ok());
    assert!(awaiting.transition(TaskStatus::Failed).is_ok());
    assert!(
        awaiting.transition(TaskStatus::Pending).is_err(),
        "can't jump back to pending from awaiting"
    );
}

#[test]
fn failed_can_retry_via_pending_or_executing() {
    let task = make_test_task("task-f");
    let failed = task.transition(TaskStatus::Failed).unwrap();

    assert_eq!(failed.status, TaskStatus::Failed);
    assert!(failed.transition(TaskStatus::Pending).is_ok());
    // re-create fresh task for second path
    let failed2 = make_test_task("task-f2")
        .transition(TaskStatus::Failed)
        .unwrap();
    assert!(failed2.transition(TaskStatus::Executing).is_ok());
}

#[test]
fn blocked_is_terminal_but_can_retry() {
    let task = make_test_task("task-b");
    let blocked = task
        .transition(TaskStatus::Executing)
        .unwrap()
        .transition(TaskStatus::Blocked)
        .unwrap();

    assert!(blocked.status.is_terminal());
    assert_eq!(blocked.status, TaskStatus::Blocked);
    assert!(blocked.transition(TaskStatus::Executing).is_ok());
}

#[test]
fn pending_only_goes_to_executing_or_failed() {
    let task = make_test_task("task-p");
    assert!(task.transition(TaskStatus::Executing).is_ok());

    let task2 = make_test_task("task-p2");
    assert!(task2.transition(TaskStatus::Failed).is_ok());

    let task3 = make_test_task("task-p3");
    assert!(task3.transition(TaskStatus::Completed).is_err());
    assert!(task3.transition(TaskStatus::WaitingForInput).is_err());
}

#[test]
fn terminal_status_check() {
    assert!(TaskStatus::Completed.is_terminal());
    assert!(TaskStatus::Failed.is_terminal());
    assert!(TaskStatus::Blocked.is_terminal());
    assert!(!TaskStatus::Pending.is_terminal());
    assert!(!TaskStatus::Executing.is_terminal());
    assert!(!TaskStatus::AiReview.is_terminal());
    assert!(!TaskStatus::AwaitingAcceptance.is_terminal());
}
