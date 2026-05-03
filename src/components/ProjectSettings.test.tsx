import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSettings } from './ProjectSettings';

describe('ProjectSettings', () => {
  it('saves Semgrep settings alongside the rest of the harness config', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ProjectSettings
        onSave={onSave}
        project={{
          id: 'alpha',
          name: 'Alpha',
          path: 'C:/alpha',
          defaultBranch: 'main',
          isLinked: true,
          remoteUrl: 'git@github.com:example/alpha.git',
        }}
        settings={{
          envVars: {},
          resourceFiles: [],
          guardrailCommands: ['pnpm test'],
          maxConcurrency: 2,
          maxRetries: 2,
          reviewCommand: '',
          semgrepEnabled: false,
          semgrepConfig: 'auto',
          questionTimeoutSecs: 120,
        }}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /semgrep guardrail/i }));
    await user.clear(screen.getByLabelText(/semgrep config/i));
    await user.type(screen.getByLabelText(/semgrep config/i), 'p/security-audit');
    await user.click(screen.getByRole('button', { name: /save project settings/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        semgrepEnabled: true,
        semgrepConfig: 'p/security-audit',
      }),
    );
  });
});