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
        discoveredProjects={[]}
        isDiscovering={false}
        isRegistering={false}
        onDiscoverProjects={vi.fn()}
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
        discoveredProjects={[]}
        isDiscovering={false}
        isRegistering={false}
        onDiscoverProjects={vi.fn()}
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
        discoveredProjects={[]}
        isDiscovering={false}
        isRegistering={false}
        onDiscoverProjects={vi.fn()}
        onRegisterProject={vi.fn().mockRejectedValue(new Error('missing origin'))}
        registrationError="missing origin"
      />,
    );

    const input = screen.getByLabelText(/git repository path/i);

    await user.type(input, 'C:/repos/missing-origin');
    await user.click(screen.getByRole('button', { name: /link repository/i }));

    expect(input).toHaveValue('C:/repos/missing-origin');
  });

  it('scans a directory and can link a discovered repository', async () => {
    const user = userEvent.setup();
    const onDiscoverProjects = vi.fn().mockResolvedValue(undefined);
    const onRegisterProject = vi.fn().mockResolvedValue(undefined);

    render(
      <ProjectOnboardingPanel
        discoveredProjects={[
          {
            id: 'alpha',
            name: 'Alpha',
            path: 'C:/repos/alpha',
            defaultBranch: 'main',
            isLinked: false,
            remoteUrl: 'git@github.com:example/alpha.git',
          },
        ]}
        isDiscovering={false}
        isRegistering={false}
        onDiscoverProjects={onDiscoverProjects}
        onRegisterProject={onRegisterProject}
        projectRoot="C:/repos"
        registrationError={null}
      />,
    );

    await user.clear(screen.getByLabelText(/directory to scan/i));
    await user.type(screen.getByLabelText(/directory to scan/i), 'C:/workspaces');
    await user.click(screen.getByRole('button', { name: /scan directory/i }));
    await user.click(screen.getByRole('button', { name: /^link$/i }));

    expect(onDiscoverProjects).toHaveBeenCalledWith('C:/workspaces');
    expect(onRegisterProject).toHaveBeenCalledWith('C:/repos/alpha');
  });
});