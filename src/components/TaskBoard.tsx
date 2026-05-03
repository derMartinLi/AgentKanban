import { Bot, Clock3, Plus } from 'lucide-react';
import { Empty } from 'antd';
import { BOARD_COLUMNS, formatTaskStatus, type TaskStatus, type TaskSummary } from '../lib/types';

type TaskBoardProps = {
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onCreateTask: () => void;
  showProjectName: boolean;
  projectNameById: Record<string, string>;
};

function getStatusTone(status: TaskStatus): string {
  switch (status) {
    case 'PENDING':
      return 'var(--color-todo)';
    case 'EXECUTING':
    case 'GUARDRAIL_CHECK':
      return 'var(--color-in-progress)';
    case 'WAITING_FOR_INPUT':
      return 'var(--color-waiting)';
    case 'AI_REVIEW':
    case 'AWAITING_ACCEPTANCE':
      return 'var(--color-review)';
    case 'COMPLETED':
      return 'var(--color-done)';
    case 'FAILED':
    case 'BLOCKED':
      return 'var(--color-failed)';
    case 'NEEDS_REVISION':
      return 'var(--color-waiting)';
    default:
      return 'var(--color-primary)';
  }
}

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return '--';
  }

  const seconds = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getCliBadge(task: TaskSummary): string {
  return task.cliCommand.split(/[\\/]/).at(-1) || task.cliCommand;
}

export function TaskBoard({
  tasks,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  showProjectName,
  projectNameById,
}: TaskBoardProps) {
  return (
    <section className="task-board">
      <div className="task-board__header">
        <div>
          <span className="section-kicker">Task Board</span>
          <h2>Execution Flow</h2>
        </div>

        <button className="primary-button" onClick={onCreateTask} type="button">
          <Plus size={16} />
          <span>New Task</span>
        </button>
      </div>

      <div className="task-board__grid">
        {BOARD_COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => column.statuses.includes(task.status));

          return (
            <section key={column.id} className="task-column">
              <header className="task-column__header">
                <div>
                  <h3>{column.title}</h3>
                </div>
                <span className="count-badge">{columnTasks.length}</span>
              </header>

              <div className="task-column__body">
                {columnTasks.length === 0 ? (
                  <div className="task-column__empty">
                    <Empty description="No tasks" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </div>
                ) : null}

                {columnTasks.map((task) => {
                  const tone = getStatusTone(task.status);

                  return (
                    <button
                      key={task.id}
                      className={selectedTaskId === task.id ? 'task-card task-card--active' : 'task-card'}
                      onClick={() => onSelectTask(task.id)}
                      style={{ ['--task-tone' as string]: tone }}
                      type="button"
                    >
                      <div className="task-card__status" />

                      <div className="task-card__body">
                        <div className="task-card__topline">
                          <span className="task-card__state">{formatTaskStatus(task.status)}</span>
                          <span className="task-card__stamp">{formatStamp(task.updatedAt)}</span>
                        </div>

                        <strong>{task.title}</strong>
                        <p>{task.description}</p>

                        {showProjectName ? (
                          <span className="task-card__project">{projectNameById[task.projectId] ?? task.projectId}</span>
                        ) : null}

                        <div className="task-card__meta">
                          <span>{task.branchName}</span>
                          <span>{task.baseBranch}</span>
                        </div>

                        <div className="task-card__footer">
                          <span className="task-card__tool">
                            <Bot size={14} />
                            <span>{getCliBadge(task)}</span>
                          </span>
                          <span className="task-card__tool">
                            <Clock3 size={14} />
                            <span>{formatDuration(task.createdAt, task.updatedAt)}</span>
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
