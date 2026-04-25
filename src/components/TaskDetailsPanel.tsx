import { DiffPreview } from './DiffPreview';
import { ProjectSettings } from './ProjectSettings';
import { TerminalReplay } from './TerminalReplay';
import { type HarnessConfig, type ProjectSummary, type TaskLogEntry, type TaskSummary } from '../lib/types';

type TaskDetailsPanelProps = {
  task: TaskSummary | null;
  logs: TaskLogEntry[];
  activePanel: 'details' | 'settings';
  project: ProjectSummary | null;
  settings: HarnessConfig | null;
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
  onSelectPanel,
  onSaveSettings,
  onStartTask,
  onRetryTask,
  onApproveTask,
  onRejectTask,
}: TaskDetailsPanelProps) {
  return (
    <aside className="panel details-panel">
      <div className="panel-heading panel-heading--inline">
        <div>
          <p className="eyebrow">Inspector</p>
          <h2>{task?.title ?? 'Select a task'}</h2>
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
              <button className="primary-button" onClick={() => void onStartTask()} type="button">
                Start
              </button>
              <button className="ghost-button" onClick={() => void onRetryTask()} type="button">
                Retry
              </button>
              <button className="ghost-button" onClick={() => void onRejectTask()} type="button">
                Reject
              </button>
              <button className="ghost-button" onClick={() => void onApproveTask()} type="button">
                Approve
              </button>
            </div>
            <div className="detail-block">
              <span className="detail-label">CLI</span>
              <code>{[task.cliCommand, ...task.cliArgs].join(' ')}</code>
            </div>
            <div className="detail-block">
              <span className="detail-label">Latest status</span>
              <p>{task.status.replaceAll('_', ' ')}</p>
            </div>
            <div className="detail-block">
              <span className="detail-label">Review</span>
              <p>{task.review ?? 'AI review output will appear here after guardrails pass.'}</p>
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