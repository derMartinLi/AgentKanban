import { useEffect, useRef } from 'react';

type DiffPreviewProps = {
  diff: string | undefined;
};

export function DiffPreview({ diff }: DiffPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let editor: any = null;
    let originalModel: any = null;
    let modifiedModel: any = null;

    async function setup() {
      if (!hostRef.current || !diff || typeof window === 'undefined') {
        return;
      }

      const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
      editor = monaco.editor.createDiffEditor(hostRef.current, {
        automaticLayout: true,
        fontSize: 12,
        minimap: { enabled: false },
        readOnly: true,
      });
      originalModel = monaco.editor.createModel('', 'text/plain');
      modifiedModel = monaco.editor.createModel(diff, 'diff');
      if (editor) {
        editor.setModel({ original: originalModel, modified: modifiedModel });
      }
    }

    void setup();

    return () => {
      editor?.dispose();
      originalModel?.dispose();
      modifiedModel?.dispose();
    };
  }, [diff]);

  if (!diff) {
    return <p className="empty-state">No diff captured yet.</p>;
  }

  if (typeof window === 'undefined') {
    return <pre className="code-block">{diff}</pre>;
  }

  return <div className="diff-surface" ref={hostRef} />;
}