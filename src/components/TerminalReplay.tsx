import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { TaskLogEntry } from '../lib/types';
import '@xterm/xterm/css/xterm.css';

type TerminalReplayProps = {
  logs: TaskLogEntry[];
};

export function TerminalReplay({ logs }: TerminalReplayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!hostRef.current || typeof window === 'undefined') {
      return;
    }

    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 12,
      theme: {
        background: '#1f1d1b',
        foreground: '#f4ede5',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(hostRef.current);

    return () => {
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

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