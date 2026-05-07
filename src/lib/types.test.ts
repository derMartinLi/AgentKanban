import { describe, expect, it } from 'vitest';
import { isTerminalTaskStatus, TASK_STATUS_ORDER } from './types';

describe('task status contracts', () => {
  it('keeps the milestone 1 workflow order stable', () => {
    expect(TASK_STATUS_ORDER).toEqual([
      'PENDING',
      'EXECUTING',
      'WAITING_FOR_INPUT',
      'GUARDRAIL_CHECK',
      'NEEDS_REVISION',
      'BLOCKED',
      'AI_REVIEW',
      'AWAITING_ACCEPTANCE',
      'FAILED',
      'COMPLETED',
    ]);
    expect(isTerminalTaskStatus('FAILED')).toBe(true);
    expect(isTerminalTaskStatus('EXECUTING')).toBe(false);
  });
});