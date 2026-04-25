import { useEffect, useMemo } from 'react';
import { CreateTaskComposer } from './components/CreateTaskComposer';
import { ProjectSidebar } from './components/ProjectSidebar';
import { PromptCard } from './components/PromptCard';
import { TaskBoard } from './components/TaskBoard';
import { TaskDetailsPanel } from './components/TaskDetailsPanel';
import {
  answerQuestion,
  approveTask,
  createTask,
  detectCliTools,
  findProjects,
  getDefaultProjectsRoot,
  listTasks,
  loadHarnessConfig,
  loadTaskLogs,
  rejectTask,
  retryTask,
  saveHarnessConfig,
  startTask,
  subscribeToTaskEvents,
} from './lib/backend';
import { getSelectedTask, getVisibleTasks, useAppStore } from './store/useAppStore';

export function App() {
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const tasksByProject = useAppStore((state) => state.tasksByProject);
  const taskLogs = useAppStore((state) => state.taskLogs);
  const selectedTaskId = useAppStore((state) => state.selectedTaskId);
  const activeQuestion = useAppStore((state) => state.activeQuestion);
  const activePanel = useAppStore((state) => state.activePanel);
  const settingsByProject = useAppStore((state) => state.settingsByProject);
  const availableCliTools = useAppStore((state) => state.availableCliTools);
  const projectRoot = useAppStore((state) => state.projectRoot);
  const isBootstrapped = useAppStore((state) => state.isBootstrapped);
  const isLoading = useAppStore((state) => state.isLoading);
  const errorMessage = useAppStore((state) => state.errorMessage);
  const selectProject = useAppStore((state) => state.selectProject);
  const selectTask = useAppStore((state) => state.selectTask);
  const dismissQuestion = useAppStore((state) => state.dismissQuestion);
  const setActivePanel = useAppStore((state) => state.setActivePanel);
  const hydrateProjects = useAppStore((state) => state.hydrateProjects);
  const setTasks = useAppStore((state) => state.setTasks);
  const upsertTask = useAppStore((state) => state.upsertTask);
  const appendTaskLog = useAppStore((state) => state.appendTaskLog);
  const setProjectSettings = useAppStore((state) => state.setProjectSettings);
  const setAvailableCliTools = useAppStore((state) => state.setAvailableCliTools);
  const setProjectRoot = useAppStore((state) => state.setProjectRoot);
  const setBootstrapped = useAppStore((state) => state.setBootstrapped);
  const setLoading = useAppStore((state) => state.setLoading);
  const setErrorMessage = useAppStore((state) => state.setErrorMessage);
  const setActiveQuestion = useAppStore((state) => state.setActiveQuestion);

  const tasks = useMemo(
    () => getVisibleTasks({ currentProjectId, tasksByProject }),
    [currentProjectId, tasksByProject],
  );
  const selectedTask = useMemo(
    () => getSelectedTask({
      currentProjectId,
      tasksByProject,
      selectedTaskId,
    }),
    [currentProjectId, selectedTaskId, tasksByProject],
  );
  const logs = selectedTask ? taskLogs[selectedTask.id] ?? [] : [];
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? null,
    [currentProjectId, projects],
  );
  const selectedSettings = selectedProject ? settingsByProject[selectedProject.id] ?? null : null;

  useEffect(() => {
    if (isBootstrapped || projects.length > 0) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      try {
        const root = await getDefaultProjectsRoot();
        if (cancelled) {
          return;
        }
        setProjectRoot(root);
        const [cliTools, discoveredProjects] = await Promise.all([detectCliTools(), findProjects(root)]);
        if (cancelled) {
          return;
        }
        setAvailableCliTools(cliTools);
        hydrateProjects(discoveredProjects);
        await Promise.all(
          discoveredProjects.map(async (project) => {
            const [projectTasks, config] = await Promise.all([
              listTasks(project.id),
              loadHarnessConfig(project.id),
            ]);
            if (cancelled) {
              return;
            }
            setTasks(project.id, projectTasks);
            setProjectSettings(project.id, config);
          }),
        );
        setBootstrapped(true);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    hydrateProjects,
    isBootstrapped,
    projects.length,
    setAvailableCliTools,
    setBootstrapped,
    setErrorMessage,
    setLoading,
    setProjectRoot,
    setProjectSettings,
    setTasks,
  ]);

  useEffect(() => {
    let disposed = false;
    let unlisten: () => void = () => {};

    async function wireEvents() {
      unlisten = await subscribeToTaskEvents({
        onTaskUpdated: (projectId, task) => {
          upsertTask(task);
          if (task.pendingQuestion) {
            setActiveQuestion(task.pendingQuestion);
          }
          if (selectedTaskId === task.id) {
            void loadTaskLogs(task.id).then((entries) => {
              if (disposed) {
                return;
              }
              entries.forEach((entry) => appendTaskLog(task.id, entry));
            });
          }
          if (projectId && task.pendingQuestion == null && activeQuestion?.taskId === task.id) {
            dismissQuestion();
          }
        },
        onTaskLog: (_projectId, taskId, entry) => {
          appendTaskLog(taskId, entry);
        },
      });
    }

    void wireEvents();

    return () => {
      disposed = true;
      unlisten();
    };
  }, [activeQuestion?.taskId, appendTaskLog, dismissQuestion, selectedTaskId, setActiveQuestion, upsertTask]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    let cancelled = false;
    void loadTaskLogs(selectedTask.id).then((entries) => {
      if (cancelled) {
        return;
      }
      entries.forEach((entry) => appendTaskLog(selectedTask.id, entry));
    });

    return () => {
      cancelled = true;
    };
  }, [appendTaskLog, selectedTask]);

  return (
    <div className="app-shell">
      <ProjectSidebar currentProjectId={currentProjectId} onSelectProject={selectProject} projects={projects} />

      <main className="workspace">
        <header className="hero panel">
          <div>
            <p className="eyebrow">Personal orchestration board</p>
            <h1>Agent Kanban</h1>
            <p className="hero-copy">Route work across local AI CLIs, guardrails, and acceptance without leaving the desktop shell.</p>
          </div>
          <div className="hero-metrics">
            <div>
              <span className="metric-label">Visible Tasks</span>
              <strong>{tasks.length}</strong>
            </div>
            <div>
              <span className="metric-label">Projects</span>
              <strong>{projects.length}</strong>
            </div>
          </div>
        </header>

        <section className="panel root-panel">
          <div className="panel-heading panel-heading--inline">
            <div>
              <p className="eyebrow">Workspace Root</p>
              <h2>Project Discovery</h2>
            </div>
            <span className="count-pill">{projectRoot || 'unset'}</span>
          </div>
          {isLoading ? <p className="empty-state">Loading projects and task metadata...</p> : null}
          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        </section>

        <CreateTaskComposer
          availableCliTools={availableCliTools}
          onCreateTask={async (input) => {
            const task = await createTask(input);
            upsertTask(task);
            selectProject(task.projectId);
            selectTask(task.id);
          }}
          selectedProject={selectedProject}
        />

        <TaskBoard onSelectTask={selectTask} selectedTaskId={selectedTaskId} tasks={tasks} />
      </main>

      <TaskDetailsPanel
        activePanel={activePanel}
        logs={logs}
        onApproveTask={async () => {
          if (!selectedTask) {
            return;
          }
          const task = await approveTask(selectedTask.projectId, selectedTask.id);
          upsertTask(task);
        }}
        onRejectTask={async () => {
          if (!selectedTask) {
            return;
          }
          const feedback = window.prompt('Why are you rejecting this task?', 'Please revise the implementation.') ?? '';
          if (!feedback.trim()) {
            return;
          }
          const task = await rejectTask(selectedTask.projectId, selectedTask.id, feedback);
          upsertTask(task);
        }}
        onRetryTask={async () => {
          if (!selectedTask) {
            return;
          }
          const task = await retryTask(selectedTask.projectId, selectedTask.id);
          upsertTask(task);
        }}
        onSaveSettings={async (config) => {
          if (!selectedProject) {
            return;
          }
          const saved = await saveHarnessConfig(selectedProject.id, config);
          setProjectSettings(selectedProject.id, saved);
        }}
        onSelectPanel={setActivePanel}
        onStartTask={async () => {
          if (!selectedTask) {
            return;
          }
          await startTask(selectedTask.projectId, selectedTask.id);
        }}
        project={selectedProject}
        settings={selectedSettings}
        task={selectedTask}
      />

      <PromptCard
        onAnswer={(reply) => {
          if (!activeQuestion || !selectedTask) {
            return;
          }
          void answerQuestion(selectedTask.projectId, activeQuestion.taskId, reply).then((task) => {
            upsertTask(task);
            dismissQuestion();
          });
        }}
        onDismiss={dismissQuestion}
        question={activeQuestion}
      />
    </div>
  );
}

export default App;