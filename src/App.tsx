import { useEffect, useMemo, useState } from 'react';
import { App as AntdApp, ConfigProvider, Drawer, Empty, Skeleton, theme as antdTheme } from 'antd';
import { BellDot, FolderPlus, Plus, Search } from 'lucide-react';
import { CreateTaskComposer } from './components/CreateTaskComposer';
import { ProjectOnboardingPanel } from './components/ProjectOnboardingPanel';
import { ProjectSidebar } from './components/ProjectSidebar';
import { PromptCard } from './components/PromptCard';
import { TaskBoard } from './components/TaskBoard';
import { TaskDetailsPanel } from './components/TaskDetailsPanel';
import { TaskDiffWorkspace } from './components/TaskDiffWorkspace';
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
  registerProject,
  rejectTask,
  retryTask,
  saveHarnessConfig,
  startTask,
  subscribeToTaskEvents,
} from './lib/backend';
import { isTerminalTaskStatus } from './lib/types';
import { getSelectedTask, getVisibleTasks, useAppStore } from './store/useAppStore';

function AppShell() {
  const { message } = AntdApp.useApp();
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const tasksByProject = useAppStore((state) => state.tasksByProject);
  const taskLogs = useAppStore((state) => state.taskLogs);
  const selectedTaskId = useAppStore((state) => state.selectedTaskId);
  const activeQuestion = useAppStore((state) => state.activeQuestion);
  const activePanel = useAppStore((state) => state.activePanel);
  const detailPanelOpen = useAppStore((state) => state.detailPanelOpen);
  const createTaskOpen = useAppStore((state) => state.createTaskOpen);
  const diffMode = useAppStore((state) => state.diffMode);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const themeMode = useAppStore((state) => state.theme);
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
  const setDetailPanelOpen = useAppStore((state) => state.setDetailPanelOpen);
  const setCreateTaskOpen = useAppStore((state) => state.setCreateTaskOpen);
  const setDiffMode = useAppStore((state) => state.setDiffMode);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const hydrateProjects = useAppStore((state) => state.hydrateProjects);
  const upsertProject = useAppStore((state) => state.upsertProject);
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
  const [isRegisteringProject, setIsRegisteringProject] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const tasks = useMemo(
    () => getVisibleTasks({ currentProjectId, tasksByProject }),
    [currentProjectId, tasksByProject],
  );
  const allTasks = useMemo(() => Object.values(tasksByProject).flat(), [tasksByProject]);
  const taskById = useMemo(
    () => Object.fromEntries(allTasks.map((task) => [task.id, task])),
    [allTasks],
  );
  const selectedTask = useMemo(
    () => getSelectedTask({ currentProjectId, tasksByProject, selectedTaskId }),
    [currentProjectId, selectedTaskId, tasksByProject],
  );
  const logs = selectedTask ? taskLogs[selectedTask.id] ?? [] : [];
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? null,
    [currentProjectId, projects],
  );
  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === selectedTask?.projectId) ?? null,
    [projects, selectedTask?.projectId],
  );
  const inspectedProject = selectedProject ?? selectedTaskProject;
  const selectedSettings = inspectedProject ? settingsByProject[inspectedProject.id] ?? null : null;
  const projectTaskStats = useMemo(
    () =>
      Object.fromEntries(
        projects.map((project) => {
          const projectTasks = tasksByProject[project.id] ?? [];
          return [
            project.id,
            {
              total: projectTasks.length,
              active: projectTasks.filter((task) => !isTerminalTaskStatus(task.status)).length,
            },
          ];
        }),
      ),
    [projects, tasksByProject],
  );
  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const activeTaskCount = useMemo(
    () => allTasks.filter((task) => !isTerminalTaskStatus(task.status)).length,
    [allTasks],
  );
  const linkedProjectCount = useMemo(
    () => projects.filter((project) => project.isLinked).length,
    [projects],
  );
  const promptCount = useMemo(() => allTasks.filter((task) => task.pendingQuestion).length, [allTasks]);
  const isBrowserPreviewMode = projectRoot === 'Browser preview mode';
  const selectedWorkspaceLabel = selectedProject?.name ?? 'All Projects';

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

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
        const nextError = error instanceof Error ? error.message : String(error);
        setErrorMessage(nextError);
        message.error(nextError);
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
    message,
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setCreateTaskOpen(true);
      }

      if (event.key === 'Escape') {
        if (diffMode) {
          setDiffMode(false);
          return;
        }

        if (createTaskOpen) {
          setCreateTaskOpen(false);
          return;
        }

        if (onboardingOpen) {
          setOnboardingOpen(false);
          return;
        }

        if (detailPanelOpen) {
          setDetailPanelOpen(false);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createTaskOpen, detailPanelOpen, diffMode, onboardingOpen, setCreateTaskOpen, setDetailPanelOpen, setDiffMode]);

  const handleRegisterProject = async (repositoryPath: string) => {
    setRegistrationError(null);
    setIsRegisteringProject(true);
    try {
      const project = await registerProject(repositoryPath);
      upsertProject(project);
      const [projectTasks, config] = await Promise.all([
        listTasks(project.id),
        loadHarnessConfig(project.id),
      ]);
      setTasks(project.id, projectTasks);
      setProjectSettings(project.id, config);
      selectProject(project.id);
      setDetailPanelOpen(true);
      setActivePanel('settings');
      setOnboardingOpen(false);
      message.success('Repository linked');
    } catch (error) {
      const nextError = error instanceof Error ? error.message : String(error);
      setRegistrationError(nextError);
      setErrorMessage(nextError);
      message.error(nextError);
      throw new Error(nextError);
    } finally {
      setIsRegisteringProject(false);
    }
  };

  const handleSelectTask = (taskId: string) => {
    selectTask(taskId);
    setActivePanel('overview');
    setDetailPanelOpen(true);
  };

  return (
    <div className={detailPanelOpen ? 'app-shell app-shell--detail-open' : 'app-shell'}>
      <ProjectSidebar
        collapsed={sidebarCollapsed}
        currentProjectId={currentProjectId}
        onOpenOnboarding={() => setOnboardingOpen(true)}
        onOpenSettings={() => {
          setActivePanel('settings');
          setDetailPanelOpen(true);
        }}
        onSelectProject={(projectId) => {
          selectProject(projectId);
          setDiffMode(false);
        }}
        onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        onToggleTheme={toggleTheme}
        projectTaskStats={projectTaskStats}
        projects={projects}
        promptCount={promptCount}
        theme={themeMode}
        totalActiveTaskCount={activeTaskCount}
        totalTaskCount={allTasks.length}
      />

      <main className="workspace-shell">
        <header className="workspace-topbar">
          <div className="workspace-topbar__title">
            <span className="workspace-title__eyebrow">Agent Kanban</span>
            <h1>{selectedWorkspaceLabel}</h1>
          </div>

          <div className="workspace-topbar__actions">
            <label className="workspace-search" aria-label="Search tasks">
              <Search size={16} />
              <input placeholder="Search tasks, branches, files" type="text" />
            </label>
            <button className="secondary-button" onClick={() => setOnboardingOpen(true)} type="button">
              <FolderPlus size={16} />
              <span>Link Repo</span>
            </button>
            <button className="primary-button" onClick={() => setCreateTaskOpen(true)} type="button">
              <Plus size={16} />
              <span>New Task</span>
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="inline-alert">
            <BellDot size={16} />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <section className="workspace-content">
          {isLoading ? (
            <div className="loading-panel">
              <Skeleton active paragraph={{ rows: 10 }} title />
            </div>
          ) : projects.length === 0 ? (
            <div className="workspace-empty">
              <ProjectOnboardingPanel
                isRegistering={isRegisteringProject}
                linkedProjectCount={linkedProjectCount}
                onRegisterProject={handleRegisterProject}
                previewMode={isBrowserPreviewMode}
                projectRoot={projectRoot}
                registrationError={registrationError}
              />
            </div>
          ) : diffMode ? (
            <TaskDiffWorkspace
              onApprove={async () => {
                if (!selectedTask) {
                  return;
                }

                try {
                  const task = await approveTask(selectedTask.projectId, selectedTask.id);
                  upsertTask(task);
                  setDiffMode(false);
                  message.success('Task approved');
                } catch (error) {
                  const nextError = error instanceof Error ? error.message : String(error);
                  setErrorMessage(nextError);
                  message.error(nextError);
                }
              }}
              onBack={() => setDiffMode(false)}
              onReject={async (feedback) => {
                if (!selectedTask) {
                  return;
                }

                try {
                  const task = await rejectTask(selectedTask.projectId, selectedTask.id, feedback);
                  upsertTask(task);
                  setDiffMode(false);
                  message.success('Task sent back for revision');
                } catch (error) {
                  const nextError = error instanceof Error ? error.message : String(error);
                  setErrorMessage(nextError);
                  message.error(nextError);
                }
              }}
              task={selectedTask}
              theme={themeMode}
            />
          ) : (
            <>
              <div className="workspace-board-head">
                <div>
                  <span className="section-kicker">Board</span>
                  <h2>{selectedWorkspaceLabel}</h2>
                </div>
                <div className="workspace-board-head__chips">
                  <span className="count-pill">{allTasks.length} tasks</span>
                  <span className="count-pill">{promptCount} waiting input</span>
                  <span className="count-pill">{linkedProjectCount} linked repos</span>
                </div>
              </div>

              {tasks.length === 0 && currentProjectId !== 'all' ? (
                <div className="workspace-empty workspace-empty--compact">
                  <Empty description="This project has no tasks yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              ) : (
                <TaskBoard
                  onCreateTask={() => setCreateTaskOpen(true)}
                  onSelectTask={handleSelectTask}
                  projectNameById={projectNameById}
                  selectedTaskId={selectedTaskId}
                  showProjectName={currentProjectId === 'all'}
                  tasks={tasks}
                />
              )}
            </>
          )}
        </section>
      </main>

      <TaskDetailsPanel
        activePanel={activePanel}
        logs={logs}
        onApproveTask={async () => {
          if (!selectedTask) {
            return;
          }

          try {
            const task = await approveTask(selectedTask.projectId, selectedTask.id);
            upsertTask(task);
            message.success('Task approved');
          } catch (error) {
            const nextError = error instanceof Error ? error.message : String(error);
            setErrorMessage(nextError);
            message.error(nextError);
          }
        }}
        onClose={() => setDetailPanelOpen(false)}
        onOpenDiff={() => setDiffMode(true)}
        onRejectTask={async (feedback) => {
          if (!selectedTask) {
            return;
          }

          try {
            const task = await rejectTask(selectedTask.projectId, selectedTask.id, feedback);
            upsertTask(task);
            message.success('Task sent back for revision');
          } catch (error) {
            const nextError = error instanceof Error ? error.message : String(error);
            setErrorMessage(nextError);
            message.error(nextError);
          }
        }}
        onRetryTask={async () => {
          if (!selectedTask) {
            return;
          }

          try {
            const task = await retryTask(selectedTask.projectId, selectedTask.id);
            upsertTask(task);
            message.success('Task retried');
          } catch (error) {
            const nextError = error instanceof Error ? error.message : String(error);
            setErrorMessage(nextError);
            message.error(nextError);
          }
        }}
        onSaveSettings={async (config) => {
          if (!inspectedProject) {
            return;
          }

          try {
            const saved = await saveHarnessConfig(inspectedProject.id, config);
            setProjectSettings(inspectedProject.id, saved);
            message.success('Project settings saved');
          } catch (error) {
            const nextError = error instanceof Error ? error.message : String(error);
            setErrorMessage(nextError);
            message.error(nextError);
          }
        }}
        onSelectPanel={setActivePanel}
        onStartTask={async () => {
          if (!selectedTask) {
            return;
          }

          try {
            await startTask(selectedTask.projectId, selectedTask.id);
            message.success('Task started');
          } catch (error) {
            const nextError = error instanceof Error ? error.message : String(error);
            setErrorMessage(nextError);
            message.error(nextError);
          }
        }}
        open={detailPanelOpen}
        project={inspectedProject}
        settings={selectedSettings}
        task={selectedTask}
        theme={themeMode}
      />

      <CreateTaskComposer
        availableCliTools={availableCliTools}
        currentProjectId={currentProjectId}
        onClose={() => setCreateTaskOpen(false)}
        onCreateTask={async (input) => {
          try {
            const task = await createTask(input);
            upsertTask(task);
            selectProject(task.projectId);
            selectTask(task.id);
            setActivePanel('overview');
            setDetailPanelOpen(true);

            try {
              await startTask(task.projectId, task.id);
              message.success('Task created and started');
            } catch (startError) {
              const nextError = startError instanceof Error ? startError.message : String(startError);
              setErrorMessage(nextError);
              message.warning(`Task created, but start failed: ${nextError}`);
            }
          } catch (error) {
            const nextError = error instanceof Error ? error.message : String(error);
            setErrorMessage(nextError);
            message.error(nextError);
          }
        }}
        open={createTaskOpen}
        projects={projects}
      />

      <Drawer
        className="onboarding-drawer"
        closable
        onClose={() => setOnboardingOpen(false)}
        open={onboardingOpen}
        placement="right"
        title="Link Repository"
      >
        <ProjectOnboardingPanel
          isRegistering={isRegisteringProject}
          linkedProjectCount={linkedProjectCount}
          onRegisterProject={handleRegisterProject}
          previewMode={isBrowserPreviewMode}
          projectRoot={projectRoot}
          registrationError={registrationError}
        />
      </Drawer>

      <PromptCard
        onAnswer={(reply) => {
          if (!activeQuestion) {
            return;
          }

          const questionTask = taskById[activeQuestion.taskId];
          if (!questionTask) {
            return;
          }

          void answerQuestion(questionTask.projectId, activeQuestion.taskId, reply).then((task) => {
            upsertTask(task);
            dismissQuestion();
            message.success('Answer submitted');
          });
        }}
        onDismiss={dismissQuestion}
        question={activeQuestion}
      />

      {!diffMode ? (
        <button className="floating-new-task" onClick={() => setCreateTaskOpen(true)} type="button">
          <Plus size={18} />
        </button>
      ) : null}
    </div>
  );
}

export function App() {
  const themeMode = useAppStore((state) => state.theme);
  const isDark = themeMode === 'dark';

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#7C3AED',
          borderRadius: 8,
          colorBgBase: isDark ? '#0F0F12' : '#F8F9FA',
          colorBgContainer: isDark ? '#1A1B1E' : '#FFFFFF',
          colorBorder: isDark ? '#2C2F36' : '#E5E7EB',
          colorText: isDark ? '#F3F4F6' : '#1F2937',
        },
      }}
    >
      <AntdApp>
        <AppShell />
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
