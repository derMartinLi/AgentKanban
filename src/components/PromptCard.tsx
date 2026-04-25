import { type TaskQuestion } from '../lib/types';

type PromptCardProps = {
  question: TaskQuestion | null;
  onAnswer: (reply: string) => void;
  onDismiss: () => void;
};

export function PromptCard({ question, onAnswer, onDismiss }: PromptCardProps) {
  if (!question) {
    return null;
  }

  return (
    <div className="prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
      <div className="prompt-card">
        <p className="eyebrow">Needs Input</p>
        <h2 id="prompt-title">{question.q}</h2>
        <div className="prompt-options">
          {question.opts.map((option) => (
            <button key={option} className="project-pill" onClick={() => onAnswer(option)} type="button">
              {option}
            </button>
          ))}
        </div>
        <button className="ghost-button" onClick={onDismiss} type="button">
          Dismiss for now
        </button>
      </div>
    </div>
  );
}