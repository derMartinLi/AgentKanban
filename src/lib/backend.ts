import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { CreateTaskInput, HarnessConfig, ProjectSummary, TaskLogEntry, TaskSummary, TaskTemplate } from './types';

type TaskUpdatedPayload = {
  project_id: string;
  task: Record<string, unknown>;
};

type TaskLogPayload = {
  project_id: string;
  task_id: string;
  entry: Record<string, unknown>;
};

type HttpSuccessEnvelope<T> = {
  data?: T;
};

type HttpErrorEnvelope = {
  error?: {
    message?: unknown;
  };
};

const hasTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ---------------------------------------------------------------------------
// HTTP transport (Axum server mode)
// ---------------------------------------------------------------------------

let apiBaseUrl = '';
let wsBaseUrl = '';

function configureApiBase(): void {
  if (typeof window !== 'undefined') {
    // In production, API is served from the same origin (single binary)
    // In dev, Vite proxy handles it
    apiBaseUrl = '';
    wsBaseUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  }
}

function hasHttpRuntime(): boolean {
  // Running in a browser without Tauri — assume Axum server on same origin
  if (typeof window === 'undefined') return false;
  if (hasTauriRuntime()) return false;
  // Don't try HTTP transport in Vitest test environment
  try {
    if ((import.meta as any).env?.MODE === 'test') return false;
  } catch { /* ignore */ }
  return true;
}

function extractHttpErrorMessage(text: string): string | null {
  if (!text) {
    return null;
  }

  try {
    const body = JSON.parse(text) as HttpErrorEnvelope;
    return typeof body.error?.message === 'string' ? body.error.message : null;
  } catch {
    return null;
  }
}

async function throwHttpError(res: Response): Promise<never> {
  const text = await res.text();
  throw new Error(extractHttpErrorMessage(text) ?? (text || `HTTP ${res.status}`));
}

async function unwrapHttpEnvelope<T>(res: Response): Promise<T> {
  const body = await res.json() as HttpSuccessEnvelope<T>;
  return (body.data ?? body) as T;
}

async function httpGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${apiBaseUrl}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    return throwHttpError(res);
  }
  return unwrapHttpEnvelope<T>(res);
}

async function httpPost<T>(path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${apiBaseUrl}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    return throwHttpError(res);
  }
  return unwrapHttpEnvelope<T>(res);
}

async function httpPut<T>(path: string, body?: unknown): Promise<T> {
  const url = new URL(`${apiBaseUrl}${path}`, window.location.origin);
  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    return throwHttpError(res);
  }
  return unwrapHttpEnvelope<T>(res);
}

// ---------------------------------------------------------------------------
// WebSocket transport
// ---------------------------------------------------------------------------

function connectWebSocket(
  handlers: {
    onTaskUpdated: (projectId: string, task: TaskSummary) => void;
    onTaskLog: (projectId: string, taskId: string, entry: TaskLogEntry) => void;
  },
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;

  function connect(): void {
    if (closed) return;
    const url = `${wsBaseUrl}/ws?project_id=all`;
    ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.project_id && msg.task) {
          handlers.onTaskUpdated(msg.project_id, camelizeTask(msg.task));
        } else if (msg.project_id && msg.task_id && msg.entry) {
          handlers.onTaskLog(msg.project_id, msg.task_id, camelizeLog(msg.entry));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!closed) {
        // reconnect after 1s
        setTimeout(connect, 1000);
      }
    };
  }

  connect();

  return () => {
    closed = true;
    ws?.close();
  };
}

// ---------------------------------------------------------------------------
// Browser preview fallback
// ---------------------------------------------------------------------------

const BROWSER_PROJECTS_KEY = 'agent-kanban.browser-projects';

function camelizeProject(project: Record<string, unknown>): ProjectSummary {
  return {
    id: String(project.id),
    name: String(project.name),
    path: String(project.path),
    defaultBranch: String(project.default_branch),
    isLinked: Boolean(project.is_linked),
    remoteUrl: typeof project.remote_url === 'string' ? project.remote_url : undefined,
  };
}

function deriveProjectName(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) || 'Project';
}

function deriveProjectId(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, '/');
  const id = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return id || 'project';
}

function loadBrowserProjects(): ProjectSummary[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(BROWSER_PROJECTS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const projects = JSON.parse(raw) as Array<Partial<ProjectSummary>>;
    return Array.isArray(projects)
      ? projects.map((project) => ({
          id: String(project.id ?? ''),
          name: String(project.name ?? ''),
          path: String(project.path ?? ''),
          defaultBranch: String(project.defaultBranch ?? 'main'),
          isLinked: Boolean(project.isLinked ?? false),
          remoteUrl: typeof project.remoteUrl === 'string' ? project.remoteUrl : undefined,
        }))
      : [];
  } catch {
    return [];
  }
}

function saveBrowserProjects(projects: ProjectSummary[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(BROWSER_PROJECTS_KEY, JSON.stringify(projects));
}

function camelizeTask(task: Record<string, unknown>): TaskSummary {
  return {
    id: String(task.id),
    projectId: String(task.project_id),
    projectPath: task.project_path ? String(task.project_path) : undefined,
    title: String(task.title),
    description: String(task.description),
    status: String(task.status) as TaskSummary['status'],
    cliCommand: String(task.cli_command),
    cliArgs: Array.isArray(task.cli_args) ? task.cli_args.map(String) : [],
    envVars: (task.env_vars as Record<string, string>) ?? {},
    feedbackHistory: Array.isArray(task.feedback_history) ? task.feedback_history.map(String) : [],
    revisionCount: Number(task.revision_count ?? 0),
    branchName: String(task.branch_name),
    baseBranch: String(task.base_branch),
    createdAt: String(task.created_at),
    updatedAt: String(task.updated_at),
    review: typeof task.review === 'string' ? task.review : undefined,
    diff: typeof task.diff === 'string' ? task.diff : undefined,
    latestError: typeof task.latest_error === 'string' ? task.latest_error : undefined,
    workspacePath: typeof task.workspace_path === 'string' ? task.workspace_path : undefined,
    remoteBranch: typeof task.remote_branch === 'string' ? task.remote_branch : undefined,
    latestGuardrailReport:
      typeof task.latest_guardrail_report === 'string' ? task.latest_guardrail_report : undefined,
    pendingQuestion: task.pending_question
      ? {
          taskId: String((task.pending_question as Record<string, unknown>).task_id),
          q: String((task.pending_question as Record<string, unknown>).q),
          opts: Array.isArray((task.pending_question as Record<string, unknown>).opts)
            ? ((task.pending_question as Record<string, unknown>).opts as string[])
            : [],
          allowFreeform: Boolean((task.pending_question as Record<string, unknown>).allow_freeform),
        }
      : null,
  };
}

function camelizeLog(entry: Record<string, unknown>): TaskLogEntry {
  return {
    timestamp: String(entry.timestamp),
    stream: String(entry.stream) as TaskLogEntry['stream'],
    message: String(entry.message),
  };
}

function camelizeConfig(config: Record<string, unknown>): HarnessConfig {
  return {
    envVars: (config.env_vars as Record<string, string>) ?? {},
    resourceFiles: Array.isArray(config.resource_files) ? config.resource_files.map(String) : [],
    guardrailCommands: Array.isArray(config.guardrail_commands) ? config.guardrail_commands.map(String) : [],
    maxConcurrency: Number(config.max_concurrency ?? 2),
    maxRetries: Number(config.max_retries ?? 2),
    reviewCommand: typeof config.review_command === 'string' ? config.review_command : '',
    semgrepEnabled: Boolean(config.semgrep_enabled),
    semgrepConfig: typeof config.semgrep_config === 'string' ? config.semgrep_config : 'auto',
    questionTimeoutSecs: Number(config.question_timeout_secs ?? 120),
  };
}

function camelizeTaskTemplate(template: Record<string, unknown>): TaskTemplate {
  return {
    id: String(template.id),
    title: String(template.title),
    description: String(template.description),
  };
}

function decamelizeConfig(config: HarnessConfig) {
  return {
    env_vars: config.envVars,
    resource_files: config.resourceFiles,
    guardrail_commands: config.guardrailCommands,
    max_concurrency: config.maxConcurrency,
    max_retries: config.maxRetries,
    review_command: config.reviewCommand,
    semgrep_enabled: config.semgrepEnabled,
    semgrep_config: config.semgrepConfig,
    question_timeout_secs: config.questionTimeoutSecs,
  };
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let _initialized = false;

export function initBackend(): void {
  if (_initialized) return;
  _initialized = true;
  configureApiBase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getDefaultProjectsRoot(): Promise<string> {
  if (hasTauriRuntime()) {
    return invoke<string>('default_projects_root');
  }
  if (hasHttpRuntime()) {
    const data = await httpGet<{ root: string }>('/api/projects/root');
    return data.root;
  }
  return 'Browser preview mode';
}

export async function detectCliTools(): Promise<string[]> {
  if (hasTauriRuntime()) {
    return invoke<string[]>('detect_cli_tools');
  }
  if (hasHttpRuntime()) {
    const data = await httpGet<{ tools: string[] }>('/api/cli-tools');
    return data.tools;
  }
  return ['codex', 'copilot'];
}

export async function findProjects(rootDir: string): Promise<ProjectSummary[]> {
  return listRegisteredProjects();
}

export async function listRegisteredProjects(): Promise<ProjectSummary[]> {
  if (hasTauriRuntime()) {
    const projects = await invoke<Array<Record<string, unknown>>>('list_registered_projects');
    return projects.map(camelizeProject);
  }
  if (hasHttpRuntime()) {
    const projects = await httpGet<Array<Record<string, unknown>>>('/api/projects/registered');
    return projects.map(camelizeProject);
  }
  return loadBrowserProjects();
}

export async function discoverProjects(rootDir: string): Promise<ProjectSummary[]> {
  if (!rootDir.trim()) {
    return [];
  }
  if (hasTauriRuntime()) {
    const projects = await invoke<Array<Record<string, unknown>>>('discover_projects', { rootDir });
    return projects.map(camelizeProject);
  }
  if (hasHttpRuntime()) {
    const projects = await httpPost<Array<Record<string, unknown>>>('/api/projects/discover', { root_dir: rootDir });
    return projects.map(camelizeProject);
  }
  return [];
}

export async function registerProject(projectPath: string): Promise<ProjectSummary> {
  if (hasTauriRuntime()) {
    const project = await invoke<Record<string, unknown>>('register_project', { projectPath });
    return camelizeProject(project);
  }
  if (hasHttpRuntime()) {
    const project = await httpPost<Record<string, unknown>>('/api/projects/register', { project_path: projectPath });
    return camelizeProject(project);
  }

  const project = {
    id: deriveProjectId(projectPath),
    name: deriveProjectName(projectPath),
    path: projectPath,
    defaultBranch: 'main',
    isLinked: false,
    remoteUrl: undefined,
  } satisfies ProjectSummary;

  const existing = loadBrowserProjects();
  const projects = existing.some((entry) => entry.id === project.id)
    ? existing.map((entry) => (entry.id === project.id ? project : entry))
    : [...existing, project];

  projects.sort((left, right) => left.name.localeCompare(right.name));
  saveBrowserProjects(projects);
  return project;
}

export async function listTaskTemplates(): Promise<TaskTemplate[]> {
  if (hasTauriRuntime()) {
    const templates = await invoke<Array<Record<string, unknown>>>('list_task_templates');
    return templates.map(camelizeTaskTemplate);
  }
  if (hasHttpRuntime()) {
    const templates = await httpGet<Array<Record<string, unknown>>>('/api/templates');
    return templates.map(camelizeTaskTemplate);
  }
  return [];
}

export async function listTasks(projectId: string): Promise<TaskSummary[]> {
  if (hasTauriRuntime()) {
    const tasks = await invoke<Array<Record<string, unknown>>>('list_tasks', { projectId });
    return tasks.map(camelizeTask);
  }
  if (hasHttpRuntime()) {
    const tasks = await httpGet<Array<Record<string, unknown>>>('/api/tasks', { project_id: projectId });
    return tasks.map(camelizeTask);
  }
  return [];
}

export async function createTask(input: CreateTaskInput): Promise<TaskSummary> {
  const body: Record<string, unknown> = {
    project_id: input.projectId,
    base_branch: input.baseBranch,
    description: input.description,
    cli_command: input.cliCommand,
    cli_args: input.cliArgs,
    env_vars: input.envVars,
  };

  if (input.projectPath?.trim()) {
    body.project_path = input.projectPath;
  }

  if (hasTauriRuntime()) {
    const task = await invoke<Record<string, unknown>>('create_task', { input: body });
    return camelizeTask(task);
  }
  if (hasHttpRuntime()) {
    const task = await httpPost<Record<string, unknown>>('/api/tasks', body);
    return camelizeTask(task);
  }
  throw new Error('Cannot create task in browser preview mode');
}

export async function startTask(projectId: string, taskId: string): Promise<void> {
  if (hasTauriRuntime()) {
    await invoke('start_task', { projectId, taskId });
    return;
  }
  if (hasHttpRuntime()) {
    await httpPost(`/api/tasks/${taskId}/start`, undefined, { project_id: projectId });
    return;
  }
}

export async function retryTask(projectId: string, taskId: string): Promise<TaskSummary> {
  if (hasTauriRuntime()) {
    const task = await invoke<Record<string, unknown>>('retry_task', { projectId, taskId });
    return camelizeTask(task);
  }
  if (hasHttpRuntime()) {
    const task = await httpPost<Record<string, unknown>>(`/api/tasks/${taskId}/retry`, undefined, { project_id: projectId });
    return camelizeTask(task);
  }
  throw new Error('Cannot retry task in browser preview mode');
}

export async function approveTask(projectId: string, taskId: string): Promise<TaskSummary> {
  if (hasTauriRuntime()) {
    const task = await invoke<Record<string, unknown>>('approve_task', { projectId, taskId });
    return camelizeTask(task);
  }
  if (hasHttpRuntime()) {
    const task = await httpPost<Record<string, unknown>>(`/api/tasks/${taskId}/approve`, { project_id: projectId });
    return camelizeTask(task);
  }
  throw new Error('Cannot approve task in browser preview mode');
}

export async function rejectTask(projectId: string, taskId: string, feedback: string): Promise<TaskSummary> {
  if (hasTauriRuntime()) {
    const task = await invoke<Record<string, unknown>>('reject_task', { projectId, taskId, feedback });
    return camelizeTask(task);
  }
  if (hasHttpRuntime()) {
    const task = await httpPost<Record<string, unknown>>(`/api/tasks/${taskId}/reject`, {
      project_id: projectId,
      feedback,
    });
    return camelizeTask(task);
  }
  throw new Error('Cannot reject task in browser preview mode');
}

export async function answerQuestion(projectId: string, taskId: string, reply: string): Promise<TaskSummary> {
  if (hasTauriRuntime()) {
    const task = await invoke<Record<string, unknown>>('answer_question', { projectId, taskId, reply });
    return camelizeTask(task);
  }
  if (hasHttpRuntime()) {
    const task = await httpPost<Record<string, unknown>>(`/api/tasks/${taskId}/answer`, {
      project_id: projectId,
      reply,
    });
    return camelizeTask(task);
  }
  throw new Error('Cannot answer question in browser preview mode');
}

export async function loadTaskLogs(taskId: string): Promise<TaskLogEntry[]> {
  if (hasTauriRuntime()) {
    const logs = await invoke<Array<Record<string, unknown>>>('load_task_logs', { taskId });
    return logs.map(camelizeLog);
  }
  if (hasHttpRuntime()) {
    const logs = await httpGet<Array<Record<string, unknown>>>(`/api/tasks/${taskId}/logs`);
    return logs.map(camelizeLog);
  }
  return [];
}

export async function loadHarnessConfig(projectId: string): Promise<HarnessConfig> {
  if (hasTauriRuntime()) {
    const config = await invoke<Record<string, unknown>>('load_harness_config', { projectId });
    return camelizeConfig(config);
  }
  if (hasHttpRuntime()) {
    const config = await httpGet<Record<string, unknown>>(`/api/config/${projectId}`);
    return camelizeConfig(config);
  }
  return {
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
}

export async function saveHarnessConfig(projectId: string, config: HarnessConfig): Promise<HarnessConfig> {
  const body = decamelizeConfig(config);

  if (hasTauriRuntime()) {
    const next = await invoke<Record<string, unknown>>('save_harness_config', { projectId, config: body });
    return camelizeConfig(next);
  }
  if (hasHttpRuntime()) {
    const next = await httpPut<Record<string, unknown>>(`/api/config/${projectId}`, body);
    return camelizeConfig(next);
  }
  return config;
}

export function subscribeToTaskEvents(handlers: {
  onTaskUpdated: (projectId: string, task: TaskSummary) => void;
  onTaskLog: (projectId: string, taskId: string, entry: TaskLogEntry) => void;
}): () => void {
  let closed = false;

  if (hasTauriRuntime()) {
    const unlisteners: UnlistenFn[] = [];
    let cleanupCalled = false;

    const doListen = async () => {
      if (cleanupCalled) return;
      unlisteners.push(
        await listen<TaskUpdatedPayload>('task-updated', (event) => {
          handlers.onTaskUpdated(event.payload.project_id, camelizeTask(event.payload.task));
        }),
      );
      unlisteners.push(
        await listen<TaskLogPayload>('task-log', (event) => {
          handlers.onTaskLog(event.payload.project_id, event.payload.task_id, camelizeLog(event.payload.entry));
        }),
      );
    };

    doListen();

    return () => {
      cleanupCalled = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }

  if (hasHttpRuntime()) {
    return connectWebSocket(handlers);
  }

  return () => undefined;
}
