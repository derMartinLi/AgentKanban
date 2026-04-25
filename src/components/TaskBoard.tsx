import { BOARD_COLUMNS, type TaskSummary } from '../lib/types';

type TaskBoardProps = {
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
};

export function TaskBoard({ tasks, selectedTaskId, onSelectTask }: TaskBoardProps) {
  return (
    <section className="board-grid">
      {BOARD_COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => column.statuses.includes(task.status));

        return (
          <div key={column.id} className="panel board-column">
            <div className="panel-heading panel-heading--inline">
              <div>
                <p className="eyebrow">Lane</p>
                <h2>{column.title}</h2>
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
                  <span className="task-status">{task.status.replaceAll('_', ' ')}</span>
                  <strong>{task.title}</strong>
                  <p>{task.description}</p>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}