import { describe, expect, it } from 'vitest';
import { createAppStore, getVisibleTasks } from './useAppStore';

describe('useAppStore', () => {
  it('switches projects without losing each project task list', () => {
    const store = createAppStore();

    store.getState().hydrateProjects([
      { id: 'alpha', name: 'Alpha', path: 'C:/alpha', defaultBranch: 'main', isLinked: true },
      { id: 'beta', name: 'Beta', path: 'C:/beta', defaultBranch: 'main', isLinked: true },
    ]);

    store.getState().setTasks('alpha', [
      {
        id: 'task-a',
        projectId: 'alpha',
        title: 'Fix Alpha',
        description: 'Fix Alpha',
        status: 'PENDING',
        cliCommand: 'codex',
        cliArgs: [],
        envVars: {},
        feedbackHistory: [],
        revisionCount: 0,
        branchName: 'ai/fix-alpha',
        baseBranch: 'main',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ]);

    store.getState().setTasks('beta', [
      {
        id: 'task-b',
        projectId: 'beta',
        title: 'Ship Beta',
        description: 'Ship Beta',
        status: 'EXECUTING',
        cliCommand: 'copilot',
        cliArgs: [],
        envVars: {},
        feedbackHistory: [],
        revisionCount: 0,
        branchName: 'ai/ship-beta',
        baseBranch: 'main',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ]);

    expect(getVisibleTasks(store.getState())).toHaveLength(2);

    store.getState().selectProject('alpha');
    expect(getVisibleTasks(store.getState()).map((task) => task.id)).toEqual(['task-a']);

    store.getState().selectProject('beta');
    expect(getVisibleTasks(store.getState())[0]?.title).toBe('Ship Beta');
  });

  it('tracks the active question independently of task lists', () => {
    const store = createAppStore();

    store.getState().setActiveQuestion({
      taskId: 'task-a',
      q: 'Which branch should I target?',
      opts: ['main', 'develop'],
    });

    expect(store.getState().activeQuestion?.taskId).toBe('task-a');

    store.getState().dismissQuestion();

    expect(store.getState().activeQuestion).toBeNull();
  });

  it('upserts projects so manually linked repositories appear in the sidebar', () => {
    const store = createAppStore();

    store.getState().upsertProject({
      id: 'agent-kanban',
      name: 'AgentKanban',
      path: 'C:/repos/agent-kanban',
      defaultBranch: 'main',
      isLinked: true,
    });

    store.getState().upsertProject({
      id: 'agent-kanban',
      name: 'AgentKanban',
      path: 'C:/repos/agent-kanban',
      defaultBranch: 'develop',
      isLinked: true,
    });

    expect(store.getState().projects).toEqual([
      {
        id: 'agent-kanban',
        name: 'AgentKanban',
        path: 'C:/repos/agent-kanban',
        defaultBranch: 'develop',
        isLinked: true,
      },
    ]);
  });
});