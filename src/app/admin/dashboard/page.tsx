"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Ticket,
  BookOpen,
  Server,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  Loader2
} from "lucide-react";
import Link from "next/link";

interface AdminStats {
  users: {
    total: number;
    newThisMonth: number;
  };
  tickets: {
    total: number;
    open: number;
    inProgress: number;
    waitingResponse: number;
    resolved: number;
    recent: any[];
  };
  knowledgeBase: {
    total: number;
    published: number;
    newThisMonth: number;
  };
  systemHealth: {
    uptime: string;
    responseTime: string;
    status: string;
  };
}

const statusConfig = {
  open: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: AlertCircle },
  'in-progress': { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', icon: Clock },
  'waiting-response': { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', icon: MessageSquare },
  resolved: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: CheckCircle }
};

const priorityConfig = {
  low: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' },
  medium: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  high: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  critical: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' }
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        console.error('Failed to fetch stats');
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 ">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Failed to Load Dashboard</h2>
          <p className="text-muted-foreground">Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 ">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of your OceanLinux platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users.total.toLocaleString()}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                <TrendingUp className="w-3 h-3 mr-1" />
                +{stats.users.newThisMonth} this month
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Support Tickets</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.tickets.total}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <span className="text-blue-600">{stats.tickets.open} open</span>
              <span>•</span>
              <span className="text-yellow-600">{stats.tickets.inProgress} in progress</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.knowledgeBase.published}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                <TrendingUp className="w-3 h-3 mr-1" />
                +{stats.knowledgeBase.newThisMonth} this month
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Server Uptime</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.systemHealth.uptime}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                {stats.systemHealth.status}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tickets */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Support Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.tickets.recent.map((ticket, index) => {
                const StatusIcon = statusConfig[ticket.status as keyof typeof statusConfig]?.icon || AlertCircle;
                return (
                  <div key={ticket._id || index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <StatusIcon className="h-4 w-4" />
                      <div>
                        <p className="font-medium text-sm">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.userId?.name || 'Unknown User'} • {new Date(ticket.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={priorityConfig[ticket.priority as keyof typeof priorityConfig]?.color || 'bg-gray-100 text-gray-800'}>
                        {ticket.priority}
                      </Badge>
                      <Badge className={statusConfig[ticket.status as keyof typeof statusConfig]?.color || 'bg-blue-100 text-blue-800'}>
                        {ticket.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {stats.tickets.recent.length === 0 && (
                <p className="text-center text-muted-foreground py-4">No recent tickets</p>
              )}
            </div>
            <div className="mt-4">
              <Link href="/admin/tickets">
                <Badge variant="outline" className="w-full justify-center py-2 hover:bg-muted/50 cursor-pointer">
                  View All Tickets
                </Badge>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Server Uptime</span>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                  {stats.systemHealth.uptime}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">API Response Time</span>
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                  {stats.systemHealth.responseTime}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">System Status</span>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                  {stats.systemHealth.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Active Users</span>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                  {stats.users.total} total
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
