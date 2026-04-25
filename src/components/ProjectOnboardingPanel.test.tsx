import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectOnboardingPanel } from './ProjectOnboardingPanel';

afterEach(() => {
  cleanup();
});

describe('ProjectOnboardingPanel', () => {
  it('submits a linked git repository path', async () => {
    const user = userEvent.setup();
    const onRegisterProject = vi.fn().mockResolvedValue(undefined);

    render(
      <ProjectOnboardingPanel
        isRegistering={false}
        onRegisterProject={onRegisterProject}
        registrationError={null}
      />,
    );

    await user.type(screen.getByLabelText(/git repository path/i), 'C:/repos/agent-kanban');
    await user.click(screen.getByRole('button', { name: /link repository/i }));

    expect(onRegisterProject).toHaveBeenCalledWith('C:/repos/agent-kanban');
  });

  it('explains that every project must point to a git repository', () => {
    render(
      <ProjectOnboardingPanel
        isRegistering={false}
        onRegisterProject={vi.fn()}
        registrationError={null}
      />,
    );

    expect(screen.getByText(/every project in agent kanban is backed by a git repository/i)).toBeInTheDocument();
  });

  it('keeps the repository path visible when registration fails', async () => {
    const user = userEvent.setup();

    render(
      <ProjectOnboardingPanel
        isRegistering={false}
        onRegisterProject={vi.fn().mockRejectedValue(new Error('missing origin'))}
        registrationError="missing origin"
      />,
    );

    const input = screen.getByLabelText(/git repository path/i);

    await user.type(input, 'C:/repos/missing-origin');
    await user.click(screen.getByRole('button', { name: /link repository/i }));

    expect(input).toHaveValue('C:/repos/missing-origin');
  });
});