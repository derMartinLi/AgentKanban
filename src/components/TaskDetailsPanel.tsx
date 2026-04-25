import { DiffPreview } from './DiffPreview';
import { ProjectSettings } from './ProjectSettings';
import { TerminalReplay } from './TerminalReplay';
import {
  formatTaskStatus,
  type HarnessConfig,
  type ProjectSummary,
  type TaskLogEntry,
  type TaskSummary,
} from '../lib/types';

type TaskDetailsPanelProps = {
  task: TaskSummary | null;
  logs: TaskLogEntry[];
  activePanel: 'details' | 'settings';
  project: ProjectSummary | null;
  settings: HarnessConfig | null;
  totalActiveTaskCount: number;
  totalTaskCount: number;
  awaitingAcceptanceCount: number;
  promptCount: number;
  taskStatusCounts: Record<string, number>;
  onSelectPanel: (panel: 'details' | 'settings') => void;
  onSaveSettings: (config: HarnessConfig) => Promise<void>;
  onStartTask: () => Promise<void>;
  onRetryTask: () => Promise<void>;
  onApproveTask: () => Promise<void>;
  onRejectTask: () => Promise<void>;
};

const STATUS_PROGRESS: Record<string, number> = {
  PENDING: 12,
  EXECUTING: 34,
  WAITING_FOR_INPUT: 48,
  GUARDRAIL_CHECK: 62,
  NEEDS_REVISION: 38,
  BLOCKED: 20,
  AI_REVIEW: 74,
  AWAITING_ACCEPTANCE: 88,
  FAILED: 14,
  COMPLETED: 100,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildSparkline(values: number[]): string {
  const width = 240;
  const height = 96;

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (value / 100) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');
}

function summarizeCopilotMessage(task: TaskSummary | null, project: ProjectSummary | null): string {
  if (!task) {
    return 'Select a task to surface branch context, guardrail posture, and operator handoff guidance.';
  }

  if (task.latestError) {
    return `Execution flagged an error in ${project?.name ?? task.projectId}. Inspect logs before retrying.`;
  }

  if (task.pendingQuestion) {
    return `Agent execution is paused pending operator input for ${task.title}.`;
  }

  if (task.status === 'AWAITING_ACCEPTANCE') {
    return `Implementation is staged for human acceptance on ${task.branchName}.`;
  }

  return `${task.title} is currently in ${formatTaskStatus(task.status).toLowerCase()} on ${task.branchName}.`;
}

function createHealthSeries(
  task: TaskSummary | null,
  totalActiveTaskCount: number,
  totalTaskCount: number,
  awaitingAcceptanceCount: number,
  promptCount: number,
  taskStatusCounts: Record<string, number>,
): number[] {
  const pending = taskStatusCounts.PENDING ?? 0;
  const blocked = (taskStatusCounts.BLOCKED ?? 0) + (taskStatusCounts.FAILED ?? 0);
  const review = (taskStatusCounts.AI_REVIEW ?? 0) + (taskStatusCounts.AWAITING_ACCEPTANCE ?? 0);
  const done = taskStatusCounts.COMPLETED ?? 0;
  const selected = task ? STATUS_PROGRESS[task.status] ?? 42 : 38;
  const total = Math.max(totalTaskCount, 1);

  return [
    clamp(12 + pending * 12, 10, 96),
    clamp(22 + (totalActiveTaskCount / total) * 100, 18, 96),
    clamp(28 + promptCount * 14, 20, 96),
    clamp(34 + review * 12 + selected * 0.2, 24, 98),
    clamp(20 + awaitingAcceptanceCount * 15 + done * 10 - blocked * 4, 16, 100),
  ];
}

export function TaskDetailsPanel({
  task,
  logs,
  activePanel,
  project,
  settings,
  totalActiveTaskCount,
  totalTaskCount,
  awaitingAcceptanceCount,
  promptCount,
  taskStatusCounts,
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
  const workflowState = task ? formatTaskStatus(task.status) : 'No task selected';
  const focusSummary = task
    ? formatTaskStatus(task.status)
    : 'Select a task from the board to inspect execution, review readiness, and terminal replay.';
  const healthSeries = createHealthSeries(
    task,
    totalActiveTaskCount,
    totalTaskCount,
    awaitingAcceptanceCount,
    promptCount,
    taskStatusCounts,
  );
  const sparklinePoints = buildSparkline(healthSeries);
  const resourceMeters = [
    {
      label: 'Execution load',
      value: clamp(Math.round((totalActiveTaskCount / Math.max(totalTaskCount || 1, 1)) * 100), 8, 100),
    },
    {
      label: 'Acceptance',
      value: clamp(Math.round((awaitingAcceptanceCount / Math.max(totalTaskCount || 1, 1)) * 100), 0, 100),
    },
    {
      label: 'Prompt pressure',
      value: clamp(Math.round((promptCount / Math.max(totalTaskCount || 1, 1)) * 100), 0, 100),
    },
  ];
  const bottleneckBars = [
    { label: 'Input', value: promptCount, tone: 'alert-bar--mint' },
    { label: 'Review', value: awaitingAcceptanceCount, tone: 'alert-bar--cyan' },
    { label: 'Block', value: (taskStatusCounts.BLOCKED ?? 0) + (taskStatusCounts.FAILED ?? 0), tone: 'alert-bar--red' },
    { label: 'Done', value: taskStatusCounts.COMPLETED ?? 0, tone: 'alert-bar--blue' },
  ];

  return (
    <aside className="insights-rail">
      <section className="insights-panel copilot-panel">
        <div className="insights-panel__header">
          <div>
            <p className="eyebrow">AI Copilot</p>
            <h2>AI Insights</h2>
          </div>
          <span className="rail-close">×</span>
        </div>

        <div className="copilot-feed">
          <div className="copilot-message copilot-message--primary">
            <p>{summarizeCopilotMessage(task, project)}</p>
          </div>
          <div className="copilot-message">
            <p>
              {task?.pendingQuestion?.q ??
                (task?.review
                  ? task.review
                  : 'Use the inspector below to start queued work, inspect diffs, or switch into project settings.')}
            </p>
          </div>
          <div className="copilot-input-shell">
            <span>{task?.pendingQuestion ? 'Answer pending in modal prompt' : 'Focus a task to unlock guided actions'}</span>
          </div>
        </div>
      </section>

      <section className="insights-panel system-panel">
        <div className="insights-panel__header">
          <div>
            <p className="eyebrow">System Health</p>
            <h2>System Health &amp; Risks</h2>
          </div>
          <span className="lane-count">{totalTaskCount}</span>
        </div>

        <div className="system-panel__section">
          <div className="system-panel__row">
            <span className="detail-label">Project Progress</span>
            <strong>{task ? workflowState : `${totalActiveTaskCount} active`}</strong>
          </div>
          <svg className="sparkline" viewBox="0 0 240 96" preserveAspectRatio="none" aria-hidden="true">
            <path className="sparkline__grid" d="M0 18 H240 M0 48 H240 M0 78 H240" />
            <polyline className="sparkline__line" fill="none" points={sparklinePoints} />
          </svg>
        </div>

        <div className="system-panel__section">
          <div className="system-panel__row">
            <span className="detail-label">Bottleneck Alerts</span>
            <strong>{promptCount + awaitingAcceptanceCount + (taskStatusCounts.BLOCKED ?? 0) + (taskStatusCounts.FAILED ?? 0)}</strong>
          </div>
          <div className="alert-bars">
            {bottleneckBars.map((bar) => (
              <div key={bar.label} className="alert-bars__item">
                <div className="alert-bars__track">
                  <div
                    className={`alert-bars__fill ${bar.tone}`}
                    style={{ height: `${Math.max(8, Math.min(bar.value * 18, 88))}%` }}
                  />
                </div>
                <span>{bar.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="system-panel__section">
          <div className="system-panel__row">
            <span className="detail-label">Resource Utilization</span>
            <strong>{totalTaskCount === 0 ? 'Idle' : `${totalTaskCount} tracked`}</strong>
          </div>
          <div className="resource-meter-list">
            {resourceMeters.map((meter) => (
              <div key={meter.label} className="resource-meter">
                <div className="resource-meter__label">
                  <span>{meter.label}</span>
                  <strong>{meter.value}%</strong>
                </div>
                <div className="resource-meter__track">
                  <div className="resource-meter__fill" style={{ width: `${meter.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="insights-panel inspector-panel">
        <div className="insights-panel__header">
          <div>
            <p className="eyebrow">Inspector Mode</p>
            <h2>{task?.title ?? 'Task Inspector'}</h2>
            <p className="panel-copy">{focusSummary}</p>
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
                  <p>{workflowState}</p>
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
      </section>
    </aside>
  );
}
