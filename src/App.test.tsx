import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { resetAppStore, useAppStore } from './store/useAppStore';

describe('App', () => {
  it('renders the IDE-style shell with project navigation and task actions', () => {
    resetAppStore();

    useAppStore.getState().hydrateProjects([
      { id: 'alpha', name: 'Alpha', path: 'C:/alpha', defaultBranch: 'main', isLinked: true },
      { id: 'beta', name: 'Beta', path: 'C:/beta', defaultBranch: 'main', isLinked: true },
    ]);

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'All Projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link repo/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /new task/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /all projects/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beta/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /execution flow/i })).toBeInTheDocument();
  });
});
