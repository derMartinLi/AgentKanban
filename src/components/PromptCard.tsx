import { useEffect, useState } from 'react';
import { CornerDownRight, MessageSquareWarning } from 'lucide-react';
import type { TaskQuestion } from '../lib/types';

type PromptCardProps = {
  question: TaskQuestion | null;
  onAnswer: (reply: string) => void;
  onDismiss: () => void;
};

export function PromptCard({ question, onAnswer, onDismiss }: PromptCardProps) {
  const [freeform, setFreeform] = useState('');

  useEffect(() => {
    setFreeform('');
  }, [question?.taskId]);

  if (!question) {
    return null;
  }

  return (
    <div className="prompt-dock" role="dialog" aria-labelledby="prompt-title" aria-modal="false">
      <div className="prompt-dock__header">
        <div>
          <span className="section-kicker">Waiting For Input</span>
          <h2 id="prompt-title">{question.q}</h2>
        </div>
        <MessageSquareWarning size={18} />
      </div>

      <div className="prompt-dock__options">
        {question.opts.map((option) => (
          <button key={option} className="secondary-button" onClick={() => onAnswer(option)} type="button">
            {option}
          </button>
        ))}
      </div>

      {question.allowFreeform ? (
        <div className="prompt-dock__freeform">
          <textarea
            onChange={(event) => setFreeform(event.target.value)}
            placeholder="Type your answer..."
            rows={3}
            value={freeform}
          />
          <button
            className="primary-button"
            disabled={!freeform.trim()}
            onClick={() => onAnswer(freeform)}
            type="button"
          >
            <CornerDownRight size={14} />
            <span>Submit</span>
          </button>
        </div>
      ) : null}

      <button className="ghost-link" onClick={onDismiss} type="button">
        Dismiss for now
      </button>
    </div>
  );
}
