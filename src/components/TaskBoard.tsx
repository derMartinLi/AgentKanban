import { BOARD_COLUMNS, formatTaskStatus, type TaskSummary } from '../lib/types';

type TaskBoardProps = {
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  showProjectName: boolean;
  projectNameById: Record<string, string>;
};

export function TaskBoard({ tasks, selectedTaskId, onSelectTask, showProjectName, projectNameById }: TaskBoardProps) {
  return (
    <section className="board-grid">
      {BOARD_COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => column.statuses.includes(task.status));

        return (
          <div key={column.id} className="panel board-column">
            <div className="panel-heading panel-heading--inline board-column__heading">
              <div>
                <p className="eyebrow">Execution lane</p>
                <h2>{column.title}</h2>
                <p className="panel-copy">{columnTasks.length === 0 ? 'No active cards in this lane yet.' : 'Work items currently flowing through this stage.'}</p>
              </div>
              <span className="count-pill">{columnTasks.length}</span>
            </div>

            <div className="task-stack">
              {columnTasks.length === 0 ? <p className="empty-state">No tasks in this lane.</p> : null}
              {columnTasks.map((task) => (
                <button
                  key={task.id}
                  className={selectedTaskId === task.id ? 'task-card task-card--active' : 'task-card'}
                  onClick={() => onSelectTask(task.id)}
                  type="button"
                >
                  <div className="task-card__meta-row">
                    <span className="task-status">{formatTaskStatus(task.status)}</span>
                    {showProjectName ? <span className="task-project-tag">{projectNameById[task.projectId] ?? task.projectId}</span> : null}
                  </div>
                  <strong>{task.title}</strong>
                  <p className="task-card__description">{task.description}</p>
                  <div className="task-card__footer">
                    <small className="task-card__footnote">{task.branchName} from {task.baseBranch}</small>
                    {task.pendingQuestion ? <span className="branch-badge">Needs input</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}