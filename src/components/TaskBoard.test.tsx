import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskBoard } from './TaskBoard';
import type { TaskSummary } from '../lib/types';

function makeTask(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: 'task-1',
    projectId: 'alpha',
    projectPath: 'C:/alpha',
    title: 'Implement compact task cards',
    description: 'This description should only appear in the detail panel.',
    status: 'AWAITING_ACCEPTANCE',
    cliCommand: 'C:/tools/codex',
    cliArgs: [],
    envVars: {},
    feedbackHistory: [],
    revisionCount: 0,
    branchName: 'ai/compact-cards',
    baseBranch: 'trunk',
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:01:30.000Z',
    ...overrides,
  };
}

describe('TaskBoard', () => {
  it('renders the compact card layout without description, status text, or base branch', () => {
    render(
      <TaskBoard
        onCreateTask={vi.fn()}
        onSelectTask={vi.fn()}
        projectNameById={{ alpha: 'Alpha' }}
        selectedTaskId={null}
        showProjectName
        tasks={[makeTask()]}
      />,
    );

    expect(screen.getByText('Implement compact task cards')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('codex')).toBeInTheDocument();
    expect(screen.getByText('1m 30s')).toBeInTheDocument();
    expect(screen.getByText('ai/compact-cards')).toBeInTheDocument();
    expect(screen.queryByText('This description should only appear in the detail panel.')).not.toBeInTheDocument();
    expect(screen.queryByText('AWAITING ACCEPTANCE')).not.toBeInTheDocument();
    expect(screen.queryByText('trunk')).not.toBeInTheDocument();
  });

  it('uses the new empty-state copy for empty columns', () => {
    render(
      <TaskBoard
        onCreateTask={vi.fn()}
        onSelectTask={vi.fn()}
        projectNameById={{}}
        selectedTaskId={null}
        showProjectName={false}
        tasks={[]}
      />,
    );

    expect(screen.getAllByText('No tasks in this column').length).toBeGreaterThan(0);
  });
});