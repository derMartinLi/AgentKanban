import { useState } from 'react';

type ProjectOnboardingPanelProps = {
  isRegistering: boolean;
  registrationError: string | null;
  onRegisterProject: (repositoryPath: string) => Promise<void>;
  projectRoot?: string;
  linkedProjectCount?: number;
  previewMode?: boolean;
};

export function ProjectOnboardingPanel({
  isRegistering,
  registrationError,
  onRegisterProject,
  projectRoot,
  linkedProjectCount,
  previewMode,
}: ProjectOnboardingPanelProps) {
  const [repositoryPath, setRepositoryPath] = useState('');

  return (
    <section className="panel onboarding-panel">
      <div className="panel-heading">
        <p className="eyebrow">Repository Onboarding</p>
        <h2>{previewMode ? 'Preview Repository Card' : 'Link Repository'}</h2>
        <p className="panel-copy">
          {previewMode
            ? 'Browser preview mode cannot validate Git metadata. You can stage the UI here, but only the desktop app can create linked, dispatchable projects.'
            : 'Register the repository once, then dispatch tasks into isolated copies, dedicated branches, and the existing review and acceptance flow.'}
        </p>
      </div>

      <div className="metric-row">
        <div className="metric-tile">
          <span className="metric-label">Linked repos</span>
          <strong>{linkedProjectCount ?? 0}</strong>
        </div>
        <div className="metric-tile metric-tile--wide">
          <span className="metric-label">Discovery root</span>
          <strong>{projectRoot || 'Set by desktop runtime'}</strong>
        </div>
      </div>

      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!repositoryPath.trim()) {
            return;
          }
          try {
            await onRegisterProject(repositoryPath.trim());
            setRepositoryPath('');
          } catch {
            // Keep the typed path so the user can correct a typo instead of re-entering it.
          }
        }}
      >
        <p className="empty-state">
          Every project in Agent Kanban is backed by a git repository so tasks can copy the repo,
          branch safely, and flow through review and acceptance.
        </p>

        <label className="field">
          <span>Git repository path</span>
          <input
            onChange={(event) => setRepositoryPath(event.target.value)}
            placeholder="C:/repos/your-project"
            value={repositoryPath}
          />
        </label>

        {registrationError ? <p className="error-text">{registrationError}</p> : null}

        <button
          className="primary-button"
          disabled={isRegistering || !repositoryPath.trim()}
          type="submit"
        >
          {isRegistering ? 'Linking...' : previewMode ? 'Add Preview Entry' : 'Link Repository'}
        </button>
      </form>
    </section>
  );
}