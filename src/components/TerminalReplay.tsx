import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { TaskLogEntry } from '../lib/types';
import type { ThemeMode } from '../store/useAppStore';

type TerminalReplayProps = {
  logs: TaskLogEntry[];
  theme: ThemeMode;
};

function getTerminalTheme(theme: ThemeMode) {
  if (theme === 'dark') {
    return {
      background: '#1E1E1E',
      foreground: '#E6EAF2',
      cursor: '#7C3AED',
      black: '#0F1115',
      brightBlack: '#525866',
      green: '#51CF66',
      red: '#FF6B6B',
      yellow: '#FCC419',
      blue: '#339AF0',
    };
  }

  return {
    background: '#F7F7FB',
    foreground: '#1F2937',
    cursor: '#7C3AED',
    black: '#2C313A',
    brightBlack: '#748092',
    green: '#2F9E44',
    red: '#E03131',
    yellow: '#E67700',
    blue: '#1C7ED6',
  };
}

export function TerminalReplay({ logs, theme }: TerminalReplayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!hostRef.current || typeof window === 'undefined') {
      return;
    }

    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
      fontSize: 12,
      theme: getTerminalTheme(theme),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          fitAddon.fit();
        });

    observer?.observe(hostRef.current);

    return () => {
      observer?.disconnect();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    terminalRef.current.clear();
    for (const entry of logs) {
      terminalRef.current.writeln(`[${entry.timestamp}] ${entry.stream}: ${entry.message}`);
    }
  }, [logs]);

  if (typeof ResizeObserver === 'undefined') {
    return (
      <pre className="code-block">
        {logs.map((entry) => `[${entry.timestamp}] ${entry.stream}: ${entry.message}`).join('\n') || 'No log output yet.'}
      </pre>
    );
  }

  return <div className="terminal-surface" ref={hostRef} />;
}
