"use client";

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
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
  ExternalLink,
  Server,
  Building2,
} from "lucide-react";
import { toast } from 'sonner';

interface Company {
  _id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

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
  showOnOrderPage?: boolean;
  targetProvider?: string | null;
  targetCompany?: string | Company | null;
  communityLink?: string;
  scheduledFor?: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_COLUMNS = [
  { id: 'advps', label: 'ADVPS', hint: 'Orders on ADVPS provider' },
  { id: 'smartvps', label: 'SmartVPS', hint: 'Orders on SmartVPS provider' },
  { id: 'hostycare', label: 'Hostycare', hint: 'Orders on Hostycare provider' },
  { id: 'netbay', label: 'Netbay', hint: 'Orders on Netbay provider' },
  { id: 'oceanlinux', label: 'OceanLinux', hint: 'OceanLinux / slot IP orders' },
] as const;

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
  showOnOrderPage: boolean;
  targetProvider: string;
  targetCompany: string;
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
  showOnOrderPage: false,
  targetProvider: '',
  targetCompany: '',
  communityLink: '',
  scheduledFor: ''
};

function AnnouncementForm({
  isEdit = false,
  formData,
  setFormData,
  companies,
  isSubmitting,
  onCancel,
  onSaveDraft,
  onPublish,
  onSave,
  onSaveAndPublish,
}: {
  isEdit?: boolean;
  formData: FormData;
  setFormData: Dispatch<SetStateAction<FormData>>;
  companies: Company[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onSave: () => void;
  onSaveAndPublish: () => void;
}) {
  const canSubmit = !isSubmitting && !!formData.title && !!formData.content;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData((prev) => ({ ...prev, type: v as FormData['type'] }))}>
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
          <Select value={formData.targetAudience} onValueChange={(v) => setFormData((prev) => ({ ...prev, targetAudience: v as FormData['targetAudience'] }))}>
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
          onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <Label>Content</Label>
        <Textarea
          placeholder="Enter your announcement content..."
          value={formData.content}
          onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
          rows={5}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Action Button Text (Optional)</Label>
          <Input
            placeholder="e.g., Learn More, View Offer"
            value={formData.actionText}
            onChange={(e) => setFormData((prev) => ({ ...prev, actionText: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Action Button URL (Optional)</Label>
          <Input
            placeholder="https://..."
            value={formData.actionUrl}
            onChange={(e) => setFormData((prev) => ({ ...prev, actionUrl: e.target.value }))}
          />
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        {formData.showOnOrderPage && (
          <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-sm">
            <p className="font-medium text-primary">Manage Order News</p>
            <p className="text-xs text-muted-foreground mt-1">
              Shown on <code>/dashboard/order/[id]</code> for matching servers only.
            </p>
            <p className="text-xs mt-2">
              Target:{' '}
              <strong>
                {formData.targetCompany
                  ? companies.find((c) => c._id === formData.targetCompany)?.name ||
                    `Company ${formData.targetCompany}`
                  : PROVIDER_COLUMNS.find((p) => p.id === formData.targetProvider)?.label ||
                    formData.targetProvider ||
                    'Not set'}
              </strong>
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Show as Login Popup</Label>
            <p className="text-xs text-muted-foreground">
              Display this as a popup after users log in (no emails sent).
            </p>
          </div>
          <Switch
            checked={formData.showAsLoginPopup}
            disabled={formData.showOnOrderPage}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, showAsLoginPopup: checked }))}
          />
        </div>

        {formData.showAsLoginPopup && !formData.showOnOrderPage && (
          <div className="space-y-2">
            <Label>Community Link (WhatsApp)</Label>
            <Input
              placeholder="https://chat.whatsapp.com/..."
              value={formData.communityLink}
              onChange={(e) => setFormData((prev) => ({ ...prev, communityLink: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Users will see a &quot;Join Our Community&quot; WhatsApp banner in the popup.
            </p>
          </div>
        )}
      </div>

      {isEdit ? (
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {formData.showOnOrderPage && (
            <Button variant="secondary" onClick={onSaveAndPublish} disabled={!canSubmit}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Publish'}
            </Button>
          )}
          <Button onClick={onSave} disabled={!canSubmit}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </div>
      ) : (
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onSaveDraft} disabled={!canSubmit}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save as Draft'}
          </Button>
          <Button onClick={onPublish} disabled={!canSubmit}>
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {formData.showAsLoginPopup ? 'Publish Popup' : formData.showOnOrderPage ? 'Publish Order News' : 'Send Now'}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
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
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await fetch('/api/admin/companies', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCompanies(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const response = await fetch('/api/admin/announcements', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setAnnouncements(Array.isArray(data) ? data : []);
      } else {
        const err = await response.json().catch(() => ({}));
        console.error('Announcements API error:', response.status, err);
        toast.error(err.message || 'Failed to load announcements');
        setAnnouncements([]);
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

  const handleUpdate = async (publish = false) => {
    if (!editingId) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = { ...formData };
      if (publish && formData.showOnOrderPage) {
        payload.status = 'sent';
      }

      const response = await fetch(`/api/admin/announcements/${editingId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success(publish ? 'Order news published' : 'Announcement updated');
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
    const companyId = typeof a.targetCompany === 'object' && a.targetCompany
      ? a.targetCompany._id
      : (a.targetCompany as string) || '';
    setFormData({
      title: a.title,
      content: a.content,
      type: a.type,
      targetAudience: a.targetAudience,
      actionUrl: a.actionUrl || '',
      actionText: a.actionText || '',
      showAsLoginPopup: a.showAsLoginPopup || false,
      showOnOrderPage: a.showOnOrderPage || false,
      targetProvider: a.targetProvider || '',
      targetCompany: companyId,
      communityLink: a.communityLink || '',
      scheduledFor: a.scheduledFor || ''
    });
    setShowEditDialog(true);
  };

  const openCreateForOrderNews = (target: { provider?: string; companyId?: string }) => {
    setFormData({
      ...emptyForm,
      showOnOrderPage: true,
      showAsLoginPopup: false,
      targetProvider: target.provider || '',
      targetCompany: target.companyId || '',
    });
    setShowCreateDialog(true);
  };

  const getCompanyId = (item: Announcement) => {
    if (!item.targetCompany) return '';
    const company = item.targetCompany;
    return typeof company === 'object' ? String(company._id) : String(company);
  };

  const getAllForOrderTarget = (provider?: string, companyId?: string) => {
    return orderNewsPopups
      .filter((a) => {
        if (companyId) return getCompanyId(a) === String(companyId);
        if (provider) return a.targetProvider === provider && !getCompanyId(a);
        return false;
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
  };

  const handleTogglePopup = async (id: string, currentValue: boolean, item?: Announcement) => {
    setTogglingId(id);
    try {
      const newValue = !currentValue;
      const payload: Record<string, any> = {};

      if (newValue) {
        payload.status = 'sent';
        if (item?.showOnOrderPage) {
          payload.showOnOrderPage = true;
          payload.showAsLoginPopup = false;
        }
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
  const orderNewsPopups = announcements.filter(a => a.showOnOrderPage && !a.showAsLoginPopup);
  const emailAnnouncements = announcements.filter(a => !a.showAsLoginPopup && !a.showOnOrderPage);
  const activeLoginPopup = announcements.find(a => a.showAsLoginPopup && a.status === 'sent');
  const liveOrderNews = orderNewsPopups.filter(a => a.status === 'sent');

  const getPlacementLabel = (item: Announcement) => {
    if (item.showOnOrderPage) {
      const companyId = getCompanyId(item);
      if (companyId) {
        const company = companies.find((c) => c._id === companyId);
        return company
          ? `Manage Order — ${company.name} (/company/${company.slug})`
          : 'Manage Order — Company';
      }
      const provider = PROVIDER_COLUMNS.find((p) => p.id === item.targetProvider);
      return provider
        ? `Manage Order — ${provider.label}`
        : `Manage Order — ${item.targetProvider || 'Unknown'}`;
    }
    if (item.showAsLoginPopup) return 'Login Popup (after sign-in)';
    return 'Email / Notifications';
  };

  const formatWhen = (value?: string) =>
    value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const getActiveOrderNews = (provider?: string, companyId?: string) => {
    return getAllForOrderTarget(provider, companyId).find((a) => a.status === 'sent');
  };

  const renderOrderNewsItem = (item: Announcement) => (
    <div
      key={item._id}
      className={`rounded-lg border p-3 space-y-2 ${item.status === 'sent' ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900' : 'bg-muted/20'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm line-clamp-2">{item.title}</p>
        {item.status === 'sent' ? (
          <Badge className="bg-green-600 text-white text-[10px] shrink-0">Live</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] shrink-0">Draft</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-3">{item.content}</p>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <Switch
            checked={item.status === 'sent'}
            disabled={togglingId === item._id}
            onCheckedChange={() => handleTogglePopup(item._id, item.status === 'sent', item)}
          />
          <span className="text-xs text-muted-foreground">
            {item.status === 'sent' ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEditDialog(item)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(item._id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
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
          <p className="text-muted-foreground">Manage announcements, email blasts, login popups, and per-provider order news</p>
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
            <AnnouncementForm
              formData={formData}
              setFormData={setFormData}
              companies={companies}
              isSubmitting={isSubmitting}
              onCancel={() => { setShowCreateDialog(false); setFormData({ ...emptyForm }); }}
              onSaveDraft={() => handleSubmit('draft')}
              onPublish={() => handleSubmit('send')}
              onSave={() => handleUpdate(false)}
              onSaveAndPublish={() => handleUpdate(true)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Live overview — always visible */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            What&apos;s Live Right Now
          </CardTitle>
          <CardDescription>
            {announcements.length} total announcement{announcements.length === 1 ? '' : 's'} in database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground mb-1">Login popup (shows after sign-in)</p>
              {activeLoginPopup ? (
                <>
                  <p className="font-medium text-sm text-green-700 dark:text-green-400">● Running</p>
                  <p className="text-sm mt-1 line-clamp-1">{activeLoginPopup.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Updated {formatWhen(activeLoginPopup.updatedAt)}</p>
                  <p className="text-[11px] text-primary mt-1">Edit / stop → <strong>News Popups</strong> tab</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">None active</p>
              )}
            </div>
            <div className="rounded-lg border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground mb-1">Manage order news (per provider/company)</p>
              {liveOrderNews.length > 0 ? (
                <>
                  <p className="font-medium text-sm text-green-700 dark:text-green-400">● {liveOrderNews.length} running</p>
                  <div className="mt-1 space-y-1 max-h-20 overflow-y-auto">
                    {liveOrderNews.map((item) => (
                      <p key={item._id} className="text-xs line-clamp-1">
                        <strong>{getPlacementLabel(item).replace('Manage Order — ', '')}:</strong> {item.title}
                      </p>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">None active — use <strong>Manage Order News</strong> tab</p>
              )}
            </div>
            <div className="rounded-lg border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground mb-1">Email announcements</p>
              <p className="font-medium text-sm">
                {emailAnnouncements.filter((a) => a.status === 'sent').length} sent
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {emailAnnouncements.length} total in Email tab
              </p>
            </div>
          </div>

          {announcements.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                All your news ({announcements.length})
              </div>
              <div className="max-h-56 overflow-y-auto divide-y">
                {announcements.map((item) => (
                  <div key={item._id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{item.title}</span>
                        {item.status === 'sent' ? (
                          <Badge className="bg-green-600 text-white text-[10px]">Live</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Draft</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{getPlacementLabel(item)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      <span>Updated {formatWhen(item.updatedAt)}</span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEditDialog(item)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {announcements.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No announcements in database yet. Create one using a tab below or the Create New button.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="popups" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Eye className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="popups" className="gap-2">
            <BellRing className="w-4 h-4" />
            News Popups
            {newsPopups.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{newsPopups.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="order-news" className="gap-2">
            <Server className="w-4 h-4" />
            Manage Order News
            {orderNewsPopups.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{orderNewsPopups.length}</Badge>
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

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where each type shows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p><strong className="text-foreground">News Popups</strong> — After login on any dashboard page (once per session).</p>
              <p><strong className="text-foreground">Manage Order News</strong> — On <code>/dashboard/order/[id]</code> for matching ADVPS, SmartVPS, Hostycare, company, etc.</p>
              <p><strong className="text-foreground">Email Announcements</strong> — Sent to user emails + notifications page (not a popup).</p>
              <p className="text-xs pt-2 border-t">
                Your screenshot shows <strong>News Popups</strong> empty — your news may be under <strong>Manage Order News</strong> or <strong>Email</strong>. Check the green <strong>What&apos;s Live Right Now</strong> box above.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── NEWS POPUPS TAB ───── */}
        <TabsContent value="popups" className="space-y-6">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4 space-y-2 text-sm">
              <p className="font-medium text-foreground">This is your login / home dashboard popup</p>
              <p className="text-muted-foreground">
                Shows once after a user logs in (dashboard home and all dashboard pages). To control it:
              </p>
              <ul className="text-muted-foreground list-disc pl-5 space-y-1">
                <li><strong className="text-foreground">Stop popup</strong> — turn the <strong>toggle OFF</strong> (switch left of the news card)</li>
                <li><strong className="text-foreground">Edit text</strong> — click the <strong>pencil</strong> icon → change title/content → Save Changes</li>
                <li><strong className="text-foreground">Delete</strong> — click the red <strong>trash</strong> icon</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="py-3 text-sm text-muted-foreground">
              For news on a specific server order page (<code>/dashboard/order/...</code>), use the{' '}
              <strong>Manage Order News</strong> tab instead.
            </CardContent>
          </Card>
          {/* Active popup indicator */}
          {activeLoginPopup ? (
            <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30">
              <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 py-4">
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">● RUNNING — users see this after login</p>
                  <p className="text-sm text-green-600 dark:text-green-400 truncate">{activeLoginPopup.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">Updated {formatWhen(activeLoginPopup.updatedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(activeLoginPopup)}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={togglingId === activeLoginPopup._id}
                    onClick={() => handleTogglePopup(activeLoginPopup._id, true)}
                  >
                    <PowerOff className="w-3.5 h-3.5 mr-1" />
                    Stop Popup
                  </Button>
                </div>
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

        {/* ───── MANAGE ORDER NEWS TAB ───── */}
        <TabsContent value="order-news" className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">
                Each column is a separate news slot. Customers only see news for their server&apos;s provider or linked company when they open{' '}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/dashboard/order/[id]</code>.
                Company news overrides provider news for that company&apos;s orders.
                Enabling a new item automatically disables the previous live one in the same column (it moves to Draft — not deleted).
              </p>
            </CardContent>
          </Card>

          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              Provider News
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
              {PROVIDER_COLUMNS.map((column) => {
                const items = getAllForOrderTarget(column.id);
                const active = getActiveOrderNews(column.id);
                return (
                  <Card key={column.id} className={active ? 'border-green-300 dark:border-green-800' : 'border-dashed'}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        <span>{column.label}</span>
                        {active && <Badge className="bg-green-600 text-white text-[10px]">Live</Badge>}
                      </CardTitle>
                      <CardDescription className="text-xs">{column.hint}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {items.length > 0 ? (
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {items.map((item) => renderOrderNewsItem(item))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground py-2">No news yet for {column.label} orders.</p>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => openCreateForOrderNews({ provider: column.id })}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add News
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Company News
            </h2>
            {companies.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No companies found. Link IP stock to a company to target company-specific order news.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {companies.map((company) => {
                  const items = getAllForOrderTarget(undefined, company._id);
                  const active = getActiveOrderNews(undefined, company._id);
                  return (
                    <Card key={company._id} className={active ? 'border-green-300 dark:border-green-800' : 'border-dashed'}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center justify-between gap-2">
                          <span className="truncate">{company.name}</span>
                          {active && <Badge className="bg-green-600 text-white text-[10px]">Live</Badge>}
                        </CardTitle>
                        <CardDescription className="text-xs font-mono">
                          /company/{company.slug}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {items.length > 0 ? (
                          <div className="space-y-2 max-h-72 overflow-y-auto">
                            {items.map((item) => renderOrderNewsItem(item))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">
                            No news yet for {company.name} orders.
                          </p>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => openCreateForOrderNews({ companyId: company._id })}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add News
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
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
          <AnnouncementForm
            isEdit
            formData={formData}
            setFormData={setFormData}
            companies={companies}
            isSubmitting={isSubmitting}
            onCancel={() => { setShowEditDialog(false); setEditingId(null); setFormData({ ...emptyForm }); }}
            onSaveDraft={() => handleSubmit('draft')}
            onPublish={() => handleSubmit('send')}
            onSave={() => handleUpdate(false)}
            onSaveAndPublish={() => handleUpdate(true)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
