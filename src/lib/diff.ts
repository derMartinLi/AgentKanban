export type ParsedDiffFile = {
  id: string;
  oldPath: string;
  newPath: string;
  displayPath: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  before: string;
  after: string;
  patch: string;
};

function normalizePath(path: string): string {
  return path.replace(/^a\//, '').replace(/^b\//, '');
}

function finalizeFile(section: string[]): ParsedDiffFile | null {
  if (section.length === 0) {
    return null;
  }

  const header = section[0].match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!header) {
    return null;
  }

  const [, oldRawPath, newRawPath] = header;
  let oldPath = normalizePath(oldRawPath);
  let newPath = normalizePath(newRawPath);
  let status: ParsedDiffFile['status'] = 'modified';
  let additions = 0;
  let deletions = 0;
  const before: string[] = [];
  const after: string[] = [];
  let inHunk = false;

  for (const line of section.slice(1)) {
    if (line.startsWith('rename from ')) {
      oldPath = line.slice('rename from '.length).trim();
      status = 'renamed';
      continue;
    }

    if (line.startsWith('rename to ')) {
      newPath = line.slice('rename to '.length).trim();
      status = 'renamed';
      continue;
    }

    if (line.startsWith('new file mode ')) {
      status = 'added';
      continue;
    }

    if (line.startsWith('deleted file mode ')) {
      status = 'deleted';
      continue;
    }

    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }

    if (!inHunk || line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    if (line.startsWith('+')) {
      additions += 1;
      after.push(line.slice(1));
      continue;
    }

    if (line.startsWith('-')) {
      deletions += 1;
      before.push(line.slice(1));
      continue;
    }

    if (line.startsWith(' ')) {
      const content = line.slice(1);
      before.push(content);
      after.push(content);
      continue;
    }
  }

  const displayPath = status === 'renamed' ? `${oldPath} -> ${newPath}` : newPath;

  return {
    id: `${oldPath}:${newPath}`,
    oldPath,
    newPath,
    displayPath,
    status,
    additions,
    deletions,
    before: before.join('\n'),
    after: after.join('\n'),
    patch: section.join('\n'),
  };
}

export function parseUnifiedDiff(diff: string | undefined): ParsedDiffFile[] {
  if (!diff?.trim()) {
    return [];
  }

  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current.length > 0) {
        sections.push(current);
      }
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    sections.push(current);
  }

  const files = sections
    .map((section) => finalizeFile(section))
    .filter((file): file is ParsedDiffFile => file != null);

  if (files.length > 0) {
    return files;
  }

  return [
    {
      id: 'full-diff',
      oldPath: 'main',
      newPath: 'workspace',
      displayPath: 'Captured diff',
      status: 'modified',
      additions: 0,
      deletions: 0,
      before: '',
      after: diff,
      patch: diff,
    },
  ];
}
