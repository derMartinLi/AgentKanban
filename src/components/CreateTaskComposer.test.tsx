import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateTaskComposer } from './CreateTaskComposer';

describe('CreateTaskComposer', () => {
  it('applies a task template into the description before creating a task', async () => {
    const user = userEvent.setup();
    const onCreateTask = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateTaskComposer
        availableCliTools={['codex']}
        currentProjectId="alpha"
        onClose={vi.fn()}
        onCreateTask={onCreateTask}
        open
        projects={[
          {
            id: 'alpha',
            name: 'Alpha',
            path: 'C:/alpha',
            defaultBranch: 'main',
            isLinked: true,
          },
        ]}
        templates={[
          {
            id: 'bugfix',
            title: 'Bugfix Template',
            description: 'Investigate the regression and add a focused fix.',
          },
        ]}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/task template/i), 'bugfix');
    expect(screen.getByLabelText(/task description/i)).toHaveValue(
      'Investigate the regression and add a focused fix.',
    );

    await user.click(screen.getByRole('button', { name: /start task/i }));

    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Investigate the regression and add a focused fix.',
      }),
    );
  });
});