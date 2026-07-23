import {
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { premiumBadge } from '@/lib/premium-badges';

export interface SupportTicketRow {
  _id: string;
  ticketId: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketMessage {
  author: string;
  authorName: string;
  message: string;
  timestamp: string;
  isInternal?: boolean;
}

export interface SupportTicketDetail extends SupportTicketRow {
  description: string;
  messages: SupportTicketMessage[];
}

export const statusConfig = {
  open: { icon: AlertCircle, label: 'Open' },
  'in-progress': { icon: Clock, label: 'In Progress' },
  'waiting-response': { icon: MessageSquare, label: 'Waiting Response' },
  resolved: { icon: CheckCircle, label: 'Resolved' },
  closed: { icon: XCircle, label: 'Closed' },
} as const;

export const priorityConfig = {
  low: { label: 'Low' },
  medium: { label: 'Medium' },
  high: { label: 'High' },
  critical: { label: 'Critical' },
} as const;

const statusBadgeMap: Record<string, string> = {
  open: premiumBadge.info,
  'in-progress': premiumBadge.pending,
  'waiting-response': premiumBadge.warning,
  resolved: premiumBadge.success,
  closed: premiumBadge.neutral,
};

const priorityBadgeMap: Record<string, string> = {
  low: premiumBadge.neutral,
  medium: premiumBadge.info,
  high: premiumBadge.warning,
  critical: premiumBadge.error,
};

export function resolveStatus(status: string) {
  return statusConfig[status as keyof typeof statusConfig] || statusConfig.open;
}

export function resolvePriority(priority: string) {
  return priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium;
}

export function statusBadgeClass(status: string) {
  return statusBadgeMap[status] || premiumBadge.info;
}

export function priorityBadgeClass(priority: string) {
  return priorityBadgeMap[priority] || premiumBadge.neutral;
}

export function formatTicketDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}
