import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SmokeManifest = {
  sourceRepo: string;
  projectId: string;
  agentScript: string;
  answerDescription: string;
  timeoutDescription: string;
  expectedFeatureFile: string;
  tasksFile: string;
  workspacesRoot: string;
  scanRoot: string;
};

const manifest = JSON.parse(
  readFileSync(resolve('.tmp/http-smoke/manifest.json'), 'utf8'),
) as SmokeManifest;

test('browser mode smoke covers HTTP + WebSocket task flow', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /attach a git workspace/i })).toBeVisible();

  await page.getByRole('textbox', { name: 'Directory to scan' }).fill(manifest.scanRoot);
  await page.getByRole('button', { name: /scan directory/i }).click();

  await expect(page.getByRole('button', { name: /^link$/i })).toBeVisible();
  await page.getByRole('button', { name: /^link$/i }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'alpha-app' })).toBeVisible();

  await createTask(page, manifest.answerDescription);

  await expect(page.getByRole('heading', { name: 'Apply generated change?' })).toBeVisible();
  await page.getByRole('button', { name: /^approve$/ }).click();

  const approveTaskButton = page.locator('.detail-panel__actions').getByRole('button', { name: /^Approve$/i });
  await expect(approveTaskButton).toBeEnabled();
  await approveTaskButton.click();
  await expect(page.getByText(/^COMPLETED$/).first()).toBeVisible();

  await expect.poll(() => readNormalized(manifest.expectedFeatureFile)).toBe('approved change\n');
  await expect.poll(() => answerTaskState().status).toBe('COMPLETED');
  await expect.poll(() => answerTaskState().workspacePath).toBe(null);

  await createTask(page, manifest.timeoutDescription);

  await expect(page.getByRole('heading', { name: 'Need approval' })).toBeVisible();
  await expect(page.getByText(/Question timed out after 5 seconds/)).toBeVisible();
  await expect.poll(() => timeoutTaskState().status).toBe('FAILED');
  await expect.poll(() => timeoutTaskState().latestError).toBe('Question timed out after 5 seconds');
});

async function createTask(page: Page, description: string) {
  await page.getByRole('button', { name: 'New Task' }).first().click();
  await page.getByRole('textbox', { name: 'Task description' }).fill(description);
  await page.getByRole('combobox', { name: /CLI tool/i }).fill('node');
  await page.getByRole('textbox', { name: 'CLI args' }).fill(manifest.agentScript);
  await page.getByRole('button', { name: 'Start Task' }).click();
}

function answerTaskState() {
  return readTaskByDescription(manifest.answerDescription);
}

function timeoutTaskState() {
  return readTaskByDescription(manifest.timeoutDescription);
}

function readTaskByDescription(description: string) {
  const tasks = JSON.parse(readFileSync(manifest.tasksFile, 'utf8')) as Array<Record<string, unknown>>;
  const task = tasks.find((entry) => entry.description === description);
  if (!task) {
    throw new Error(`Task not found for description: ${description}`);
  }

  return {
    status: String(task.status),
    workspacePath: task.workspace_path === null || task.workspace_path === undefined ? null : String(task.workspace_path),
    latestError: task.latest_error === null || task.latest_error === undefined ? null : String(task.latest_error),
  };
}

function readNormalized(filePath: string) {
  if (!existsSync(filePath)) {
    return '';
  }

  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}