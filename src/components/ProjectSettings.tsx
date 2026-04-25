import { useEffect, useState } from 'react';
import type { HarnessConfig, ProjectSummary } from '../lib/types';

type ProjectSettingsProps = {
  project: ProjectSummary | null;
  settings: HarnessConfig | null;
  onSave: (config: HarnessConfig) => Promise<void>;
};

function parseLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseMap(value: string): Record<string, string> {
  return parseLines(value).reduce<Record<string, string>>((acc, line) => {
    const [key, ...rest] = line.split('=');
    if (!key || rest.length === 0) {
      return acc;
    }
    acc[key.trim()] = rest.join('=').trim();
    return acc;
  }, {});
}

export function ProjectSettings({ project, settings, onSave }: ProjectSettingsProps) {
  const [form, setForm] = useState<HarnessConfig | null>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (!project || !form) {
    return <p className="empty-state">Select a concrete project to edit harness and guardrail settings.</p>;
  }

  if (!project.isLinked) {
    return <p className="empty-state">Link this repository before editing harness and guardrail settings.</p>;
  }

  return (
    <div className="form-stack">
      <div className="detail-block detail-block--wide">
        <span className="detail-label">Linked repository</span>
        <p>
          {project.path} on {project.defaultBranch}
        </p>
      </div>

      <div className="detail-block detail-block--wide">
        <span className="detail-label">Remote origin</span>
        <p>{project.remoteUrl ?? 'Origin verified during desktop registration.'}</p>
      </div>

      <label className="field">
        <span>Resource files</span>
        <textarea
          onChange={(event) => setForm({ ...form, resourceFiles: parseLines(event.target.value) })}
          rows={4}
          value={form.resourceFiles.join('\n')}
        />
      </label>

      <label className="field">
        <span>Guardrail commands</span>
        <textarea
          onChange={(event) => setForm({ ...form, guardrailCommands: parseLines(event.target.value) })}
          rows={4}
          value={form.guardrailCommands.join('\n')}
        />
      </label>

      <label className="field">
        <span>Environment variable set</span>
        <textarea
          onChange={(event) => setForm({ ...form, envVars: parseMap(event.target.value) })}
          rows={4}
          value={Object.entries(form.envVars)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n')}
        />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Max concurrency</span>
          <input
            min={1}
            onChange={(event) => setForm({ ...form, maxConcurrency: Number(event.target.value) || 1 })}
            type="number"
            value={form.maxConcurrency}
          />
        </label>

        <label className="field">
          <span>Max retries</span>
          <input
            min={0}
            onChange={(event) => setForm({ ...form, maxRetries: Number(event.target.value) || 0 })}
            type="number"
            value={form.maxRetries}
          />
        </label>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Review command</span>
          <input
            onChange={(event) => setForm({ ...form, reviewCommand: event.target.value })}
            placeholder="codex review"
            value={form.reviewCommand}
          />
        </label>

        <label className="field">
          <span>Question timeout (sec)</span>
          <input
            min={10}
            onChange={(event) => setForm({ ...form, questionTimeoutSecs: Number(event.target.value) || 10 })}
            type="number"
            value={form.questionTimeoutSecs}
          />
        </label>
      </div>

      <button className="primary-button" onClick={() => void onSave(form)} type="button">
        Save Project Settings
      </button>
    </div>
  );
}