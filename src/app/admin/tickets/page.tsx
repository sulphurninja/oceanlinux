"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Eye,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Users,
  Calendar,
  Loader2
} from "lucide-react";
import Link from "next/link";

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
  };
  messages: any[];
  createdAt: string;
  updatedAt: string;
}

const statusConfig = {
  open: { icon: AlertCircle, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', label: 'Open' },
  'in-progress': { icon: Clock, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', label: 'In Progress' },
  'waiting-response': { icon: MessageSquare, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', label: 'Waiting Response' },
  resolved: { icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', label: 'Resolved' },
  closed: { icon: XCircle, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', label: 'Closed' }
};

const priorityConfig = {
  low: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', label: 'Low' },
  medium: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', label: 'Medium' },
  high: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', label: 'High' },
  critical: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', label: 'Critical' }
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, priorityFilter, searchQuery]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/admin/tickets?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      } else {
        console.error('Failed to fetch tickets');
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTickets = tickets;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading tickets...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Support Tickets</h1>
          <p className="text-muted-foreground">Manage customer support requests</p>
        </div>
        <div className="flex items-center space-x-4">
          <Badge variant="outline" className="px-3 py-1">
            <Users className="w-4 h-4 mr-1" />
            {tickets.length} Total Tickets
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Open</p>
                <p className="text-2xl font-bold">{tickets.filter(t => t.status === 'open').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">In Progress</p>
                <p className="text-2xl font-bold">{tickets.filter(t => t.status === 'in-progress').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Waiting Response</p>
                <p className="text-2xl font-bold">{tickets.filter(t => t.status === 'waiting-response').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">Resolved</p>
                <p className="text-2xl font-bold">{tickets.filter(t => t.status === 'resolved').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search tickets, users, or ticket IDs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="waiting-response">Waiting Response</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tickets ({filteredTickets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredTickets.map((ticket) => {
              const StatusIcon = statusConfig[ticket.status as keyof typeof statusConfig].icon;
              return (
                <div key={ticket._id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <StatusIcon className="w-4 h-4" />
                      <Badge variant="outline" className="font-mono text-xs">
                        {ticket.ticketId}
                      </Badge>
                    </div>
                    <div>
                      <h3 className="font-medium">{ticket.subject}</h3>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <span>{ticket.userId.name}</span>
                        <span>•</span>
                        <span>{ticket.userId.email}</span>
                        <span>•</span>
                        <span className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span className="flex items-center">
                          <MessageSquare className="w-3 h-3 mr-1" />
                          {ticket.messages.length} messages
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Badge className={priorityConfig[ticket.priority as keyof typeof priorityConfig].color}>
                      {priorityConfig[ticket.priority as keyof typeof priorityConfig].label}
                    </Badge>
                    <Badge className={statusConfig[ticket.status as keyof typeof statusConfig].color}>
                      {statusConfig[ticket.status as keyof typeof statusConfig].label}
                    </Badge>
                    <Link href={`/admin/tickets/${ticket.ticketId}`}>
                      <Button variant="outline" size="sm">
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}

            {filteredTickets.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No tickets found</h3>
                <p className="text-muted-foreground text-sm">
                  {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                    ? 'No tickets match your current filters.'
                    : 'No support tickets have been created yet.'
                  }
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
