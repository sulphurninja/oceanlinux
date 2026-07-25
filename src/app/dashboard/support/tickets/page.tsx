'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Ticket, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useSessionAlert } from '@/components/session-alert';
import { dashboardFetch } from '@/lib/dashboardFetch';
import { cn } from '@/lib/utils';
import { premiumBadge, premiumBtnOutline } from '@/lib/premium-badges';
import {
  type SupportTicketRow,
  resolvePriority,
  resolveStatus,
  statusBadgeClass,
  priorityBadgeClass,
  formatTicketDate,
} from '@/components/support/supportTicketUi';

export default function DashboardSupportTicketsPage() {
  const router = useRouter();
  const { showAlert } = useSessionAlert();
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    category: '',
    priority: 'medium',
  });

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await dashboardFetch('/api/support/tickets', { credentials: 'include' });

      if (response.status === 401) {
        const data = await response.json().catch(() => ({}));
        const code = data.code || '';
        if (code === 'SESSION_EXPIRED' || String(data.message || '').toLowerCase().includes('expired')) {
          showAlert('session_expired');
        } else {
          showAlert('action_requires_login', 'Please log in to view your support tickets.');
        }
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch tickets');

      const data = await response.json();
      setTickets(Array.isArray(data) ? data : data.tickets || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast.error('Failed to load your tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const response = await dashboardFetch('/api/support/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to create ticket');
      }

      const data = await response.json();
      toast.success('Support ticket raised successfully');
      setShowCreateDialog(false);
      setFormData({ subject: '', description: '', category: '', priority: 'medium' });
      await fetchTickets();

      const newId = data?.ticket?.ticketId;
      if (newId) router.push(`/dashboard/support/tickets/${newId}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to raise ticket');
    } finally {
      setCreating(false);
    }
  };

  const openCount = tickets.filter((t) => !['resolved', 'closed'].includes(t.status)).length;

  const raiseTicketDialog = (
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogTrigger asChild>
        <Button size="sm" className="premium-btn-primary border-0 gap-2 w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Raise Ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.25rem)] premium-dashboard-dialog">
        <DialogHeader>
          <DialogTitle className="premium-dashboard-title text-base sm:text-lg">
            Raise a Support Ticket
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="premium-field-label">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger className="premium-dashboard-input h-10">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="premium-dashboard-select-content">
                  <SelectItem value="technical">Technical Support</SelectItem>
                  <SelectItem value="billing">Billing & Pricing</SelectItem>
                  <SelectItem value="general">General Inquiry</SelectItem>
                  <SelectItem value="security">Security Issue</SelectItem>
                  <SelectItem value="feature-request">Feature Request</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="premium-field-label">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger className="premium-dashboard-input h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="premium-dashboard-select-content">
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject" className="premium-field-label">Subject</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="Brief description of your issue"
              className="premium-dashboard-input h-10"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="premium-field-label">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provide detailed information about your issue..."
              rows={5}
              className="premium-dashboard-input min-h-[120px]"
              required
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" className={premiumBtnOutline} onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating} className="premium-btn-primary border-0 gap-2">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Ticket
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="premium-dashboard-page">
      <div className="premium-dashboard-page-inner space-y-5">
        {/* Top bar: stats + action (title comes from dashboard header) */}
        <div className="premium-dashboard-page-header">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
            {!loading && tickets.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn(premiumBadge.neutral, 'text-xs')}>
                  {tickets.length} ticket{tickets.length === 1 ? '' : 's'}
                </Badge>
                {openCount > 0 && (
                  <Badge variant="outline" className={cn(premiumBadge.success, 'text-xs')}>
                    {openCount} open
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-sm premium-dashboard-subtitle">
                Need help? Raise a ticket and our team will reply here.
              </p>
            )}
            {raiseTicketDialog}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : tickets.length > 0 ? (
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const status = resolveStatus(ticket.status);
              const priority = resolvePriority(ticket.priority);
              const StatusIcon = status.icon;

              return (
                <Link
                  key={ticket._id}
                  href={`/dashboard/support/tickets/${ticket.ticketId}`}
                  className="premium-dashboard-order-card block group"
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
                      {/* Main info */}
                      <div className="min-w-0 flex-1 space-y-2">
                        <h3 className="text-base sm:text-lg font-semibold premium-dashboard-title leading-snug break-words">
                          {ticket.subject}
                        </h3>
                        <p className="text-xs sm:text-sm font-mono premium-dashboard-subtitle break-all">
                          {ticket.ticketId}
                        </p>
                        <p className="text-xs sm:text-sm premium-dashboard-subtitle">
                          Created {formatTicketDate(ticket.createdAt)}
                          <span className="mx-1.5 opacity-40">·</span>
                          Updated {formatTicketDate(ticket.updatedAt)}
                        </p>
                      </div>

                      {/* Badges + action */}
                      <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-start sm:items-center lg:items-end xl:items-center gap-3 shrink-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={cn(premiumBadge.neutral, 'capitalize text-xs')}>
                            {ticket.category.replace('-', ' ')}
                          </Badge>
                          <Badge variant="outline" className={cn(priorityBadgeClass(ticket.priority), 'text-xs')}>
                            {priority.label}
                          </Badge>
                          <Badge variant="outline" className={cn(statusBadgeClass(ticket.status), 'text-xs')}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {status.label}
                          </Badge>
                        </div>

                        <span
                          className={cn(
                            premiumBtnOutline,
                            'inline-flex items-center justify-center px-3 pointer-events-none',
                            'group-hover:border-emerald-400/40 group-hover:text-emerald-700 dark:group-hover:text-emerald-200',
                          )}
                        >
                          View
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="premium-dashboard-card border-0">
            <CardContent className="py-14 sm:py-16 px-4 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-400/25">
                <Ticket className="h-7 w-7 text-emerald-600 dark:text-emerald-300" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold premium-dashboard-title mb-2">
                No tickets yet
              </h3>
              <p className="text-sm premium-dashboard-subtitle mb-6 max-w-md mx-auto">
                Raise a ticket for billing, server, or technical help. All your old and new tickets will show here.
              </p>
              <Button onClick={() => setShowCreateDialog(true)} className="premium-btn-primary border-0 gap-2">
                <Plus className="h-4 w-4" />
                Raise Ticket
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
