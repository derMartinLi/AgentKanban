import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve('.tmp/http-smoke');
const storageRoot = join(root, 'storage');
const scanRoot = join(root, 'scan-root');
const scriptsRoot = join(root, 'scripts');
const upstream = join(root, 'upstream.git');
const sourceRepo = join(scanRoot, 'alpha-app');
const agentScript = join(scriptsRoot, 'fake-agent.cjs');
const reviewScript = join(scriptsRoot, 'review.js');
const projectId = projectIdFromPath(sourceRepo);

rmSync(root, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });
mkdirSync(scanRoot, { recursive: true });
mkdirSync(scriptsRoot, { recursive: true });

git(root, ['init', '--bare', '--initial-branch=main', upstream]);
git(scanRoot, ['init', '--initial-branch=main', sourceRepo]);
git(sourceRepo, ['config', 'user.name', 'Smoke Test']);
git(sourceRepo, ['config', 'user.email', 'smoke@example.com']);

writeFileSync(join(sourceRepo, 'README.md'), '# HTTP Smoke\n');
writeFileSync(agentScript, fakeAgentScript());
writeFileSync(reviewScript, "console.log('Review ok')\n");

git(sourceRepo, ['add', 'README.md']);
git(sourceRepo, ['commit', '-m', 'initial']);
git(sourceRepo, ['remote', 'add', 'origin', upstream]);
git(sourceRepo, ['push', '-u', 'origin', 'main']);

seedHarnessConfig();
writeManifest();

function git(cwd, args) {
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
  });
}

function seedHarnessConfig() {
  const configPath = join(storageRoot, 'projects', projectId, 'harness.yaml');
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        env_vars: {},
        resource_files: [],
        guardrail_commands: [],
        max_concurrency: 2,
        max_retries: 2,
        review_command: `node "${normalizePath(reviewScript)}"`,
        semgrep_enabled: false,
        semgrep_config: 'auto',
        question_timeout_secs: 5,
      },
      null,
      2,
    ),
  );
}

function writeManifest() {
  writeFileSync(
    join(root, 'manifest.json'),
    JSON.stringify(
      {
        root,
        storageRoot,
        scanRoot,
        sourceRepo,
        projectId,
        agentScript: normalizePath(agentScript),
        answerDescription: 'ANSWER FLOW - implement feature file',
        timeoutDescription: 'TIMEOUT FLOW - wait for operator forever',
        expectedFeatureFile: join(sourceRepo, 'feature.txt'),
        tasksFile: join(storageRoot, 'projects', projectId, 'tasks.json'),
        workspacesRoot: join(storageRoot, 'workspaces'),
      },
      null,
      2,
    ),
  );
}

function projectIdFromPath(projectPath) {
  const normalized = String(projectPath);
  let key = '';

  for (const ch of normalized) {
    if (/^[a-z0-9]$/i.test(ch)) {
      key += ch.toLowerCase();
    } else if (!key.endsWith('-')) {
      key += '-';
    }
  }

  key = key.replace(/^-+|-+$/g, '');
  return key || 'project';
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function fakeAgentScript() {
  return `const fs = require('fs');
const prompt = process.argv[2] ?? '';

if (prompt.includes('ANSWER FLOW')) {
  console.log('___QUESTION___' + JSON.stringify({ q: 'Apply generated change?', opts: ['approve'] }));
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', (data) => {
    const reply = data.trim();
    if (reply !== 'approve') {
      console.error('unexpected reply: ' + reply);
      process.exit(1);
      return;
    }

    fs.writeFileSync('feature.txt', 'approved change\\n');
    console.log('implemented');
    process.exit(0);
  });
  process.stdin.resume();
} else if (prompt.includes('TIMEOUT FLOW')) {
  console.log('___QUESTION___' + JSON.stringify({ q: 'Need approval', opts: ['approve'] }));
  process.stdin.resume();
  setInterval(() => {}, 1000);
} else {
  fs.writeFileSync('feature.txt', 'default\\n');
  process.exit(0);
}
`;
}