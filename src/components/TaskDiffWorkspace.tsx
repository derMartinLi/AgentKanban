import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, FileCode2, X } from 'lucide-react';
import { Empty } from 'antd';
import { DiffPreview } from './DiffPreview';
import { parseUnifiedDiff } from '../lib/diff';
import type { TaskSummary } from '../lib/types';
import type { ThemeMode } from '../store/useAppStore';

type TaskDiffWorkspaceProps = {
  task: TaskSummary | null;
  theme: ThemeMode;
  onBack: () => void;
  onApprove: () => Promise<void>;
  onReject: (feedback: string) => Promise<void>;
};

export function TaskDiffWorkspace({ task, theme, onBack, onApprove, onReject }: TaskDiffWorkspaceProps) {
  const files = useMemo(() => parseUnifiedDiff(task?.diff), [task?.diff]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(files[0]?.id ?? null);
  const [feedback, setFeedback] = useState('Please revise the implementation and address the review notes.');
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0] ?? null;

  useEffect(() => {
    setSelectedFileId(files[0]?.id ?? null);
  }, [files]);

  return (
    <section className="diff-workspace">
      <header className="diff-workspace__header">
        <div className="diff-workspace__title">
          <button className="icon-button" onClick={onBack} type="button">
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="section-kicker">Diff Review</span>
            <h2>{task?.title ?? 'Review changes'}</h2>
            <p>
              <strong>{task?.baseBranch ?? 'main'}</strong>
              <span> vs </span>
              <strong>{task?.branchName ?? 'ai/branch'}</strong>
            </p>
          </div>
        </div>

        <div className="diff-workspace__actions">
          <button className="secondary-button" onClick={() => void onReject(feedback)} type="button">
            <X size={16} />
            <span>Reject</span>
          </button>
          <button className="primary-button" onClick={() => void onApprove()} type="button">
            <Check size={16} />
            <span>Merge</span>
          </button>
        </div>
      </header>

      {files.length === 0 ? (
        <div className="diff-workspace__empty">
          <Empty description="No diff captured for this task yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div className="diff-workspace__body">
          <aside className="diff-files">
            <div className="diff-files__header">
              <span>Changed files</span>
              <strong>{files.length}</strong>
            </div>

            <div className="diff-files__list">
              {files.map((file) => (
                <button
                  key={file.id}
                  className={selectedFile?.id === file.id ? 'diff-file diff-file--active' : 'diff-file'}
                  onClick={() => setSelectedFileId(file.id)}
                  type="button"
                >
                  <div className="diff-file__name">
                    <FileCode2 size={14} />
                    <span>{file.displayPath}</span>
                  </div>
                  <div className="diff-file__stats">
                    <span className="diff-file__additions">+{file.additions}</span>
                    <span className="diff-file__deletions">-{file.deletions}</span>
                  </div>
                </button>
              ))}
            </div>

            <label className="field">
              <span>Reject reason</span>
              <textarea onChange={(event) => setFeedback(event.target.value)} rows={5} value={feedback} />
            </label>
          </aside>

          <div className="diff-viewer">
            <div className="diff-viewer__toolbar">
              <span>{selectedFile?.displayPath ?? 'Diff preview'}</span>
              <div className="diff-viewer__legend">
                <span className="diff-dot diff-dot--remove" />
                <span>main</span>
                <span className="diff-dot diff-dot--add" />
                <span>{task?.branchName ?? 'workspace'}</span>
              </div>
            </div>

            <DiffPreview file={selectedFile} height="100%" theme={theme} />
          </div>
        </div>
      )}
    </section>
  );
}
