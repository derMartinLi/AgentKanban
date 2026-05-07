import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailsPanel } from './TaskDetailsPanel';
import type { ProjectSummary, TaskSummary } from '../lib/types';

function makeTask(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: 'task-1',
    projectId: 'alpha',
    projectPath: 'C:/alpha',
    title: 'Inspect revisions',
    description: 'Task description',
    status: 'BLOCKED',
    cliCommand: 'codex',
    cliArgs: ['--sandbox', 'workspace-write'],
    envVars: {},
    feedbackHistory: ['Initial review requested naming fixes.', 'Guardrail blocked a regression in tests.'],
    revisionCount: 2,
    branchName: 'ai/revisions',
    baseBranch: 'main',
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:05:00.000Z',
    review: 'The implementation is close, but the final acceptance check is still blocked.',
    latestGuardrailReport: 'pnpm test\n\nFAIL src/example.test.ts',
    ...overrides,
  };
}

const project: ProjectSummary = {
  id: 'alpha',
  name: 'Alpha',
  path: 'C:/alpha',
  defaultBranch: 'main',
  isLinked: true,
};

describe('TaskDetailsPanel', () => {
  it('renders AI review, guardrail feedback, and revision history in overview mode', () => {
    render(
      <TaskDetailsPanel
        activePanel="overview"
        logs={[]}
        onApproveTask={async () => undefined}
        onClose={vi.fn()}
        onOpenDiff={vi.fn()}
        onRejectTask={async () => undefined}
        onRetryTask={async () => undefined}
        onSaveSettings={async () => undefined}
        onSelectPanel={vi.fn()}
        onStartTask={async () => undefined}
        open
        project={project}
        settings={null}
        task={makeTask()}
        theme="dark"
      />,
    );

    expect(screen.getByText('AI Review')).toBeInTheDocument();
    expect(screen.getByText('Guardrail report')).toBeInTheDocument();
    expect(screen.getByText('Revision History')).toBeInTheDocument();
    expect(screen.getByText('The implementation is close, but the final acceptance check is still blocked.')).toBeInTheDocument();
    expect(screen.getByText(/FAIL src\/example.test.ts/)).toBeInTheDocument();
    expect(screen.getByText('Initial review requested naming fixes.')).toBeInTheDocument();
    expect(screen.getByText('Guardrail blocked a regression in tests.')).toBeInTheDocument();
    expect(screen.getByText('Revision 1')).toBeInTheDocument();
    expect(screen.getByText('Revision 2')).toBeInTheDocument();
  });
});