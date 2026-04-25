import { DiffPreview } from './DiffPreview';
import { ProjectSettings } from './ProjectSettings';
import { TerminalReplay } from './TerminalReplay';
import { formatTaskStatus, type HarnessConfig, type ProjectSummary, type TaskLogEntry, type TaskSummary } from '../lib/types';

type TaskDetailsPanelProps = {
  task: TaskSummary | null;
  logs: TaskLogEntry[];
  activePanel: 'details' | 'settings';
  project: ProjectSummary | null;
  settings: HarnessConfig | null;
  totalActiveTaskCount: number;
  awaitingAcceptanceCount: number;
  promptCount: number;
  onSelectPanel: (panel: 'details' | 'settings') => void;
  onSaveSettings: (config: HarnessConfig) => Promise<void>;
  onStartTask: () => Promise<void>;
  onRetryTask: () => Promise<void>;
  onApproveTask: () => Promise<void>;
  onRejectTask: () => Promise<void>;
};

export function TaskDetailsPanel({
  task,
  logs,
  activePanel,
  project,
  settings,
  totalActiveTaskCount,
  awaitingAcceptanceCount,
  promptCount,
  onSelectPanel,
  onSaveSettings,
  onStartTask,
  onRetryTask,
  onApproveTask,
  onRejectTask,
}: TaskDetailsPanelProps) {
  const canStart = task?.status === 'PENDING';
  const canRetry = task?.status === 'FAILED';
  const canApprove = task?.status === 'AWAITING_ACCEPTANCE';
  const canReject = task?.status === 'AWAITING_ACCEPTANCE';
  const focusSummary = task
    ? formatTaskStatus(task.status)
    : 'Select a task from the board to inspect execution, review readiness, and terminal replay.';
  const nextAction = task
    ? task.status === 'PENDING'
      ? 'Start execution'
      : task.status === 'FAILED'
        ? 'Retry or inspect the error'
        : task.status === 'AWAITING_ACCEPTANCE'
          ? 'Approve or reject after review'
          : 'Monitor progress in this inspector'
    : 'Pick a task';

  return (
    <aside className="panel details-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Inspector rail</p>
          <h2>AI Insights</h2>
          <p className="panel-copy">Selected task context, workflow posture, and review readiness live here.</p>
        </div>
      </div>

      <div className="insight-grid">
        <div className="metric-tile insight-card insight-card--wide">
          <span className="metric-label">Current focus</span>
          <strong>{task?.title ?? 'No task selected'}</strong>
          <p>{project?.name ?? 'Choose a task from the board to inspect its flow.'}</p>
        </div>
        <div className="metric-tile insight-card">
          <span className="metric-label">Workflow state</span>
          <strong>{task ? formatTaskStatus(task.status) : totalActiveTaskCount}</strong>
          <p>{focusSummary}</p>
        </div>
        <div className="metric-tile insight-card">
          <span className="metric-label">Next move</span>
          <strong>{nextAction}</strong>
          <p>{awaitingAcceptanceCount} tasks currently sit in human acceptance.</p>
        </div>
        <div className="metric-tile insight-card">
          <span className="metric-label">Queued prompts</span>
          <strong>{promptCount}</strong>
          <p>{promptCount === 0 ? 'No operator prompts are waiting.' : 'User input is needed to unblock active work.'}</p>
        </div>
      </div>

      <div className="panel-heading panel-heading--inline details-panel__tabs">
        <div>
          <p className="eyebrow">Inspector mode</p>
          <h3 className="details-panel__subheading">{task?.title ?? 'Select a task'}</h3>
        </div>
        <div className="segmented-control" role="tablist" aria-label="Task panels">
          <button
            className={activePanel === 'details' ? 'segmented-control__button segmented-control__button--active' : 'segmented-control__button'}
            onClick={() => onSelectPanel('details')}
            type="button"
          >
            Details
          </button>
          <button
            className={activePanel === 'settings' ? 'segmented-control__button segmented-control__button--active' : 'segmented-control__button'}
            onClick={() => onSelectPanel('settings')}
            type="button"
          >
            Settings
          </button>
        </div>
      </div>

      {activePanel === 'details' ? (
        task ? (
          <div className="details-stack">
            <div className="action-row">
              <button className="primary-button" disabled={!canStart} onClick={() => void onStartTask()} type="button">
                Start
              </button>
              <button className="ghost-button" disabled={!canRetry} onClick={() => void onRetryTask()} type="button">
                Retry
              </button>
              <button className="ghost-button" disabled={!canReject} onClick={() => void onRejectTask()} type="button">
                Reject
              </button>
              <button className="ghost-button" disabled={!canApprove} onClick={() => void onApproveTask()} type="button">
                Approve
              </button>
            </div>
            <div className="detail-grid">
              <div className="detail-block">
                <span className="detail-label">Project</span>
                <p>{project?.name ?? task.projectId}</p>
              </div>
              <div className="detail-block">
                <span className="detail-label">Status</span>
                <p>{formatTaskStatus(task.status)}</p>
              </div>
              <div className="detail-block">
                <span className="detail-label">Base branch</span>
                <p>{task.baseBranch}</p>
              </div>
              <div className="detail-block">
                <span className="detail-label">Workspace branch</span>
                <p>{task.branchName}</p>
              </div>
              <div className="detail-block detail-block--wide">
                <span className="detail-label">Repository path</span>
                <p>{task.projectPath ?? project?.path ?? 'Waiting for repository metadata.'}</p>
              </div>
              <div className="detail-block detail-block--wide">
                <span className="detail-label">CLI</span>
                <code>{[task.cliCommand, ...task.cliArgs].join(' ')}</code>
              </div>
            </div>

            {task.workspacePath ? (
              <div className="detail-block detail-block--wide">
                <span className="detail-label">Workspace copy</span>
                <p>{task.workspacePath}</p>
              </div>
            ) : null}

            {task.pendingQuestion ? (
              <div className="detail-block detail-block--accent">
                <span className="detail-label">Pending question</span>
                <p>{task.pendingQuestion.q}</p>
              </div>
            ) : null}

            {task.latestError ? (
              <div className="detail-block detail-block--danger">
                <span className="detail-label">Latest error</span>
                <p>{task.latestError}</p>
              </div>
            ) : null}

            <div className="detail-block">
              <span className="detail-label">Review</span>
              <p>{task.review ?? 'AI review output will appear here after guardrails pass.'}</p>
            </div>

            <div className="detail-block">
              <span className="detail-label">Guardrail report</span>
              <p>{task.latestGuardrailReport ?? 'Guardrail output will appear here after the task runs.'}</p>
            </div>

            <div className="detail-block">
              <span className="detail-label">Diff</span>
              <DiffPreview diff={task.diff} />
            </div>

            <div className="detail-block">
              <span className="detail-label">Replay</span>
              <TerminalReplay logs={logs} />
            </div>
          </div>
        ) : (
          <p className="empty-state">Pick a task to inspect its diff, logs, and review state.</p>
        )
      ) : (
        <div className="details-stack">
          <ProjectSettings onSave={onSaveSettings} project={project} settings={settings} />
        </div>
      )}
    </aside>
  );
}