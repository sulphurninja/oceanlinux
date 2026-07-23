'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Send, Clock, User, Bot, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { premiumBadge, premiumBtnOutline } from '@/lib/premium-badges';
import {
  type SupportTicketDetail,
  resolvePriority,
  resolveStatus,
  statusBadgeClass,
  priorityBadgeClass,
  formatTicketDate,
} from '@/components/support/supportTicketUi';

export default function DashboardSupportTicketDetailPage() {
  const params = useParams();
  const ticketId = String(params.ticketId || '');
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  const fetchTicketDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        credentials: 'include',
      });

      if (response.ok) {
        setTicket(await response.json());
      } else if (response.status === 404) {
        toast.error('Ticket not found');
        setTicket(null);
      } else if (response.status === 401) {
        toast.error('Please log in to view this ticket');
      } else {
        toast.error('Failed to load ticket details');
      }
    } catch (error) {
      console.error('Error fetching ticket:', error);
      toast.error('Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId) fetchTicketDetails();
  }, [ticketId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to send reply');
      }

      toast.success('Reply sent');
      setNewMessage('');
      await fetchTicketDetails();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="premium-dashboard-page">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="premium-dashboard-page">
        <div className="premium-dashboard-page-inner text-center py-16">
          <h1 className="text-lg font-semibold premium-dashboard-title mb-2">Ticket not found</h1>
          <p className="text-sm premium-dashboard-subtitle mb-6">
            This ticket may belong to another account or was removed.
          </p>
          <Button asChild variant="outline" className={premiumBtnOutline}>
            <Link href="/dashboard/support/tickets">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to tickets
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const status = resolveStatus(ticket.status);
  const priority = resolvePriority(ticket.priority);
  const StatusIcon = status.icon;

  return (
    <div className="premium-dashboard-page">
      <div className="premium-dashboard-page-inner space-y-5">
        <div className="premium-dashboard-page-header">
          <Button asChild variant="outline" size="sm" className={cn(premiumBtnOutline, 'gap-2')}>
            <Link href="/dashboard/support/tickets">
              <ArrowLeft className="h-4 w-4" />
              All tickets
            </Link>
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="premium-dashboard-card border-0 h-fit lg:sticky lg:top-20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base premium-dashboard-title">Ticket info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs premium-dashboard-stat-label mb-1">Ticket ID</p>
                <p className="text-xs sm:text-sm font-mono break-all premium-dashboard-subtitle">{ticket.ticketId}</p>
              </div>
              <div>
                <p className="text-xs premium-dashboard-stat-label mb-1.5">Status</p>
                <Badge variant="outline" className={cn(statusBadgeClass(ticket.status), 'text-xs')}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {status.label}
                </Badge>
              </div>
              <div>
                <p className="text-xs premium-dashboard-stat-label mb-1.5">Priority</p>
                <Badge variant="outline" className={cn(priorityBadgeClass(ticket.priority), 'text-xs')}>
                  {priority.label}
                </Badge>
              </div>
              <div>
                <p className="text-xs premium-dashboard-stat-label mb-1">Category</p>
                <p className="text-sm capitalize premium-dashboard-subtitle">{ticket.category.replace('-', ' ')}</p>
              </div>
              <div>
                <p className="text-xs premium-dashboard-stat-label mb-1">Created</p>
                <p className="text-sm premium-dashboard-subtitle">{formatTicketDate(ticket.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs premium-dashboard-stat-label mb-1">Last updated</p>
                <p className="text-sm premium-dashboard-subtitle">{formatTicketDate(ticket.updatedAt)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="premium-dashboard-card border-0 min-w-0">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardTitle className="text-base sm:text-lg premium-dashboard-title leading-snug break-words pr-2">
                  {ticket.subject}
                </CardTitle>
                <Badge variant="outline" className={cn(statusBadgeClass(ticket.status), 'text-xs shrink-0')}>
                  {status.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="min-w-0">
              <div className="space-y-5 mb-6">
                {(ticket.messages || [])
                  .filter((message) => !message.isInternal)
                  .map((message, index) => (
                    <div
                      key={index}
                      className={cn('flex', message.author === 'user' ? 'justify-end' : 'justify-start')}
                    >
                      <div className="w-full max-w-[92%] sm:max-w-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-xs">
                              {message.author === 'user' ? (
                                <User className="h-4 w-4" />
                              ) : (
                                <Bot className="h-4 w-4" />
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium premium-dashboard-title truncate">{message.authorName}</p>
                            <p className="text-xs premium-dashboard-subtitle">
                              {new Date(message.timestamp).toLocaleString('en-IN')}
                            </p>
                          </div>
                        </div>
                        <div
                          className={cn(
                            'rounded-xl p-3 sm:p-4 text-sm leading-relaxed whitespace-pre-wrap break-words',
                            message.author === 'user'
                              ? 'premium-dashboard-toolbar'
                              : 'bg-emerald-500/10 border border-emerald-400/25 text-emerald-950 dark:text-emerald-50',
                          )}
                        >
                          {message.message}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {ticket.status !== 'closed' ? (
                <form onSubmit={handleSendMessage} className="border-t border-[var(--pd-border)] pt-5 space-y-3">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your reply..."
                    rows={4}
                    className="premium-dashboard-input min-h-[100px] text-sm"
                    required
                  />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={sending || !newMessage.trim()} className="premium-btn-primary border-0 gap-2">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send reply
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="border-t border-[var(--pd-border)] pt-5">
                  <div className="premium-dashboard-toolbar rounded-xl p-6 text-center">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm premium-dashboard-subtitle">This ticket has been closed.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
