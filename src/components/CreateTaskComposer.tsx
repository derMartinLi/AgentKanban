import { useEffect, useMemo, useState } from 'react';
import { AutoComplete, Button, Drawer, Empty, Input, Select } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import type { CreateTaskInput, ProjectSummary } from '../lib/types';

type EnvVarRow = {
  key: string;
  value: string;
};

type CreateTaskComposerProps = {
  open: boolean;
  onClose: () => void;
  availableCliTools: string[];
  projects: ProjectSummary[];
  currentProjectId: string;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
};

function parseCliArgs(value: string): string[] {
  return value
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

function toEnvRecord(rows: EnvVarRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((acc, row) => {
    if (!row.key.trim()) {
      return acc;
    }

    acc[row.key.trim()] = row.value;
    return acc;
  }, {});
}

export function CreateTaskComposer({
  open,
  onClose,
  availableCliTools,
  projects,
  currentProjectId,
  onCreateTask,
}: CreateTaskComposerProps) {
  const linkedProjects = useMemo(() => projects.filter((project) => project.isLinked), [projects]);
  const preferredProjectId = useMemo(() => {
    if (linkedProjects.some((project) => project.id === currentProjectId)) {
      return currentProjectId;
    }

    return linkedProjects[0]?.id ?? undefined;
  }, [currentProjectId, linkedProjects]);

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(preferredProjectId);
  const [description, setDescription] = useState('');
  const [cliCommand, setCliCommand] = useState(availableCliTools[0] ?? 'codex');
  const [cliArgs, setCliArgs] = useState('');
  const [envVars, setEnvVars] = useState<EnvVarRow[]>([{ key: '', value: '' }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedProjectId(preferredProjectId);
    setCliCommand(availableCliTools[0] ?? 'codex');
  }, [availableCliTools, open, preferredProjectId]);

  const selectedProject = linkedProjects.find((project) => project.id === selectedProjectId) ?? null;
  const canSubmit = Boolean(selectedProject && description.trim() && cliCommand.trim());

  return (
    <Drawer
      className="task-composer-drawer"
      closable
      onClose={onClose}
      open={open}
      placement="right"
      title="New Task"
    >
      {linkedProjects.length === 0 ? (
        <div className="drawer-empty-state">
          <Empty description="Link a repository before creating a task." image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div className="drawer-stack">
          <div className="drawer-intro">
            <span className="section-kicker">Task Composer</span>
            <h2>Start a new agent run</h2>
            <p>Choose a linked project, a CLI profile, and the task brief the agent should execute.</p>
          </div>

          <label className="field">
            <span>Project</span>
            <Select
              onChange={setSelectedProjectId}
              options={linkedProjects.map((project) => ({
                label: project.name,
                value: project.id,
              }))}
              placeholder="Select project"
              value={selectedProjectId}
            />
          </label>

          <div className="detail-grid detail-grid--compact">
            <div className="detail-block">
              <span className="detail-label">Base branch</span>
              <p>{selectedProject?.defaultBranch ?? 'main'}</p>
            </div>
            <div className="detail-block detail-block--wide">
              <span className="detail-label">Repository path</span>
              <p>{selectedProject?.path ?? 'Select a project first.'}</p>
            </div>
          </div>

          <label className="field">
            <span>Task description</span>
            <Input.TextArea
              autoSize={{ minRows: 6, maxRows: 10 }}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the implementation, expected output, and acceptance hints."
              value={description}
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>CLI tool</span>
              <AutoComplete
                onChange={setCliCommand}
                options={availableCliTools.map((tool) => ({ label: tool, value: tool }))}
                placeholder="Choose detected tool or type your own"
                value={cliCommand}
              />
            </label>

            <label className="field">
              <span>CLI args</span>
              <Input
                onChange={(event) => setCliArgs(event.target.value)}
                placeholder="--sandbox workspace-write"
                value={cliArgs}
              />
            </label>
          </div>

          <div className="field">
            <span>Environment variables</span>
            <div className="env-table">
              {envVars.map((row, index) => (
                <div key={`${index}-${row.key}`} className="env-table__row">
                  <Input
                    onChange={(event) =>
                      setEnvVars((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, key: event.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="KEY"
                    value={row.key}
                  />
                  <Input
                    onChange={(event) =>
                      setEnvVars((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, value: event.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="VALUE"
                    value={row.value}
                  />
                  <button
                    aria-label={`Delete env var ${index + 1}`}
                    className="icon-button"
                    onClick={() => setEnvVars((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                className="secondary-button"
                onClick={() => setEnvVars((current) => [...current, { key: '', value: '' }])}
                type="button"
              >
                <Plus size={14} />
                <span>Add variable</span>
              </button>
            </div>
          </div>

          <div className="drawer-actions">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              loading={submitting}
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
                    envVars: toEnvRecord(envVars),
                  });
                  setDescription('');
                  setCliArgs('');
                  setEnvVars([{ key: '', value: '' }]);
                  onClose();
                } finally {
                  setSubmitting(false);
                }
              }}
              type="primary"
              disabled={!canSubmit}
            >
              Start Task
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
