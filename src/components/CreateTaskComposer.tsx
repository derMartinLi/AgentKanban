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
    () => Boolean(selectedProject && description.trim() && cliCommand.trim()),
    [cliCommand, description, selectedProject],
  );

  return (
    <section className="panel composer-panel">
      <div className="panel-heading">
        <p className="eyebrow">Dispatch</p>
        <h2>Create Task</h2>
      </div>

      <div className="form-stack">
        <label className="field">
          <span>Target project</span>
          <input readOnly value={selectedProject?.name ?? 'Select a concrete project'} />
        </label>

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
          {submitting ? 'Dispatching...' : 'Dispatch Task'}
        </button>
      </div>
    </section>
  );
}