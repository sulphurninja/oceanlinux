"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Send,
  Eye,
  Trash2,
  Calendar,
  Users,
  Mail,
  BarChart3,
  Megaphone,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2
} from "lucide-react";
import { toast } from 'sonner';

interface Announcement {
  _id: string;
  title: string;
  content: string;
  type: 'promotion' | 'update' | 'maintenance' | 'feature' | 'security';
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
  targetAudience: 'all' | 'customers' | 'new-users' | 'premium';
  actionUrl?: string;
  actionText?: string;
  scheduledFor?: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

const typeConfig = {
  promotion: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: '🎉', label: 'Promotion' },
  update: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: '🔄', label: 'Update' },
  maintenance: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', icon: '🔧', label: 'Maintenance' },
  feature: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: '✨', label: 'Feature' },
  security: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300', icon: '🛡️', label: 'Security' }
};

const statusConfig = {
  draft: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', icon: '📝' },
  scheduled: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', icon: '⏰' },
  sent: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: '✅' },
  cancelled: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: '❌' }
};

const audienceConfig = {
  all: { label: 'All Users', icon: '👥' },
  customers: { label: 'Customers Only', icon: '💼' },
  'new-users': { label: 'New Users', icon: '🆕' },
  premium: { label: 'Premium Users', icon: '⭐' }
};

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'update' as const,
    targetAudience: 'all' as const,
    actionUrl: '',
    actionText: '',
    scheduledFor: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState({
    totalSent: 0,
    totalOpened: 0,
    totalClicked: 0,
    averageOpenRate: 0
  });

  useEffect(() => {
    fetchAnnouncements();
    fetchStats();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const response = await fetch('/api/admin/announcements', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setAnnouncements(data);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
      toast.error('Failed to fetch announcements');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/announcements/stats', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSubmit = async (action: 'draft' | 'send') => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          status: action === 'send' ? 'sent' : 'draft'
        })
      });

      if (response.ok) {
        toast.success(action === 'send' ? 'Announcement sent successfully!' : 'Announcement saved as draft');
        setShowCreateDialog(false);
        setFormData({
          title: '',
          content: '',
          type: 'update',
          targetAudience: 'all',
          actionUrl: '',
          actionText: '',
          scheduledFor: ''
        });
        fetchAnnouncements();
        if (action === 'send') fetchStats();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to create announcement');
      }
    } catch (error) {
      toast.error('Failed to create announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendDraft = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/announcements/${id}/send`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Announcement sent successfully!');
        fetchAnnouncements();
        fetchStats();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to send announcement');
      }
    } catch (error) {
      toast.error('Failed to send announcement');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Announcement deleted successfully');
        fetchAnnouncements();
      } else {
        toast.error('Failed to delete announcement');
      }
    } catch (error) {
      toast.error('Failed to delete announcement');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
<div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading announcements...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Megaphone className="w-8 h-8 text-primary" />
            Announcements
          </h1>
          <p className="text-muted-foreground">Send announcements and updates to your users</p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Announcement</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={formData.type} onValueChange={(value) => setFormData({...formData, type: value as any})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <span>{config.icon}</span>
                            {config.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetAudience">Target Audience</Label>
                  <Select value={formData.targetAudience} onValueChange={(value) => setFormData({...formData, targetAudience: value as any})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(audienceConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <span>{config.icon}</span>
                            {config.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Enter announcement title..."
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  placeholder="Enter your announcement content..."
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  rows={6}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="actionText">Action Button Text (Optional)</Label>
                  <Input
                    id="actionText"
                    placeholder="e.g., Learn More, View Offer"
                    value={formData.actionText}
                    onChange={(e) => setFormData({...formData, actionText: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="actionUrl">Action Button URL (Optional)</Label>
                  <Input
                    id="actionUrl"
                    placeholder="https://..."
                    value={formData.actionUrl}
                    onChange={(e) => setFormData({...formData, actionUrl: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleSubmit('draft')}
                  disabled={isSubmitting || !formData.title || !formData.content}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '📝 Save as Draft'}
                </Button>
                <Button
                  onClick={() => handleSubmit('send')}
                  disabled={isSubmitting || !formData.title || !formData.content}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> Send Now</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSent.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Emails delivered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Opened</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOpened.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalSent > 0 ? `${((stats.totalOpened / stats.totalSent) * 100).toFixed(1)}%` : '0%'} open rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clicked</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClicked.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalSent > 0 ? `${((stats.totalClicked / stats.totalSent) * 100).toFixed(1)}%` : '0%'} click rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Open Rate</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageOpenRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Across all announcements</p>
          </CardContent>
        </Card>
      </div>

      {/* Announcements List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <div className="text-center py-12">
              <Megaphone className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No announcements yet</h3>
              <p className="text-muted-foreground mb-4">Create your first announcement to engage with your users</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Announcement
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((announcement) => (
                <div key={announcement._id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={typeConfig[announcement.type].color}>
                          {typeConfig[announcement.type].icon} {typeConfig[announcement.type].label}
                        </Badge>
                        <Badge className={statusConfig[announcement.status].color}>
                          {statusConfig[announcement.status].icon} {announcement.status.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">
                          {audienceConfig[announcement.targetAudience].icon} {audienceConfig[announcement.targetAudience].label}
                        </Badge>
                      </div>

                      <h3 className="text-lg font-semibold mb-2">{announcement.title}</h3>
                      <p className="text-muted-foreground mb-3 line-clamp-2">{announcement.content}</p>

                      {announcement.status === 'sent' && (
                        <div className="flex items-center gap-6 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {announcement.sentCount} sent
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-4 h-4" />
                            {announcement.openCount} opened
                            {announcement.sentCount > 0 && (
                              <span className="ml-1">
                                ({((announcement.openCount / announcement.sentCount) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-4 h-4" />
                            {announcement.clickCount} clicked
                          </span>
                        </div>
                      )}

                      <div className="mt-2 text-xs text-muted-foreground">
                        Created: {new Date(announcement.createdAt).toLocaleString()}
                        {announcement.sentAt && (
                          <> • Sent: {new Date(announcement.sentAt).toLocaleString()}</>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {announcement.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => handleSendDraft(announcement._id)}
                          className="gap-2"
                        >
                          <Send className="w-4 h-4" />
                          Send
                        </Button>
                      )}

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this announcement? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(announcement._id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
