"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Send,
  Eye,
  Trash2,
  Users,
  Mail,
  BarChart3,
  Megaphone,
  CheckCircle,
  Loader2,
  MessageCircle,
  Pencil,
  BellRing,
  Power,
  PowerOff,
  ExternalLink
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
  showAsLoginPopup?: boolean;
  communityLink?: string;
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

type FormData = {
  title: string;
  content: string;
  type: Announcement['type'];
  targetAudience: Announcement['targetAudience'];
  actionUrl: string;
  actionText: string;
  showAsLoginPopup: boolean;
  communityLink: string;
  scheduledFor: string;
};

const emptyForm: FormData = {
  title: '',
  content: '',
  type: 'update',
  targetAudience: 'all',
  actionUrl: '',
  actionText: '',
  showAsLoginPopup: false,
  communityLink: '',
  scheduledFor: ''
};

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          status: action === 'send' ? 'sent' : 'draft'
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(result?.message || (action === 'send' ? 'Announcement sent!' : 'Saved as draft'));
        setShowCreateDialog(false);
        setFormData({ ...emptyForm });
        fetchAnnouncements();
        if (action === 'send') fetchStats();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to create announcement');
      }
    } catch {
      toast.error('Failed to create announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/announcements/${editingId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success('Announcement updated');
        setShowEditDialog(false);
        setEditingId(null);
        setFormData({ ...emptyForm });
        fetchAnnouncements();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (a: Announcement) => {
    setEditingId(a._id);
    setFormData({
      title: a.title,
      content: a.content,
      type: a.type,
      targetAudience: a.targetAudience,
      actionUrl: a.actionUrl || '',
      actionText: a.actionText || '',
      showAsLoginPopup: a.showAsLoginPopup || false,
      communityLink: a.communityLink || '',
      scheduledFor: a.scheduledFor || ''
    });
    setShowEditDialog(true);
  };

  const handleTogglePopup = async (id: string, currentValue: boolean) => {
    setTogglingId(id);
    try {
      const newValue = !currentValue;
      const payload: Record<string, any> = {};

      if (newValue) {
        payload.status = 'sent';
      } else {
        payload.status = 'draft';
      }

      const response = await fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success(newValue ? 'News popup enabled' : 'News popup disabled');
        fetchAnnouncements();
      } else {
        toast.error('Failed to toggle popup');
      }
    } catch {
      toast.error('Failed to toggle popup');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSendDraft = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/announcements/${id}/send`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(result?.message || 'Announcement sent!');
        fetchAnnouncements();
        fetchStats();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to send');
      }
    } catch {
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
        toast.success('Deleted successfully');
        fetchAnnouncements();
      } else {
        toast.error('Failed to delete');
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  const newsPopups = announcements.filter(a => a.showAsLoginPopup);
  const emailAnnouncements = announcements.filter(a => !a.showAsLoginPopup);
  const activePopup = newsPopups.find(a => a.status === 'sent');

  const AnnouncementForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(typeConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2"><span>{config.icon}</span>{config.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Target Audience</Label>
          <Select value={formData.targetAudience} onValueChange={(v) => setFormData({ ...formData, targetAudience: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(audienceConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2"><span>{config.icon}</span>{config.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          placeholder="Enter announcement title..."
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Content</Label>
        <Textarea
          placeholder="Enter your announcement content..."
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          rows={5}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Action Button Text (Optional)</Label>
          <Input
            placeholder="e.g., Learn More, View Offer"
            value={formData.actionText}
            onChange={(e) => setFormData({ ...formData, actionText: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Action Button URL (Optional)</Label>
          <Input
            placeholder="https://..."
            value={formData.actionUrl}
            onChange={(e) => setFormData({ ...formData, actionUrl: e.target.value })}
          />
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Show as Login Popup</Label>
            <p className="text-xs text-muted-foreground">
              Display this as a popup after users log in (no emails sent).
            </p>
          </div>
          <Switch
            checked={formData.showAsLoginPopup}
            onCheckedChange={(checked) => setFormData({ ...formData, showAsLoginPopup: checked })}
          />
        </div>

        {formData.showAsLoginPopup && (
          <div className="space-y-2">
            <Label>Community Link (WhatsApp)</Label>
            <Input
              placeholder="https://chat.whatsapp.com/..."
              value={formData.communityLink}
              onChange={(e) => setFormData({ ...formData, communityLink: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Users will see a "Join Our Community" WhatsApp banner in the popup.
            </p>
          </div>
        )}
      </div>

      {isEdit ? (
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingId(null); }}>
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={isSubmitting || !formData.title || !formData.content}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </div>
      ) : (
        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => handleSubmit('draft')}
            disabled={isSubmitting || !formData.title || !formData.content}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save as Draft'}
          </Button>
          <Button
            onClick={() => handleSubmit('send')}
            disabled={isSubmitting || !formData.title || !formData.content}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {formData.showAsLoginPopup ? 'Publish Popup' : 'Send Now'}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );

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
          <p className="text-muted-foreground">Manage announcements, email blasts, and login news popups</p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={(v) => { setShowCreateDialog(v); if (!v) setFormData({ ...emptyForm }); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Announcement</DialogTitle>
            </DialogHeader>
            <AnnouncementForm />
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="popups" className="space-y-6">
        <TabsList>
          <TabsTrigger value="popups" className="gap-2">
            <BellRing className="w-4 h-4" />
            News Popups
            {newsPopups.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{newsPopups.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="emails" className="gap-2">
            <Mail className="w-4 h-4" />
            Email Announcements
            {emailAnnouncements.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{emailAnnouncements.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ───── NEWS POPUPS TAB ───── */}
        <TabsContent value="popups" className="space-y-6">
          {/* Active popup indicator */}
          {activePopup ? (
            <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">Active login popup</p>
                  <p className="text-sm text-green-600 dark:text-green-400 truncate">{activePopup.title}</p>
                </div>
                <Badge className="bg-green-600 text-white">Live</Badge>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <PowerOff className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No active login popup</p>
                  <p className="text-xs text-muted-foreground">Create and enable a popup to show it to users after login.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {newsPopups.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <BellRing className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No news popups yet</h3>
                <p className="text-muted-foreground mb-4">Create a popup to show announcements after user login.</p>
                <Button onClick={() => { setFormData({ ...emptyForm, showAsLoginPopup: true }); setShowCreateDialog(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create News Popup
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {newsPopups.map((popup) => (
                <Card key={popup._id} className={popup.status === 'sent' ? 'border-green-200 dark:border-green-800' : ''}>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      {/* Enable / disable toggle */}
                      <div className="pt-1 flex-shrink-0">
                        <Switch
                          checked={popup.status === 'sent'}
                          disabled={togglingId === popup._id}
                          onCheckedChange={() => handleTogglePopup(popup._id, popup.status === 'sent')}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold truncate">{popup.title}</h3>
                          {popup.status === 'sent' ? (
                            <Badge className="bg-green-600 text-white text-[10px] gap-1">
                              <Power className="w-3 h-3" /> Enabled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <PowerOff className="w-3 h-3" /> Disabled
                            </Badge>
                          )}
                          <Badge className={typeConfig[popup.type].color}>
                            {typeConfig[popup.type].icon} {typeConfig[popup.type].label}
                          </Badge>
                          <Badge variant="outline">
                            {audienceConfig[popup.targetAudience].icon} {audienceConfig[popup.targetAudience].label}
                          </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{popup.content}</p>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {popup.communityLink && (
                            <a
                              href={popup.communityLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-green-600 hover:underline"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              WhatsApp Community
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {popup.actionUrl && (
                            <a
                              href={popup.actionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              CTA: {popup.actionText || 'Learn More'}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <span>Created {new Date(popup.createdAt).toLocaleDateString()}</span>
                          {popup.sentAt && <span>Published {new Date(popup.sentAt).toLocaleDateString()}</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(popup)}>
                          <Pencil className="w-4 h-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete News Popup</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure? This will permanently delete this news popup.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(popup._id)} className="bg-red-600 hover:bg-red-700">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───── EMAIL ANNOUNCEMENTS TAB ───── */}
        <TabsContent value="emails" className="space-y-6">
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

          {/* Email Announcements List */}
          <Card>
            <CardHeader>
              <CardTitle>Email Announcements</CardTitle>
              <CardDescription>Announcements sent via email and in-app notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {emailAnnouncements.length === 0 ? (
                <div className="text-center py-12">
                  <Megaphone className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No email announcements yet</h3>
                  <p className="text-muted-foreground mb-4">Create your first announcement to send to users via email.</p>
                  <Button onClick={() => { setFormData({ ...emptyForm }); setShowCreateDialog(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Announcement
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {emailAnnouncements.map((announcement) => (
                    <div key={announcement._id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
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
                              <> &bull; Sent: {new Date(announcement.sentAt).toLocaleString()}</>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(announcement)}>
                            <Pencil className="w-4 h-4" />
                          </Button>

                          {announcement.status === 'draft' && (
                            <Button size="sm" onClick={() => handleSendDraft(announcement._id)} className="gap-2">
                              <Send className="w-4 h-4" />
                              Send
                            </Button>
                          )}

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
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
                                <AlertDialogAction onClick={() => handleDelete(announcement._id)} className="bg-red-600 hover:bg-red-700">
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
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(v) => { setShowEditDialog(v); if (!v) { setEditingId(null); setFormData({ ...emptyForm }); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
          </DialogHeader>
          <AnnouncementForm isEdit />
        </DialogContent>
      </Dialog>
    </div>
  );
}
