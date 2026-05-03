import { useEffect, useMemo, useState } from 'react';
import { Badge, Empty, Tabs } from 'antd';
import {
  AlertTriangle,
  Check,
  FileCode2,
  Play,
  RotateCcw,
  TerminalSquare,
  X,
  XCircle,
} from 'lucide-react';
import { DiffPreview } from './DiffPreview';
import { ProjectSettings } from './ProjectSettings';
import { TerminalReplay } from './TerminalReplay';
import { parseUnifiedDiff } from '../lib/diff';
import {
  formatTaskStatus,
  type HarnessConfig,
  type ProjectSummary,
  type TaskLogEntry,
  type TaskSummary,
} from '../lib/types';
import type { DetailTab, ThemeMode } from '../store/useAppStore';

type TaskDetailsPanelProps = {
  open: boolean;
  task: TaskSummary | null;
  logs: TaskLogEntry[];
  activePanel: DetailTab;
  project: ProjectSummary | null;
  settings: HarnessConfig | null;
  theme: ThemeMode;
  onClose: () => void;
  onSelectPanel: (panel: DetailTab) => void;
  onOpenDiff: () => void;
  onSaveSettings: (config: HarnessConfig) => Promise<void>;
  onStartTask: () => Promise<void>;
  onRetryTask: () => Promise<void>;
  onApproveTask: () => Promise<void>;
  onRejectTask: (feedback: string) => Promise<void>;
};

function getStatusColor(status: TaskSummary['status'] | undefined): string {
  switch (status) {
    case 'PENDING':
      return 'var(--color-todo)';
    case 'EXECUTING':
    case 'GUARDRAIL_CHECK':
      return 'var(--color-in-progress)';
    case 'WAITING_FOR_INPUT':
    case 'NEEDS_REVISION':
      return 'var(--color-waiting)';
    case 'AI_REVIEW':
    case 'AWAITING_ACCEPTANCE':
      return 'var(--color-review)';
    case 'COMPLETED':
      return 'var(--color-done)';
    case 'BLOCKED':
    case 'FAILED':
      return 'var(--color-failed)';
    default:
      return 'var(--color-primary)';
  }
}

function formatMetaDate(value: string | undefined): string {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatRevisionLabel(attempt: number): string {
  return `Revision ${attempt}`;
}

export function TaskDetailsPanel({
  open,
  task,
  logs,
  activePanel,
  project,
  settings,
  theme,
  onClose,
  onSelectPanel,
  onOpenDiff,
  onSaveSettings,
  onStartTask,
  onRetryTask,
  onApproveTask,
  onRejectTask,
}: TaskDetailsPanelProps) {
  const files = useMemo(() => parseUnifiedDiff(task?.diff), [task?.diff]);
  const revisionHistory = useMemo(
    () =>
      task?.feedbackHistory.map((entry, index) => ({
        id: `${task.id}-revision-${index + 1}`,
        label: formatRevisionLabel(index + 1),
        message: entry,
      })) ?? [],
    [task?.feedbackHistory, task?.id],
  );
  const [selectedFileId, setSelectedFileId] = useState<string | null>(files[0]?.id ?? null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('Please revise the implementation and address the acceptance notes.');
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0] ?? null;
  const canStart = task?.status === 'PENDING';
  const canRetry = task?.status === 'FAILED';
  const canApprove = task?.status === 'AWAITING_ACCEPTANCE';
  const canReject = task?.status === 'AWAITING_ACCEPTANCE';
  const statusColor = getStatusColor(task?.status);
  const reviewSectionClassName = task?.status === 'AWAITING_ACCEPTANCE' ? 'detail-section detail-section--review' : 'detail-section';
  const guardrailSectionClassName = task && ['NEEDS_REVISION', 'BLOCKED'].includes(task.status)
    ? 'detail-section detail-section--warning'
    : 'detail-section';

  useEffect(() => {
    setSelectedFileId(files[0]?.id ?? null);
  }, [files]);

  useEffect(() => {
    setRejecting(false);
  }, [task?.id]);

  return (
    <aside className={open ? 'detail-panel detail-panel--open' : 'detail-panel'}>
      <div className="detail-panel__surface">
        <header className="detail-panel__header">
          <div className="detail-panel__headline">
            <span className="section-kicker">Task Details</span>
            <h2>{task?.title ?? project?.name ?? 'Inspector'}</h2>
            <div className="detail-panel__status-row">
              <Badge color={statusColor} />
              <span>{task ? formatTaskStatus(task.status) : open ? 'Project context' : 'Closed'}</span>
            </div>
          </div>

          <button className="icon-button" onClick={onClose} type="button" aria-label="Close details panel">
            <X size={16} />
          </button>
        </header>

        <Tabs
          activeKey={activePanel}
          className="detail-tabs"
          items={[
            { key: 'overview', label: 'Overview' },
            { key: 'terminal', label: 'Terminal' },
            { key: 'changes', label: 'Changes' },
            { key: 'settings', label: 'Settings' },
          ]}
          onChange={(key) => onSelectPanel(key as DetailTab)}
        />

        <div className="detail-panel__content">
          {activePanel === 'overview' ? (
            task ? (
              <div className="detail-stack">
                <div className="meta-grid">
                  <div className="meta-card">
                    <span>Status</span>
                    <strong>{formatTaskStatus(task.status)}</strong>
                  </div>
                  <div className="meta-card">
                    <span>Project</span>
                    <strong>{project?.name ?? task.projectId}</strong>
                  </div>
                  <div className="meta-card">
                    <span>Created</span>
                    <strong>{formatMetaDate(task.createdAt)}</strong>
                  </div>
                  <div className="meta-card">
                    <span>Updated</span>
                    <strong>{formatMetaDate(task.updatedAt)}</strong>
                  </div>
                </div>

                <div className="detail-section">
                  <span className="detail-label">Description</span>
                  <p>{task.description}</p>
                </div>

                <div className="detail-grid">
                  <div className="detail-block">
                    <span className="detail-label">Base branch</span>
                    <p>{task.baseBranch}</p>
                  </div>
                  <div className="detail-block">
                    <span className="detail-label">Workspace branch</span>
                    <p>{task.branchName}</p>
                  </div>
                  <div className="detail-block detail-block--wide">
                    <span className="detail-label">CLI</span>
                    <code>{[task.cliCommand, ...task.cliArgs].join(' ')}</code>
                  </div>
                  <div className="detail-block detail-block--wide">
                    <span className="detail-label">Workspace path</span>
                    <p>{task.workspacePath ?? task.projectPath ?? project?.path ?? 'Pending runtime assignment.'}</p>
                  </div>
                </div>

                {task.pendingQuestion ? (
                  <div className="detail-callout detail-callout--warning">
                    <div className="detail-callout__icon">
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <strong>Waiting for operator input</strong>
                      <p>{task.pendingQuestion.q}</p>
                    </div>
                  </div>
                ) : null}

                {task.latestError ? (
                  <div className="detail-callout detail-callout--danger">
                    <div className="detail-callout__icon">
                      <XCircle size={16} />
                    </div>
                    <div>
                      <strong>Latest error</strong>
                      <p>{task.latestError}</p>
                    </div>
                  </div>
                ) : null}

                <div className={reviewSectionClassName}>
                  <div className="detail-section__header">
                    <span className="detail-label">AI Review</span>
                    {task.review ? <strong>Ready for operator review</strong> : null}
                  </div>
                  {task.review ? (
                    <pre className="detail-preformatted">{task.review}</pre>
                  ) : (
                    <p className="detail-placeholder">AI review output will appear here after the run finishes.</p>
                  )}
                </div>

                {(task.latestGuardrailReport || task.status === 'NEEDS_REVISION' || task.status === 'BLOCKED') ? (
                  <div className={guardrailSectionClassName}>
                    <div className="detail-section__header">
                      <span className="detail-label">Guardrail report</span>
                      {task.latestGuardrailReport ? <strong>Most recent feedback</strong> : null}
                    </div>
                    {task.latestGuardrailReport ? (
                      <pre className="detail-preformatted">{task.latestGuardrailReport}</pre>
                    ) : (
                      <p className="detail-placeholder">No guardrail report yet.</p>
                    )}
                  </div>
                ) : null}

                {revisionHistory.length > 0 ? (
                  <div className="detail-section detail-section--history">
                    <div className="detail-section__header">
                      <span className="detail-label">Revision History</span>
                      <strong>{revisionHistory.length} rounds</strong>
                    </div>
                    <ol className="revision-list">
                      {revisionHistory.map((revision) => (
                        <li key={revision.id} className="revision-item">
                          <div className="revision-item__header">
                            <strong>{revision.label}</strong>
                          </div>
                          <pre className="detail-preformatted">{revision.message}</pre>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="detail-empty">
                <Empty description="Select a task to inspect metadata and review context." image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )
          ) : null}

          {activePanel === 'terminal' ? (
            task ? (
              <div className="detail-stack detail-stack--fill">
                <div className="terminal-toolbar">
                  <span>
                    <TerminalSquare size={14} />
                    <span>Live terminal replay</span>
                  </span>
                  <strong>{logs.length} lines</strong>
                </div>
                <TerminalReplay logs={logs} theme={theme} />
              </div>
            ) : (
              <div className="detail-empty">
                <Empty description="Select a task to view terminal output." image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )
          ) : null}

          {activePanel === 'changes' ? (
            task ? (
              <div className="detail-stack detail-stack--fill">
                <div className="changes-toolbar">
                  <div>
                    <span className="detail-label">Changed files</span>
                    <strong>{files.length}</strong>
                  </div>
                  <button className="primary-button" onClick={onOpenDiff} type="button" disabled={files.length === 0}>
                    View Diff
                  </button>
                </div>

                {files.length === 0 ? (
                  <div className="detail-empty">
                    <Empty description="No captured diff yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </div>
                ) : (
                  <>
                    <div className="change-list">
                      {files.map((file) => (
                        <button
                          key={file.id}
                          className={selectedFile?.id === file.id ? 'change-item change-item--active' : 'change-item'}
                          onClick={() => setSelectedFileId(file.id)}
                          type="button"
                        >
                          <div className="change-item__path">
                            <FileCode2 size={14} />
                            <span>{file.displayPath}</span>
                          </div>
                          <div className="change-item__stats">
                            <span className="change-item__add">+{file.additions}</span>
                            <span className="change-item__remove">-{file.deletions}</span>
                          </div>
                        </button>
                      ))}
                    </div>

                    <DiffPreview file={selectedFile} theme={theme} />
                  </>
                )}
              </div>
            ) : (
              <div className="detail-empty">
                <Empty description="Select a task to inspect file changes." image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )
          ) : null}

          {activePanel === 'settings' ? (
            <div className="detail-stack">
              <ProjectSettings onSave={onSaveSettings} project={project} settings={settings} />
            </div>
          ) : null}
        </div>

        {task ? (
          <footer className="detail-panel__footer">
            {rejecting ? (
              <div className="inline-review-form">
                <textarea onChange={(event) => setRejectFeedback(event.target.value)} rows={3} value={rejectFeedback} />
                <div className="inline-review-form__actions">
                  <button className="secondary-button" onClick={() => setRejecting(false)} type="button">
                    Cancel
                  </button>
                  <button
                    className="danger-button"
                    disabled={!rejectFeedback.trim()}
                    onClick={() => {
                      void onRejectTask(rejectFeedback).then(() => setRejecting(false));
                    }}
                    type="button"
                  >
                    Submit Reject
                  </button>
                </div>
              </div>
            ) : null}

            <div className="detail-panel__actions">
              <button className="secondary-button" disabled={!canStart} onClick={() => void onStartTask()} type="button">
                <Play size={14} />
                <span>Start</span>
              </button>
              <button className="secondary-button" disabled={!canRetry} onClick={() => void onRetryTask()} type="button">
                <RotateCcw size={14} />
                <span>Retry</span>
              </button>
              <button className="secondary-button" disabled={!canReject} onClick={() => setRejecting(true)} type="button">
                <X size={14} />
                <span>Reject</span>
              </button>
              <button className="primary-button" disabled={!canApprove} onClick={() => void onApproveTask()} type="button">
                <Check size={14} />
                <span>Approve</span>
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </aside>
  );
}
