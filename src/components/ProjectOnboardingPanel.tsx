import { useState } from 'react';
import { FolderPlus, GitBranch, Link2 } from 'lucide-react';

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
    <section className="setup-panel">
      <div className="setup-panel__header">
        <span className="section-kicker">Link Repository</span>
        <h2>{previewMode ? 'Preview repository onboarding' : 'Attach a git workspace'}</h2>
        <p>
          Every project in Agent Kanban is backed by a git repository so tasks can copy the repo,
          branch safely, and flow through review and acceptance.
        </p>
      </div>

      <div className="setup-panel__stats">
        <div className="setup-panel__stat">
          <FolderPlus size={16} />
          <div>
            <span>Linked repos</span>
            <strong>{linkedProjectCount ?? 0}</strong>
          </div>
        </div>
        <div className="setup-panel__stat">
          <GitBranch size={16} />
          <div>
            <span>Discovery root</span>
            <strong>{projectRoot || 'Set by desktop runtime'}</strong>
          </div>
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
            // Keep the typed path visible for quick fixes.
          }
        }}
      >
        <label className="field">
          <span>Git repository path</span>
          <input
            onChange={(event) => setRepositoryPath(event.target.value)}
            placeholder="C:/repos/your-project"
            value={repositoryPath}
          />
        </label>

        {previewMode ? (
          <p className="inline-note">
            Browser preview can stage the UI, but only the desktop runtime can validate git metadata.
          </p>
        ) : (
          <p className="inline-note">
            We verify branch and remote metadata up front so later task dispatch stays predictable.
          </p>
        )}

        {registrationError ? <p className="error-text">{registrationError}</p> : null}

        <button
          className="primary-button primary-button--wide"
          disabled={isRegistering || !repositoryPath.trim()}
          type="submit"
        >
          <Link2 size={16} />
          <span>{isRegistering ? 'Linking...' : previewMode ? 'Add Preview Entry' : 'Link Repository'}</span>
        </button>
      </form>
    </section>
  );
}
