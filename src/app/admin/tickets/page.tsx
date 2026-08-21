"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Eye,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Calendar,
  Loader2,
  RefreshCw,
  Archive,
} from "lucide-react";
import Link from "next/link";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AdminTicket {
  _id: string;
  ticketId: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  userId: {
    name: string;
    email: string;
  } | null;
  messages: any[];
  createdAt: string;
  updatedAt: string;
}

interface TicketSummary {
  total: number;
  open: number;
  inProgress: number;
  waitingResponse: number;
  resolved: number;
  closed: number;
  closable: number;
}

const statusConfig = {
  open: { icon: AlertCircle, color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300', label: 'Open' },
  'in-progress': { icon: Clock, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300', label: 'In Progress' },
  'waiting-response': { icon: MessageSquare, color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300', label: 'Waiting Response' },
  resolved: { icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300', label: 'Resolved' },
  closed: { icon: XCircle, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', label: 'Closed' },
};

const priorityConfig = {
  low: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', label: 'Low' },
  medium: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300', label: 'Medium' },
  high: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300', label: 'High' },
  critical: { color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300', label: 'Critical' },
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [summary, setSummary] = useState<TicketSummary>({
    total: 0,
    open: 0,
    inProgress: 0,
    waitingResponse: 0,
    resolved: 0,
    closed: 0,
    closable: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [includeResolved, setIncludeResolved] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (debouncedSearch) params.append('search', debouncedSearch);

      const response = await fetch(`/api/admin/tickets?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        setTickets(data);
      } else {
        setTickets(data.tickets || []);
        if (data.summary) setSummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast.error('Tickets load nahi hue');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, debouncedSearch]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  const bulkTargetCount = useMemo(() => {
    if (includeResolved) {
      return summary.total - summary.closed;
    }
    return summary.closable;
  }, [includeResolved, summary]);

  const handleBulkClose = async () => {
    const message = bulkMessage.trim();
    if (!message) {
      toast.error('Closing message likho');
      return;
    }
    if (bulkTargetCount === 0) {
      toast.error('Close karne ke liye koi ticket nahi');
      return;
    }

    setBulkLoading(true);
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          includeResolved,
          onlyOpen: !includeResolved,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Bulk close failed');

      toast.success(`${data.closed} ticket close ho gaye${data.failedCount ? ` · ${data.failedCount} fail` : ''}`);
      setBulkOpen(false);
      setBulkMessage('');
      await fetchTickets();
    } catch (err: any) {
      toast.error(err.message || 'Bulk close fail');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="admin-page-container space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Support Tickets</h1>
          <p className="text-muted-foreground mt-1">Customer requests manage karo — reply, status, bulk close</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchTickets()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => setBulkOpen(true)}
            disabled={summary.closable === 0 && summary.resolved === 0}
          >
            <Archive className="h-4 w-4" />
            Close all ({summary.closable} open)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Open', value: summary.open, tone: 'text-blue-600', icon: AlertCircle },
          { label: 'In Progress', value: summary.inProgress, tone: 'text-amber-600', icon: Clock },
          { label: 'Waiting', value: summary.waitingResponse, tone: 'text-orange-600', icon: MessageSquare },
          { label: 'Resolved', value: summary.resolved, tone: 'text-emerald-600', icon: CheckCircle },
          { label: 'Closed', value: summary.closed, tone: 'text-muted-foreground', icon: XCircle },
          { label: 'Total', value: summary.total, tone: 'text-foreground', icon: MessageSquare },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={cn('text-2xl font-bold tabular-nums', stat.tone)}>{stat.value}</p>
                </div>
                <stat.icon className={cn('h-5 w-5 opacity-60', stat.tone)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search & filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ticket ID, subject, user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="waiting-response">Waiting Response</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Tickets</CardTitle>
            <CardDescription>{tickets.length} result(s) in current view</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
              <p className="font-medium">No tickets found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'Filters change karke try karo'
                  : 'Abhi koi support ticket nahi'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => {
                const status = statusConfig[ticket.status as keyof typeof statusConfig] || statusConfig.open;
                const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.medium;
                const StatusIcon = status.icon;

                return (
                  <div
                    key={ticket._id}
                    className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusIcon className="h-4 w-4 shrink-0" />
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {ticket.ticketId}
                        </Badge>
                        <Badge className={priority.color}>{priority.label}</Badge>
                        <Badge className={status.color}>{status.label}</Badge>
                      </div>
                      <div>
                        <h3 className="font-semibold leading-snug">{ticket.subject}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>{ticket.userId?.name || 'Unknown user'}</span>
                          <span>·</span>
                          <span className="truncate max-w-[220px]">{ticket.userId?.email || '—'}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(ticket.createdAt).toLocaleDateString('en-IN')}
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {ticket.messages?.length || 0} msgs
                          </span>
                        </div>
                      </div>
                    </div>
                    <Link href={`/admin/tickets/${ticket.ticketId}`} className="shrink-0">
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Close all tickets — same message</DialogTitle>
            <DialogDescription>
              Ek message sab targeted tickets me jayega aur status <strong>closed</strong> ho jayega.
              Customer ko reply email + notification bhi jayegi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-semibold text-foreground">{bulkTargetCount}</span>{' '}
              ticket close honge
              {includeResolved ? ' (open + in-progress + waiting + resolved)' : ' (open, in-progress, waiting only)'}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-message">Closing message (sabko same)</Label>
              <Textarea
                id="bulk-message"
                rows={5}
                placeholder="Example: Issue fix ho gaya hai. Agar dubara problem ho to naya ticket kholo. Dhanyawad."
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
              <Checkbox
                checked={includeResolved}
                onCheckedChange={(v) => setIncludeResolved(v === true)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Resolved tickets bhi close karo</p>
                <p className="text-xs text-muted-foreground">Warna sirf open / in-progress / waiting wale band honge</p>
              </div>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleBulkClose()}
              disabled={bulkLoading || bulkTargetCount === 0 || !bulkMessage.trim()}
            >
              {bulkLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Closing…
                </>
              ) : (
                <>Close {bulkTargetCount} tickets</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
