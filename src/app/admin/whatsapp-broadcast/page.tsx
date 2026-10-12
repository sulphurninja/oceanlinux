"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send,
  Users,
  ShoppingBag,
  KeyRound,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  StopCircle,
  ShieldCheck,
  Settings2,
  Plus,
  History,
  ChevronRight,
} from "lucide-react";
import { toast } from 'sonner';
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* WhatsApp brand icon (lucide has no brand logos)                     */
/* ------------------------------------------------------------------ */

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SlotInfo {
  slot: number;
  label: string;
  configured: boolean;
  usingDefault: boolean;
  maskedKey: string;
}

interface TemplateInfo {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

interface JobInfo {
  _id: string;
  slot: number;
  accountLabel?: string;
  maskedKey?: string;
  templateName: string;
  audience: 'purchasers' | 'all';
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  totalRecipients: number;
  cursor: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  error?: string;
  createdAt?: string;
  completedAt?: string;
}

interface SlotFormState {
  templates: TemplateInfo[];
  templatesLoading: boolean;
  templatesLoaded: boolean;
  templateName: string;
  templateLanguage: string;
  audience: 'purchasers' | 'all' | null;
}

const emptySlotForm = (): SlotFormState => ({
  templates: [],
  templatesLoading: false,
  templatesLoaded: false,
  templateName: '',
  templateLanguage: 'en',
  audience: null,
});

const AUDIENCE_META = {
  purchasers: {
    label: 'Purchasers',
    description: 'Made a purchase — any time',
    icon: ShoppingBag,
  },
  all: {
    label: 'All customers',
    description: 'Everyone with a valid phone',
    icon: Users,
  },
} as const;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function WhatsAppBroadcastPage() {
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [defaultKeyMasked, setDefaultKeyMasked] = useState('');
  const [defaultKeyConfigured, setDefaultKeyConfigured] = useState(false);
  const [audienceCounts, setAudienceCounts] = useState({ purchasers: 0, allCustomers: 0 });
  const [forms, setForms] = useState<Record<number, SlotFormState>>({});
  const [jobs, setJobs] = useState<JobInfo[]>([]);

  // Configure-account dialog
  const [configSlot, setConfigSlot] = useState<number | null>(null);
  const [configLabel, setConfigLabel] = useState('');
  const [configKey, setConfigKey] = useState('');
  const [configSaving, setConfigSaving] = useState(false);

  // Send confirmation
  const [confirmSend, setConfirmSend] = useState<{
    slot: number;
    templateName: string;
    templateLanguage: string;
    audience: 'purchasers' | 'all';
  } | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);

  const processingLoops = useRef<Set<string>>(new Set());
  const mounted = useRef(true);

  const updateForm = useCallback((slot: number, patch: Partial<SlotFormState>) => {
    setForms((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] || emptySlotForm()), ...patch },
    }));
  }, []);

  const upsertJob = useCallback((job: JobInfo) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j._id === job._id);
      if (idx === -1) return [job, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...job };
      return next;
    });
  }, []);

  /**
   * Drives a running job to completion: the server sends one paced batch
   * (~8 messages at ~1/sec) per call, and we keep calling until done. A
   * server-side lock makes concurrent loops (e.g. two tabs) harmless.
   */
  const runProcessLoop = useCallback(async (jobId: string) => {
    if (processingLoops.current.has(jobId)) return;
    processingLoops.current.add(jobId);
    try {
      for (;;) {
        if (!mounted.current) return;
        let res: Response;
        try {
          res = await fetch(`/api/admin/whatsapp-broadcast/jobs/${jobId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'process' }),
          });
        } catch {
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.message || 'Broadcast processing error');
          return;
        }
        if (data.job) upsertJob(data.job);
        if (!data.job || data.job.status !== 'running') {
          if (data.job?.status === 'completed') {
            toast.success(
              `"${data.job.templateName}" completed — ${data.job.sentCount} sent, ${data.job.skippedCount} skipped, ${data.job.failedCount} failed`,
            );
          }
          return;
        }
        await new Promise((r) => setTimeout(r, data.locked ? 2000 : 50));
      }
    } finally {
      processingLoops.current.delete(jobId);
    }
  }, [upsertJob]);

  const loadAll = useCallback(async () => {
    try {
      const [accRes, jobsRes] = await Promise.all([
        fetch('/api/admin/whatsapp-broadcast/accounts', { credentials: 'include' }),
        fetch('/api/admin/whatsapp-broadcast/jobs', { credentials: 'include' }),
      ]);
      const accData = await accRes.json();
      const jobsData = await jobsRes.json();
      if (!accRes.ok) throw new Error(accData.message || 'Failed to load accounts');

      setSlots(accData.slots || []);
      setDefaultKeyMasked(accData.defaultKeyMasked || '');
      setDefaultKeyConfigured(Boolean(accData.defaultKeyConfigured));
      setAudienceCounts(accData.audienceCounts || { purchasers: 0, allCustomers: 0 });

      const jobList: JobInfo[] = jobsData.jobs || [];
      setJobs(jobList);
      for (const j of jobList) {
        if (j.status === 'running') runProcessLoop(j._id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load broadcast workspace');
    } finally {
      setLoading(false);
    }
  }, [runProcessLoop]);

  useEffect(() => {
    mounted.current = true;
    loadAll();
    return () => {
      mounted.current = false;
    };
  }, [loadAll]);

  /* ----------------------------- actions ----------------------------- */

  const openConfig = (slot: number) => {
    const info = slots.find((s) => s.slot === slot);
    setConfigLabel(info?.label || '');
    setConfigKey('');
    setConfigSlot(slot);
  };

  const saveConfig = async (clearKey = false) => {
    if (configSlot === null) return;
    setConfigSaving(true);
    try {
      const body: Record<string, unknown> = { slot: configSlot, label: configLabel };
      if (clearKey) body.clearKey = true;
      else if (configKey.trim()) body.apiKey = configKey.trim();

      const res = await fetch('/api/admin/whatsapp-broadcast/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save');
      setSlots((prev) => prev.map((s) => (s.slot === configSlot ? { ...s, ...data.slot } : s)));
      updateForm(configSlot, { templatesLoaded: false, templates: [], templateName: '' });
      toast.success(clearKey ? `Slot ${configSlot} key removed` : `Slot ${configSlot} saved`);
      setConfigSlot(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save account');
    } finally {
      setConfigSaving(false);
    }
  };

  const loadTemplates = async (slot: number) => {
    updateForm(slot, { templatesLoading: true });
    try {
      const res = await fetch(`/api/admin/whatsapp-broadcast/templates?slot=${slot}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load templates');
      updateForm(slot, { templates: data.templates || [], templatesLoaded: true });
      if (!(data.templates || []).length) {
        toast.info('No templates found on this Zaptick account');
      }
    } catch (err: any) {
      toast.error(err.message || 'Template fetch failed');
    } finally {
      updateForm(slot, { templatesLoading: false });
    }
  };

  const startBroadcast = async () => {
    if (!confirmSend) return;
    setCreatingJob(true);
    try {
      const res = await fetch('/api/admin/whatsapp-broadcast/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(confirmSend),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to start broadcast');
      upsertJob(data.job);
      toast.success(`Broadcast started — ${data.job.totalRecipients} recipients queued`);
      runProcessLoop(data.job._id);
      setConfirmSend(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start broadcast');
    } finally {
      setCreatingJob(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/admin/whatsapp-broadcast/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to cancel');
      if (data.job) upsertJob(data.job);
      toast.success('Broadcast cancelled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel');
    }
  };

  /* ----------------------------- derived ----------------------------- */

  const runningJobForSlot = (slot: number) => jobs.find((j) => j.slot === slot && j.status === 'running');
  const selected = slots.find((s) => s.slot === selectedSlot);
  const selectedForm = forms[selectedSlot] || emptySlotForm();
  const selectedRunning = runningJobForSlot(selectedSlot);
  const runningCount = jobs.filter((j) => j.status === 'running').length;
  const canSend =
    Boolean(selected?.configured) &&
    Boolean(selectedForm.templateName.trim()) &&
    Boolean(selectedForm.audience) &&
    !selectedRunning;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* ------------------------------ Header ------------------------------ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-[#25D366] flex items-center justify-center shadow-sm shrink-0">
            <WhatsAppIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold leading-tight">WhatsApp Broadcast</h1>
            <p className="text-xs md:text-sm text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#25D366]" />
              Duplicate-safe · 40 at a time · every running slot sends together, even with this page closed
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* ------------------------------ Stats ------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
          <ShoppingBag className="h-4 w-4 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none">{audienceCounts.purchasers.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Purchasers with valid phone</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
          <Users className="h-4 w-4 text-violet-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none">{audienceCounts.allCustomers.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-1">All customers with valid phone</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
          <KeyRound className="h-4 w-4 text-[#25D366] shrink-0" />
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium truncate">
              {defaultKeyConfigured ? defaultKeyMasked : 'Not configured'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Default Zaptick key (env)</p>
          </div>
        </div>
      </div>

      {/* ------------------------------ Tabs -------------------------------- */}
      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">
            <Send className="h-3.5 w-3.5 mr-1.5" /> Compose
            {runningCount > 0 && (
              <span className="ml-2 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" /> History
            {jobs.length > 0 && <Badge variant="secondary" className="ml-2 px-1.5">{jobs.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ============================ COMPOSE ============================ */}
        <TabsContent value="compose" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-4 items-start">
            {/* ------------------- Account rail ------------------- */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-2">
                Accounts (7 slots)
              </p>
              {slots.map((s) => {
                const running = runningJobForSlot(s.slot);
                const isSelected = s.slot === selectedSlot;
                return (
                  <button
                    key={s.slot}
                    onClick={() => setSelectedSlot(s.slot)}
                    className={cn(
                      'w-full text-left rounded-xl border px-3 py-2.5 transition-all flex items-center gap-3',
                      isSelected
                        ? 'border-[#25D366] bg-[#25D366]/5 shadow-sm'
                        : 'hover:bg-muted/60 border-transparent bg-muted/30',
                    )}
                  >
                    <div
                      className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0',
                        s.configured
                          ? 'bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366]'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {s.slot}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {s.label || (s.configured ? `Account ${s.slot}` : 'Empty slot')}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {running
                          ? `Sending… ${running.cursor}/${running.totalRecipients}`
                          : s.configured
                            ? s.maskedKey
                            : 'No API key'}
                      </p>
                    </div>
                    {running ? (
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    ) : s.configured ? (
                      <span className="h-2 w-2 rounded-full bg-[#25D366] shrink-0" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ------------------- Workspace ------------------- */}
            <Card className="overflow-hidden">
              {/* Account header */}
              <div className="px-5 py-4 border-b bg-muted/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <WhatsAppIcon className={cn('h-5 w-5 shrink-0', selected?.configured ? 'text-[#25D366]' : 'text-muted-foreground')} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                      Slot {selectedSlot}
                      {selected?.label ? <span className="text-muted-foreground font-normal">· {selected.label}</span> : null}
                      {selected?.usingDefault && <Badge variant="secondary" className="text-[10px]">Default key</Badge>}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground truncate">
                      {selected?.configured ? selected.maskedKey : 'No API key configured'}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openConfig(selectedSlot)}>
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Configure
                </Button>
              </div>

              <CardContent className="p-5">
                {!selected?.configured ? (
                  /* Empty slot prompt */
                  <div className="py-10 text-center space-y-3">
                    <div className="h-12 w-12 rounded-2xl bg-muted mx-auto flex items-center justify-center">
                      <KeyRound className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Connect a Zaptick account to this slot to start broadcasting from it.
                    </p>
                    <Button size="sm" onClick={() => openConfig(selectedSlot)}>
                      <Plus className="h-4 w-4 mr-1.5" /> Add API key
                    </Button>
                  </div>
                ) : selectedRunning ? (
                  /* Live broadcast progress */
                  <div className="space-y-4 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                        </span>
                        <p className="font-medium text-sm truncate">
                          Sending <span className="font-mono">{selectedRunning.templateName}</span> to{' '}
                          {AUDIENCE_META[selectedRunning.audience].label.toLowerCase()}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="text-destructive shrink-0" onClick={() => cancelJob(selectedRunning._id)}>
                        <StopCircle className="h-3.5 w-3.5 mr-1.5" /> Stop
                      </Button>
                    </div>
                    <Progress
                      value={selectedRunning.totalRecipients > 0
                        ? Math.round((selectedRunning.cursor / selectedRunning.totalRecipients) * 100)
                        : 0}
                    />
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg bg-muted/50 py-2">
                        <p className="text-base font-bold">{selectedRunning.cursor}<span className="text-muted-foreground font-normal text-xs">/{selectedRunning.totalRecipients}</span></p>
                        <p className="text-[10px] text-muted-foreground">Processed</p>
                      </div>
                      <div className="rounded-lg bg-green-500/10 py-2">
                        <p className="text-base font-bold text-green-600">{selectedRunning.sentCount}</p>
                        <p className="text-[10px] text-muted-foreground">Sent</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 py-2">
                        <p className="text-base font-bold">{selectedRunning.skippedCount}</p>
                        <p className="text-[10px] text-muted-foreground">Skipped</p>
                      </div>
                      <div className="rounded-lg bg-red-500/10 py-2">
                        <p className="text-base font-bold text-red-500">{selectedRunning.failedCount}</p>
                        <p className="text-[10px] text-muted-foreground">Failed</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Messages go out 40 at a time. You can close this page — the cron keeps every running slot going. Already-messaged phones are skipped.
                    </p>
                  </div>
                ) : (
                  /* Compose flow */
                  <div className="space-y-5">
                    {/* Step 1 — template */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366] text-[11px] font-bold flex items-center justify-center">1</span>
                          Choose a template
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          disabled={selectedForm.templatesLoading}
                          onClick={() => loadTemplates(selectedSlot)}
                        >
                          {selectedForm.templatesLoading
                            ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            : <RefreshCw className="h-3 w-3 mr-1" />}
                          {selectedForm.templatesLoaded ? 'Reload' : 'Load from Zaptick'}
                        </Button>
                      </div>
                      {selectedForm.templates.length > 0 && (
                        <Select
                          value={selectedForm.templates.some((t) => t.name === selectedForm.templateName) ? selectedForm.templateName : undefined}
                          onValueChange={(name) => {
                            const tpl = selectedForm.templates.find((t) => t.name === name);
                            updateForm(selectedSlot, {
                              templateName: name,
                              templateLanguage: tpl?.language || 'en',
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template…" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedForm.templates.map((t) => (
                              <SelectItem key={t.id} value={t.name}>
                                <span className="font-mono text-xs">{t.name}</span>
                                <span className="text-muted-foreground text-xs ml-2">{t.category} · {t.status}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="flex gap-2">
                        <Input
                          className="font-mono text-sm"
                          placeholder={selectedForm.templates.length ? 'or type template name…' : 'Type template name…'}
                          value={selectedForm.templateName}
                          onChange={(e) => updateForm(selectedSlot, { templateName: e.target.value })}
                        />
                        <Input
                          className="w-16 shrink-0 text-center text-sm"
                          placeholder="en"
                          title="Template language code"
                          value={selectedForm.templateLanguage}
                          onChange={(e) => updateForm(selectedSlot, { templateLanguage: e.target.value })}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Use <span className="font-mono">{'{{1}}'}</span> for the customer&apos;s first name. Example: Hi {'{{1}}'}, your VPS has started.
                      </p>
                    </div>

                    <Separator />

                    {/* Step 2 — audience */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <span className="h-5 w-5 rounded-full bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366] text-[11px] font-bold flex items-center justify-center">2</span>
                        Choose the audience
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(Object.keys(AUDIENCE_META) as Array<'purchasers' | 'all'>).map((key) => {
                          const meta = AUDIENCE_META[key];
                          const Icon = meta.icon;
                          const count = key === 'purchasers' ? audienceCounts.purchasers : audienceCounts.allCustomers;
                          const active = selectedForm.audience === key;
                          return (
                            <button
                              key={key}
                              onClick={() => updateForm(selectedSlot, { audience: active ? null : key })}
                              className={cn(
                                'rounded-xl border p-3 text-left transition-all flex items-center gap-3',
                                active
                                  ? 'border-[#25D366] bg-[#25D366]/5 ring-1 ring-[#25D366]'
                                  : 'hover:bg-muted/50',
                              )}
                            >
                              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#128C7E] dark:text-[#25D366]' : 'text-muted-foreground')} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{meta.label}</p>
                                <p className="text-[11px] text-muted-foreground">{meta.description}</p>
                              </div>
                              <span className="text-sm font-bold shrink-0">{count.toLocaleString()}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Separator />

                    {/* Step 3 — send */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <Button
                        className="bg-[#25D366] hover:bg-[#1fb857] text-white flex-1 sm:flex-none sm:min-w-[220px]"
                        disabled={!canSend}
                        onClick={() =>
                          setConfirmSend({
                            slot: selectedSlot,
                            templateName: selectedForm.templateName.trim(),
                            templateLanguage: selectedForm.templateLanguage || 'en',
                            audience: selectedForm.audience!,
                          })
                        }
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Send broadcast
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                      {!canSend && (
                        <p className="text-[11px] text-muted-foreground">
                          {!selectedForm.templateName.trim()
                            ? 'Pick or type a template to continue.'
                            : !selectedForm.audience
                              ? 'Select an audience to continue.'
                              : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================ HISTORY ============================ */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {jobs.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  No broadcasts yet. Your send history will appear here.
                </div>
              ) : (
                <div className="divide-y">
                  {jobs.map((job) => (
                    <div key={job._id} className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-medium">{job.templateName}</span>
                          <Badge variant="outline" className="text-[10px]">Slot {job.slot}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{AUDIENCE_META[job.audience].label}</Badge>
                          {job.status === 'running' && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse mr-1" /> Running
                            </Badge>
                          )}
                          {job.status === 'completed' && (
                            <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" /> Completed
                            </Badge>
                          )}
                          {job.status === 'cancelled' && <Badge variant="outline" className="text-[10px]">Cancelled</Badge>}
                          {job.status === 'failed' && (
                            <Badge variant="destructive" className="text-[10px]">
                              <XCircle className="h-3 w-3 mr-1" /> Failed
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : ''}
                          {job.maskedKey ? ` · ${job.maskedKey}` : ''}
                          {job.error ? ` · ${job.error}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs whitespace-nowrap shrink-0">
                        <span className="text-muted-foreground">{job.cursor}/{job.totalRecipients}</span>
                        <span className="text-green-600 font-medium">{job.sentCount} sent</span>
                        <span className="text-muted-foreground">{job.skippedCount} skipped</span>
                        <span className={job.failedCount > 0 ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                          {job.failedCount} failed
                        </span>
                        {job.status === 'running' && (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-destructive" onClick={() => cancelJob(job._id)}>
                            <StopCircle className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ------------------------ Configure dialog ------------------------ */}
      <Dialog open={configSlot !== null} onOpenChange={(open) => !open && setConfigSlot(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
              Configure Slot {configSlot}
            </DialogTitle>
            <DialogDescription>
              {configSlot === 1
                ? 'Slot 1 uses the platform\u2019s default Zaptick key unless you set a custom one.'
                : 'Paste the Zaptick API key for the account you want to use in this slot.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Account label</Label>
              <Input
                placeholder="e.g. Marketing account"
                value={configLabel}
                onChange={(e) => setConfigLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Zaptick API key</Label>
              <Input
                type="password"
                className="font-mono"
                placeholder={
                  slots.find((s) => s.slot === configSlot)?.configured
                    ? 'Leave blank to keep current key'
                    : 'zaptick_live_sk_…'
                }
                value={configKey}
                onChange={(e) => setConfigKey(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {configSlot !== null && slots.find((s) => s.slot === configSlot)?.configured &&
              !slots.find((s) => s.slot === configSlot)?.usingDefault && (
                <Button
                  variant="ghost"
                  className="text-destructive sm:mr-auto"
                  disabled={configSaving}
                  onClick={() => saveConfig(true)}
                >
                  Remove key
                </Button>
              )}
            <Button variant="outline" disabled={configSaving} onClick={() => setConfigSlot(null)}>
              Cancel
            </Button>
            <Button disabled={configSaving} onClick={() => saveConfig(false)}>
              {configSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------- Confirm dialog ------------------------- */}
      <AlertDialog open={!!confirmSend} onOpenChange={(open) => !open && setConfirmSend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
              Start this broadcast?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {confirmSend && (
                  <>
                    <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Template</span>
                        <span className="font-mono font-medium">{confirmSend.templateName}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">From</span>
                        <span className="font-medium">Slot {confirmSend.slot}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Audience</span>
                        <span className="font-medium">
                          {AUDIENCE_META[confirmSend.audience].label} · ~
                          {(confirmSend.audience === 'purchasers'
                            ? audienceCounts.purchasers
                            : audienceCounts.allCustomers
                          ).toLocaleString()}{' '}
                          people
                        </span>
                      </div>
                    </div>
                    <p className="text-xs flex items-start gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-[#25D366] shrink-0" />
                      Phones that already received this template from this account are skipped
                      automatically. Each slot sends 40 at a time, and several slots can run together.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creatingJob}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#25D366] hover:bg-[#1fb857] text-white"
              onClick={(e) => { e.preventDefault(); startBroadcast(); }}
              disabled={creatingJob}
            >
              {creatingJob ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Start broadcast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
