import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { resetAppStore, useAppStore } from './store/useAppStore';

describe('App', () => {
  it('renders the multi-project shell with a global view by default', () => {
    resetAppStore();

    useAppStore.getState().hydrateProjects([
      { id: 'alpha', name: 'Alpha', path: 'C:/alpha', defaultBranch: 'main' },
      { id: 'beta', name: 'Beta', path: 'C:/beta', defaultBranch: 'main' },
    ]);

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Agent Kanban' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all projects/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beta/i })).toBeInTheDocument();
  });
});