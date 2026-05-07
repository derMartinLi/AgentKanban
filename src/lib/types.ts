export const TASK_STATUS_ORDER = [
  'PENDING',
  'EXECUTING',
  'WAITING_FOR_INPUT',
  'GUARDRAIL_CHECK',
  'NEEDS_REVISION',
  'BLOCKED',
  'AI_REVIEW',
  'AWAITING_ACCEPTANCE',
  'FAILED',
  'COMPLETED',
] as const;

export type TaskStatus = (typeof TASK_STATUS_ORDER)[number];

export type ProjectSummary = {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  isLinked: boolean;
  remoteUrl?: string;
};

export type TaskTemplate = {
  id: string;
  title: string;
  description: string;
};

export type TaskQuestion = {
  taskId: string;
  q: string;
  opts: string[];
  allowFreeform?: boolean;
};

export type TaskLogEntry = {
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
};

export type HarnessConfig = {
  envVars: Record<string, string>;
  resourceFiles: string[];
  guardrailCommands: string[];
  maxConcurrency: number;
  maxRetries: number;
  reviewCommand: string;
  semgrepEnabled: boolean;
  semgrepConfig: string;
  questionTimeoutSecs: number;
};

export type TaskSummary = {
  id: string;
  projectId: string;
  projectPath?: string;
  title: string;
  description: string;
  status: TaskStatus;
  cliCommand: string;
  cliArgs: string[];
  envVars: Record<string, string>;
  feedbackHistory: string[];
  revisionCount: number;
  branchName: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
  review?: string;
  diff?: string;
  latestError?: string;
  workspacePath?: string;
  remoteBranch?: string;
  latestGuardrailReport?: string;
  pendingQuestion?: TaskQuestion | null;
};

export const EMPTY_HARNESS_CONFIG: HarnessConfig = {
  envVars: {},
  resourceFiles: [],
  guardrailCommands: ['pnpm lint', 'pnpm test'],
  maxConcurrency: 2,
  maxRetries: 2,
  reviewCommand: '',
  semgrepEnabled: false,
  semgrepConfig: 'auto',
  questionTimeoutSecs: 120,
};

export type CreateTaskInput = {
  projectId: string;
  projectPath?: string;
  baseBranch: string;
  description: string;
  cliCommand: string;
  cliArgs: string[];
  envVars: Record<string, string>;
};

export const BOARD_COLUMNS = [
  {
    id: 'todo',
    title: 'To Do',
    statuses: ['PENDING'] as TaskStatus[],
  },
  {
    id: 'running',
    title: 'In Progress',
    statuses: ['EXECUTING', 'WAITING_FOR_INPUT', 'GUARDRAIL_CHECK', 'NEEDS_REVISION', 'BLOCKED', 'FAILED'] as TaskStatus[],
  },
  {
    id: 'review',
    title: 'Review / Done',
    statuses: ['AI_REVIEW', 'AWAITING_ACCEPTANCE', 'COMPLETED'] as TaskStatus[],
  },
] as const;

const TERMINAL_STATUSES = new Set<TaskStatus>(['FAILED', 'COMPLETED', 'BLOCKED']);

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function formatTaskStatus(status: string): string {
  return status.replaceAll('_', ' ');
}

export function createTaskTitle(description: string): string {
  const collapsed = description.trim().replace(/\s+/g, ' ');
  if (!collapsed) {
    return 'Untitled task';
  }

  return collapsed.length > 60 ? `${collapsed.slice(0, 57)}...` : collapsed;
}