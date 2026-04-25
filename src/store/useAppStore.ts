import { create } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { EMPTY_HARNESS_CONFIG, type HarnessConfig, type ProjectSummary, type TaskLogEntry, type TaskQuestion, type TaskSummary } from '../lib/types';

export type AppState = {
  projects: ProjectSummary[];
  currentProjectId: string;
  tasksByProject: Record<string, TaskSummary[]>;
  taskLogs: Record<string, TaskLogEntry[]>;
  selectedTaskId: string | null;
  activeQuestion: TaskQuestion | null;
  settingsByProject: Record<string, HarnessConfig>;
  activePanel: 'details' | 'settings';
  availableCliTools: string[];
  projectRoot: string;
  isBootstrapped: boolean;
  isLoading: boolean;
  errorMessage: string | null;
};

export type AppActions = {
  hydrateProjects: (projects: ProjectSummary[]) => void;
  upsertProject: (project: ProjectSummary) => void;
  selectProject: (projectId: string) => void;
  setTasks: (projectId: string, tasks: TaskSummary[]) => void;
  upsertTask: (task: TaskSummary) => void;
  selectTask: (taskId: string | null) => void;
  setActiveQuestion: (question: TaskQuestion | null) => void;
  dismissQuestion: () => void;
  setProjectSettings: (projectId: string, settings: HarnessConfig) => void;
  updateProjectSettings: (projectId: string, patch: Partial<HarnessConfig>) => void;
  appendTaskLog: (taskId: string, entry: TaskLogEntry) => void;
  setActivePanel: (panel: 'details' | 'settings') => void;
  setAvailableCliTools: (tools: string[]) => void;
  setProjectRoot: (projectRoot: string) => void;
  setBootstrapped: (bootstrapped: boolean) => void;
  setLoading: (loading: boolean) => void;
  setErrorMessage: (message: string | null) => void;
};

export type AppStore = AppState & AppActions;

const createInitialState = (): AppState => ({
  projects: [],
  currentProjectId: 'all',
  tasksByProject: {},
  taskLogs: {},
  selectedTaskId: null,
  activeQuestion: null,
  settingsByProject: {},
  activePanel: 'details',
  availableCliTools: [],
  projectRoot: '',
  isBootstrapped: false,
  isLoading: false,
  errorMessage: null,
});

function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((left, right) => {
    if (left.isLinked !== right.isLinked) {
      return left.isLinked ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

const createAppState = (
  set: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void,
  get: () => AppStore,
): AppStore => ({
  ...createInitialState(),
  hydrateProjects: (projects) =>
    set((state) => ({
      projects: sortProjects(projects),
      currentProjectId:
        state.currentProjectId === 'all' || !projects.some((project) => project.id === state.currentProjectId)
          ? 'all'
          : state.currentProjectId,
    })),
  upsertProject: (project) =>
    set((state) => {
      const hasExisting = state.projects.some((entry) => entry.id === project.id);
      const projects = hasExisting
        ? state.projects.map((entry) => (entry.id === project.id ? project : entry))
        : [...state.projects, project];

      return { projects: sortProjects(projects) };
    }),
  selectProject: (projectId) =>
    set({
      currentProjectId: projectId,
      selectedTaskId: getVisibleTasks({ ...get(), currentProjectId: projectId })[0]?.id ?? null,
    }),
  setTasks: (projectId, tasks) =>
    set((state) => ({
      tasksByProject: {
        ...state.tasksByProject,
        [projectId]: tasks,
      },
    })),
  upsertTask: (task) =>
    set((state) => {
      const existing = state.tasksByProject[task.projectId] ?? [];
      const next = existing.some((entry) => entry.id === task.id)
        ? existing.map((entry) => (entry.id === task.id ? task : entry))
        : [task, ...existing];

      return {
        tasksByProject: {
          ...state.tasksByProject,
          [task.projectId]: next,
        },
        selectedTaskId: state.selectedTaskId ?? task.id,
      };
    }),
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  setActiveQuestion: (question) => set({ activeQuestion: question }),
  dismissQuestion: () => set({ activeQuestion: null }),
  setProjectSettings: (projectId, settings) =>
    set((state) => ({
      settingsByProject: {
        ...state.settingsByProject,
        [projectId]: settings,
      },
    })),
  updateProjectSettings: (projectId, patch) =>
    set((state) => ({
      settingsByProject: {
        ...state.settingsByProject,
        [projectId]: {
          ...(state.settingsByProject[projectId] ?? EMPTY_HARNESS_CONFIG),
          ...patch,
        },
      },
    })),
  appendTaskLog: (taskId, entry) =>
    set((state) => ({
      taskLogs: {
        ...state.taskLogs,
        [taskId]: [...(state.taskLogs[taskId] ?? []), entry],
      },
    })),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setAvailableCliTools: (tools) => set({ availableCliTools: tools }),
  setProjectRoot: (projectRoot) => set({ projectRoot }),
  setBootstrapped: (isBootstrapped) => set({ isBootstrapped }),
  setLoading: (isLoading) => set({ isLoading }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
});

export const createAppStore = () => createStore<AppStore>()(createAppState);

export const useAppStore = create<AppStore>()(createAppState);

export function resetAppStore(): void {
  useAppStore.setState(createInitialState());
}

export function getVisibleTasks(state: Pick<AppState, 'currentProjectId' | 'tasksByProject'>): TaskSummary[] {
  if (state.currentProjectId === 'all') {
    return Object.values(state.tasksByProject).flat();
  }

  return state.tasksByProject[state.currentProjectId] ?? [];
}

export function getSelectedTask(
  state: Pick<AppState, 'currentProjectId' | 'selectedTaskId' | 'tasksByProject'>,
): TaskSummary | null {
  const visibleTasks = getVisibleTasks(state);
  return visibleTasks.find((task) => task.id === state.selectedTaskId) ?? visibleTasks[0] ?? null;
}