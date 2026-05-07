import { DiffEditor } from '@monaco-editor/react';
import type { ParsedDiffFile } from '../lib/diff';
import type { ThemeMode } from '../store/useAppStore';

type DiffPreviewProps = {
  file: ParsedDiffFile | null;
  theme: ThemeMode;
  height?: number | string;
};

function inferLanguage(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  switch (extension) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'rs':
      return 'rust';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'md':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'html':
      return 'html';
    default:
      return 'plaintext';
  }
}

export function DiffPreview({ file, theme, height = 320 }: DiffPreviewProps) {
  if (!file) {
    return <p className="empty-state">No diff captured yet.</p>;
  }

  if (typeof window === 'undefined') {
    return <pre className="code-block">{file.patch}</pre>;
  }

  return (
    <div className="diff-preview">
      <DiffEditor
        height={height}
        language={inferLanguage(file.newPath || file.oldPath)}
        modified={file.after || file.patch}
        options={{
          automaticLayout: true,
          fontSize: 12,
          minimap: { enabled: false },
          originalEditable: false,
          readOnly: true,
          renderOverviewRuler: false,
          scrollBeyondLastLine: false,
        }}
        original={file.before}
        theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      />
    </div>
  );
}
