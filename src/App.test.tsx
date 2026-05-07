import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { resetAppStore, useAppStore } from './store/useAppStore';

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

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

  it('uses a drawer trigger instead of the inline sidebar on compact layouts', () => {
    resetAppStore();

    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 900px') || query.includes('dark'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    useAppStore.getState().hydrateProjects([
      { id: 'alpha', name: 'Alpha', path: 'C:/alpha', defaultBranch: 'main', isLinked: true },
    ]);

    const { container } = render(<App />);

    expect(screen.getByRole('button', { name: /open sidebar/i })).toBeInTheDocument();
    expect(container.querySelector('.app-shell > .project-sidebar')).not.toBeInTheDocument();
  });
});
