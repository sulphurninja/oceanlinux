'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Copy, Download, Globe, Loader2, Shield, Square, Trash2, Upload, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Mode = 'auth' | 'host';
type CheckState = { ok: boolean; ms: number; message: string };
type Row = {
  id: number;
  line: string;
  host: string;
  state: 'queued' | 'testing' | 'working' | 'dead';
  outgoingIp?: string;
  checks?: { irctc: CheckState; general: CheckState };
  message?: string;
};

function countLines(text: string, mode: Mode) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => {
    if (!line) return false;
    if (mode === 'host') return /^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(line);
    return line.split(':').length >= 4;
  }).length;
}

export default function DedicatedIpChecker({ variant = 'marketing' }: { variant?: 'marketing' | 'dashboard' }) {
  const dash = variant === 'dashboard';
  const [mode, setMode] = useState<Mode>('auth');
  const [text, setText] = useState('');
  const [visitorIp, setVisitorIp] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'all' | 'working' | 'dead'>('all');
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<Row | null>(null);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/tools/ip-check')
      .then((res) => res.json())
      .then((data) => setVisitorIp(data.ip || ''))
      .catch(() => setVisitorIp(''));
  }, []);

  const ready = useMemo(() => countLines(text, mode), [text, mode]);
  const working = rows.filter((row) => row.state === 'working');
  const dead = rows.filter((row) => row.state === 'dead');
  const checked = rows.filter((row) => row.state === 'working' || row.state === 'dead').length;
  const visible = rows.filter((row) => filter === 'all' || row.state === filter);
  const shown = active || rows.find((row) => row.state === 'testing') || null;

  const run = async () => {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length || running) return;
    stopRef.current = false;
    setFilter('all');
    const initial: Row[] = lines.map((line, index) => ({
      id: index,
      line,
      host: line.split(':').slice(0, 2).join(':'),
      state: 'queued',
    }));
    setRows(initial);
    setActive(null);
    setRunning(true);

    let cursor = 0;
    const update = (id: number, patch: Partial<Row>) => {
      setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    };

    const worker = async () => {
      while (!stopRef.current) {
        const index = cursor;
        cursor += 1;
        if (index >= initial.length) return;
        update(index, { state: 'testing' });
        try {
          const res = await fetch('/api/tools/ip-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxy: initial[index].line, mode }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            update(index, { state: 'dead', message: data.message || 'Check failed' });
            continue;
          }
          const next: Partial<Row> = {
            state: data.working ? 'working' : 'dead',
            host: data.host,
            outgoingIp: data.outgoingIp,
            checks: data.checks,
            message: data.checks?.irctc?.ok ? 'IRCTC working' : (data.checks?.irctc?.message || 'IRCTC not working'),
          };
          update(index, next);
          setActive({ ...initial[index], ...next });
        } catch {
          update(index, { state: 'dead', message: 'Network error' });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, initial.length) }, () => worker()));
    setRunning(false);
  };

  const copyWorking = async () => {
    const payload = working.map((row) => row.line).join('\n');
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
  };

  const downloadWorking = () => {
    const payload = working.map((row) => row.line).join('\n');
    if (!payload) return;
    const blob = new Blob([payload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'working_ips.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const tap = 'min-h-11 select-none touch-manipulation active:scale-[0.98]';

  const card = (title: string, site: string, body: string, icon: ReactNode, check?: CheckState, testing?: boolean) => (
    <div className={cn('rounded-xl border p-3 sm:p-4', dash ? 'border-border bg-muted/40' : 'border-white/10 bg-white/[0.03]')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className={cn('flex items-center gap-2 font-medium', dash ? 'text-foreground' : 'text-white')}>
            {icon}
            {title}
          </div>
          <p className={cn('mt-1 break-all font-mono text-xs', dash ? 'text-emerald-700 dark:text-emerald-200' : 'text-emerald-200/80')}>{site}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className={cn('rounded-md px-2 py-1', dash ? 'bg-background text-muted-foreground' : 'bg-white/5 text-white/50')}>{check ? `${check.ms} ms` : '— ms'}</span>
          <span className={cn(
            'rounded-md px-2 py-1 font-semibold',
            testing ? 'bg-amber-500/15 text-amber-700 dark:text-amber-200' : check?.ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : check ? 'bg-red-500/15 text-red-700 dark:text-red-300' : (dash ? 'bg-background text-muted-foreground' : 'bg-white/5 text-white/45')
          )}>
            {testing ? 'CHECKING' : check ? (check.ok ? 'PASS' : 'FAIL') : 'READY'}
          </span>
        </div>
      </div>
      <p className={cn('mt-2 text-sm leading-snug', dash ? 'text-muted-foreground' : 'text-white/45')}>{check?.message || body}</p>
    </div>
  );

  const shell = dash ? 'premium-dashboard-card p-3 sm:p-5' : 'premium-glass-card p-3 sm:p-5';
  const idleBtn = dash ? 'bg-muted text-muted-foreground' : 'bg-white/5 text-white/70';

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden pb-24 sm:space-y-4 sm:pb-0">
      {!dash && (
      <div className="premium-glass-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-emerald-300">IRCTC CHECK · LIVE</p>
            <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Proxy IP Checker</h1>
            <p className="mt-1 text-sm leading-snug text-white/50">Working tab IRCTC par pass hone se aata hai. Neeche site ka naam likha hai.</p>
          </div>
          {visitorIp && (
            <div className="w-fit max-w-full truncate rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70">
              Your IP <span className="font-mono text-white">{visitorIp}</span>
            </div>
          )}
        </div>
      </div>
      )}

      <div className={cn(shell, 'space-y-3')}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode('auth')} className={cn(tap, 'rounded-lg px-2 text-center text-[13px] leading-tight sm:text-sm', mode === 'auth' ? 'bg-emerald-500 text-black font-semibold' : idleBtn)}>IP:Port:User:Pass</button>
          <button type="button" onClick={() => setMode('host')} className={cn(tap, 'rounded-lg px-2 text-center text-[13px] leading-tight sm:text-sm', mode === 'host' ? 'bg-emerald-500 text-black font-semibold' : idleBtn)}>IP:Port</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-3 py-1 text-xs', dash ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200' : 'bg-emerald-500/15 text-emerald-200')}>{ready} IPs ready</span>
          {dash && visitorIp && (
            <span className="max-w-full truncate rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Your IP <span className="font-mono text-foreground">{visitorIp}</span></span>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" className={tap} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> .TXT
            </Button>
            <input ref={fileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              file.text().then((value) => setText((current) => current.trim() ? `${current.trim()}\n${value.trim()}` : value.trim()));
              event.target.value = '';
            }} />
            <Button type="button" variant="outline" size="sm" className={tap} onClick={() => { stopRef.current = true; setText(''); setRows([]); setActive(null); }}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          placeholder={mode === 'auth' ? 'One IP per line\nip:port:user:pass' : 'One ip:port per line'}
          className={cn('w-full max-w-full rounded-xl border p-3 font-mono text-base outline-none sm:text-sm', dash ? 'border-border bg-background text-foreground placeholder:text-muted-foreground' : 'border-white/10 bg-black/20 text-white placeholder:text-white/30')}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={cn(tap, dash ? 'border-red-500/40 text-red-600 dark:text-red-200' : 'border-red-400/40 text-red-200')} disabled={!running} onClick={() => { stopRef.current = true; setRunning(false); }}>
            <Square className="h-4 w-4" /> Stop
          </Button>
          <Button type="button" className={cn('premium-btn-primary', tap)} disabled={running || ready === 0} onClick={run}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {running ? 'Testing…' : 'Test IP now'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {card('IRCTC', 'www.irctc.co.in', 'Yahi main check hai. Pass matlab IRCTC par proxy working hai.', <Shield className="h-4 w-4 shrink-0 text-emerald-300" />, shown?.checks?.irctc, shown?.state === 'testing' && !shown.checks)}
        {card('Outgoing IP', 'api.ipify.org', 'Proxy ka public IP yahan se aata hai. Working is par decide nahi hota.', <Globe className="h-4 w-4 shrink-0 text-sky-300" />, shown?.checks?.general, shown?.state === 'testing' && !shown.checks)}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total IPs" value={rows.length} dash={dash} />
        <Stat label="Checked" value={checked} dash={dash} />
        <Stat label="Working" value={working.length} tone="ok" dash={dash} />
        <Stat label="Dead" value={dead.length} tone="bad" dash={dash} />
      </div>

      <div className={shell}>
        <h2 className={cn('font-semibold', dash ? 'text-foreground' : 'text-white')}>Live results</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['all', 'working', 'dead'] as const).map((key) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={cn(tap, 'rounded-full px-2 text-xs', filter === key ? 'bg-emerald-500 text-black font-semibold' : idleBtn)}>
              {key === 'all' ? `All ${rows.length}` : key === 'working' ? `Working ${working.length}` : `Dead ${dead.length}`}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button type="button" size="sm" variant="outline" className={tap} onClick={copyWorking}><Copy className="h-3.5 w-3.5" /> Copy {working.length}</Button>
          <Button type="button" size="sm" variant="outline" className={tap} onClick={downloadWorking}><Download className="h-3.5 w-3.5" /> .txt</Button>
        </div>
        <div className="mt-3 space-y-2">
          {visible.length === 0 && (
            <p className={cn('rounded-xl border border-dashed px-3 py-6 text-center text-sm', dash ? 'border-border text-muted-foreground' : 'border-white/10 text-white/40')}>
              Paste one or more IPs, then tap Test IP now.
            </p>
          )}
          {visible.map((row) => (
            <button key={row.id} type="button" onClick={() => setActive(row)} className={cn(tap, 'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-3 text-left', dash ? 'border-border bg-muted/30' : 'border-white/10 bg-black/20')}>
              <div className="min-w-0">
                <p className={cn('truncate font-mono text-sm', dash ? 'text-foreground' : 'text-white')}>{row.host}</p>
                <p className={cn('truncate text-xs', dash ? 'text-muted-foreground' : 'text-white/40')}>{row.outgoingIp ? `Out IP ${row.outgoingIp}` : row.message || row.state}</p>
              </div>
              <span className={cn('shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold', row.state === 'working' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : row.state === 'dead' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : row.state === 'testing' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-200' : (dash ? 'bg-muted text-muted-foreground' : 'bg-white/5 text-white/40'))}>
                {row.state === 'working' ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> IRCTC</span> : row.state}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, dash }: { label: string; value: number; tone?: 'ok' | 'bad'; dash?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3', tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10' : tone === 'bad' ? 'border-red-500/30 bg-red-500/10' : (dash ? 'border-border bg-muted/40' : 'border-white/10 bg-white/[0.03]'))}>
      <p className={cn('truncate text-[11px] uppercase tracking-wide', dash ? 'text-muted-foreground' : 'text-white/40')}>{label}</p>
      <p className={cn('text-xl font-bold sm:text-2xl', tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'bad' ? 'text-red-700 dark:text-red-300' : (dash ? 'text-foreground' : 'text-white'))}>{value}</p>
    </div>
  );
}
