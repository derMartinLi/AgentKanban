import { formatTaskStatus, type TaskStatus, type TaskSummary } from '../lib/types';

type TaskBoardProps = {
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  showProjectName: boolean;
  projectNameById: Record<string, string>;
};

const BOARD_LANES: Array<{
  id: string;
  title: string;
  accent: string;
  statuses: TaskStatus[];
  emptyLabel: string;
}> = [
  {
    id: 'backlog',
    title: 'Backlog',
    accent: 'lane-accent--mint',
    statuses: ['PENDING'],
    emptyLabel: 'Waiting for dispatch',
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    accent: 'lane-accent--cyan',
    statuses: ['EXECUTING', 'WAITING_FOR_INPUT', 'GUARDRAIL_CHECK'],
    emptyLabel: 'No live execution',
  },
  {
    id: 'review',
    title: 'Code Review',
    accent: 'lane-accent--green',
    statuses: ['AI_REVIEW', 'AWAITING_ACCEPTANCE'],
    emptyLabel: 'Review queue is clear',
  },
  {
    id: 'attention',
    title: 'Needs Attention',
    accent: 'lane-accent--amber',
    statuses: ['NEEDS_REVISION', 'BLOCKED', 'FAILED'],
    emptyLabel: 'No operator escalations',
  },
  {
    id: 'done',
    title: 'Done',
    accent: 'lane-accent--blue',
    statuses: ['COMPLETED'],
    emptyLabel: 'No completed runs yet',
  },
];

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recent';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTicketSignal(task: TaskSummary): string {
  if (task.pendingQuestion) {
    return 'Needs input';
  }

  if (task.latestError) {
    return 'Error';
  }

  if (task.revisionCount > 0) {
    return `${task.revisionCount} revision${task.revisionCount > 1 ? 's' : ''}`;
  }

  return formatTaskStatus(task.status);
}

export function TaskBoard({ tasks, selectedTaskId, onSelectTask, showProjectName, projectNameById }: TaskBoardProps) {
  return (
    <section className="kanban-stage">
      <div className="kanban-grid">
        {BOARD_LANES.map((lane) => {
          const laneTasks = tasks.filter((task) => lane.statuses.includes(task.status));

          return (
            <div key={lane.id} className="kanban-column">
              <div className="kanban-column__header">
                <div className={`kanban-column__accent ${lane.accent}`} />
                <div>
                  <p className="eyebrow">Execution Lane</p>
                  <h3>{lane.title}</h3>
                </div>
                <span className="lane-count">{laneTasks.length}</span>
              </div>

              <div className="kanban-column__body">
                {laneTasks.length === 0 ? <p className="lane-empty">{lane.emptyLabel}</p> : null}

                {laneTasks.map((task) => (
                  <button
                    key={task.id}
                    className={selectedTaskId === task.id ? 'ticket ticket--active' : 'ticket'}
                    onClick={() => onSelectTask(task.id)}
                    type="button"
                  >
                    <div className="ticket__head">
                      <span className="ticket__id">{task.id}</span>
                      <span className="ticket__signal">{getTicketSignal(task)}</span>
                    </div>

                    <strong>{task.title}</strong>
                    <p className="ticket__description">{task.description}</p>

                    <div className="ticket__meta">
                      <span>{task.branchName}</span>
                      <span>{formatStamp(task.updatedAt)}</span>
                    </div>

                    <div className="ticket__footer">
                      <span className="ticket__branch">base {task.baseBranch}</span>
                      {showProjectName ? (
                        <span className="task-project-tag">{projectNameById[task.projectId] ?? task.projectId}</span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
