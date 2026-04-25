import { useMemo, useState } from 'react';
import type { CreateTaskInput, ProjectSummary } from '../lib/types';

type CreateTaskComposerProps = {
  availableCliTools: string[];
  selectedProject: ProjectSummary | null;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
};

function parseEnvVars(source: string): Record<string, string> {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split('=');
      if (!key || rest.length === 0) {
        return acc;
      }
      acc[key.trim()] = rest.join('=').trim();
      return acc;
    }, {});
}

function parseCliArgs(value: string): string[] {
  return value
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function CreateTaskComposer({ availableCliTools, selectedProject, onCreateTask }: CreateTaskComposerProps) {
  const [description, setDescription] = useState('');
  const [cliCommand, setCliCommand] = useState(availableCliTools[0] ?? 'codex');
  const [cliArgs, setCliArgs] = useState('');
  const [envVars, setEnvVars] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(selectedProject?.isLinked && description.trim() && cliCommand.trim()),
    [cliCommand, description, selectedProject],
  );

  return (
    <section className="panel composer-panel">
      <div className="panel-heading">
        <p className="eyebrow">Dispatch</p>
        <h2>Launch Task</h2>
        <p className="panel-copy">
          Dispatch only against a linked repository. Agent Kanban branches from the selected base,
          runs in a copied workspace, and keeps the source tree safe for review.
        </p>
      </div>

      <div className="form-stack">
        <label className="field">
          <span>Target project</span>
          <input readOnly value={selectedProject?.name ?? 'Select a concrete project'} />
        </label>

        <div className="detail-grid detail-grid--compact">
          <div className="detail-block">
            <span className="detail-label">Repository path</span>
            <p>{selectedProject?.path ?? 'Choose a linked repository from the sidebar.'}</p>
          </div>
          <div className="detail-block">
            <span className="detail-label">Base branch</span>
            <p>{selectedProject?.defaultBranch ?? 'main'}</p>
          </div>
          <div className="detail-block detail-block--wide">
            <span className="detail-label">Remote origin</span>
            <p>{selectedProject?.remoteUrl ?? 'Link this repository to verify an origin remote before dispatching tasks.'}</p>
          </div>
        </div>

        <label className="field">
          <span>Task description</span>
          <textarea
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the change you want the agent to make."
            rows={5}
            value={description}
          />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>CLI command</span>
            <input
              list="cli-tools"
              onChange={(event) => setCliCommand(event.target.value)}
              value={cliCommand}
            />
            <datalist id="cli-tools">
              {availableCliTools.map((tool) => (
                <option key={tool} value={tool} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>CLI args</span>
            <input
              onChange={(event) => setCliArgs(event.target.value)}
              placeholder="--sandbox workspace-write"
              value={cliArgs}
            />
          </label>
        </div>

        <label className="field">
          <span>Task env vars</span>
          <textarea
            onChange={(event) => setEnvVars(event.target.value)}
            placeholder={'OPENAI_API_KEY=...\nNODE_ENV=development'}
            rows={4}
            value={envVars}
          />
        </label>

        <button
          className="primary-button"
          disabled={!canSubmit || submitting}
          onClick={async () => {
            if (!selectedProject) {
              return;
            }

            setSubmitting(true);
            try {
              await onCreateTask({
                projectId: selectedProject.id,
                projectPath: selectedProject.path,
                baseBranch: selectedProject.defaultBranch,
                description,
                cliCommand,
                cliArgs: parseCliArgs(cliArgs),
                envVars: parseEnvVars(envVars),
              });
              setDescription('');
              setCliArgs('');
              setEnvVars('');
            } finally {
              setSubmitting(false);
            }
          }}
          type="button"
        >
          {submitting ? 'Dispatching...' : 'Launch Task'}
        </button>

        {!selectedProject ? <p className="empty-state">Pick a single linked project first. The global view is read-only for task creation.</p> : null}
        {selectedProject && !selectedProject.isLinked ? (
          <p className="empty-state">This repository was discovered, but it is not linked yet. Use the repository onboarding panel to activate task dispatch.</p>
        ) : null}
      </div>
    </section>
  );
}