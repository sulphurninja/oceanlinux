'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Key,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  Calendar,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  BookOpen,
  Settings,
  Loader2,
  MoreHorizontal,
  Search,
  Filter,
  Download,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface APIKey {
  _id: string;
  name: string;
  description?: string;
  key: string;
  permissions: string[];
  lastUsed?: string;
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
  usageCount: number;
}

interface CreateKeyForm {
  name: string;
  description: string;
  permissions: string[];
  expiresIn: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'servers:read', label: 'View Servers', description: 'Read access to server information' },
  { id: 'servers:write', label: 'Manage Servers', description: 'Create, update, and delete servers' },
  { id: 'orders:read', label: 'View Orders', description: 'Read access to order information' },
  { id: 'orders:write', label: 'Manage Orders', description: 'Create and modify orders' },
  { id: 'billing:read', label: 'View Billing', description: 'Read access to billing information' },
  { id: 'support:read', label: 'View Tickets', description: 'Read access to support tickets' },
  { id: 'support:write', label: 'Manage Tickets', description: 'Create and update support tickets' },
];

const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never expires' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
  { value: 'custom', label: 'Custom date' }
];

const APIKeysPage = () => {
  const router = useRouter();
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [createForm, setCreateForm] = useState<CreateKeyForm>({
    name: '',
    description: '',
    permissions: [],
    expiresIn: 'never'
  });
  const [customExpiry, setCustomExpiry] = useState('');
  const [newKeyGenerated, setNewKeyGenerated] = useState<string>('');

  useEffect(() => {
    fetchAPIKeys();
  }, []);

  const fetchAPIKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users/api-keys');
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.keys);
      } else {
        toast.error('Failed to fetch API keys');
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error('Error loading API keys');
    } finally {
      setLoading(false);
    }
  };

  const createAPIKey = async () => {
    try {
      if (!createForm.name.trim()) {
        toast.error('Please enter a name for the API key');
        return;
      }

      if (createForm.permissions.length === 0) {
        toast.error('Please select at least one permission');
        return;
      }

      const expirationDate = createForm.expiresIn === 'custom'
        ? customExpiry
        : createForm.expiresIn === 'never'
          ? null
          : createForm.expiresIn;

      const response = await fetch('/api/users/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description,
          permissions: createForm.permissions,
          expiresIn: expirationDate
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setNewKeyGenerated(data.key.key);
        setApiKeys(prev => [data.key, ...prev]);
        setCreateForm({
          name: '',
          description: '',
          permissions: [],
          expiresIn: 'never'
        });
        setCustomExpiry('');
        toast.success('API key created successfully!');
      } else {
        toast.error(data.message || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Error creating API key');
    }
  };

  const deleteAPIKey = async (keyId: string) => {
    try {
      const response = await fetch(`/api/users/api-keys/${keyId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setApiKeys(prev => prev.filter(key => key._id !== keyId));
        toast.success('API key deleted successfully');
      } else {
        const data = await response.json();
        toast.error(data.message || 'Failed to delete API key');
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Error deleting API key');
    }
  };

  const toggleKeyStatus = async (keyId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/users/api-keys/${keyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (response.ok) {
        setApiKeys(prev => prev.map(key =>
          key._id === keyId ? { ...key, isActive: !isActive } : key
        ));
        toast.success(`API key ${!isActive ? 'activated' : 'deactivated'}`);
      } else {
        toast.error('Failed to update API key status');
      }
    } catch (error) {
      console.error('Error updating API key:', error);
      toast.error('Error updating API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('API key copied to clipboard');
  };

  const toggleKeyVisibility = (keyId: string) => {
    setShowKeys(prev => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Unknown';
    }
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getStatusBadge = (key: APIKey) => {
    if (isExpired(key.expiresAt)) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (!key.isActive) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    return <Badge variant="outline" className="text-green-600 border-green-200">Active</Badge>;
  };

  const filteredKeys = apiKeys.filter(key => {
    const matchesSearch = key.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         key.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterStatus === 'all' ||
                         (filterStatus === 'active' && key.isActive && !isExpired(key.expiresAt)) ||
                         (filterStatus === 'inactive' && !key.isActive) ||
                         (filterStatus === 'expired' && isExpired(key.expiresAt));

    return matchesSearch && matchesFilter;
  });

  return (
    <div className='min-h-screen bg-background'>
      {/* Mobile Header */}
      <div className="lg:hidden h-16" />

      {/* Header */}
      <div className='sticky md:hidden lg:top-0 z-40 bg-background/95 backdrop-blur-sm shadow-sm border-b border-border'>
        <div className='container mx-auto -mt-14 md:mt-0 px-3 sm:px-4 md:px-6 lg:px-8'>
          <div className='flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4'>
            <div className='flex items-center gap-2 sm:gap-3 min-w-0 flex-1'>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="hover:bg-muted rounded-full flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div className='flex items-center gap-2 sm:gap-3 min-w-0 flex-1'>
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <Key className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className='text-base sm:text-lg lg:text-xl font-bold'>API Keys</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">
                    Manage your API access keys
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAPIKeys}
                disabled={loading}
                className="gap-1 h-8 sm:h-9 px-2 sm:px-3"
              >
                <RefreshCw className={cn("h-3 w-3 sm:h-4 sm:w-4", loading && "animate-spin")} />
                <span className="hidden sm:inline text-xs">Refresh</span>
              </Button>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1 h-8 sm:h-9 px-2 sm:px-3">
                    <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="text-xs">New Key</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New API Key</DialogTitle>
                    <DialogDescription>
                      Create a new API key to access OceanLinux services programmatically.
                    </DialogDescription>
                  </DialogHeader>

                  {newKeyGenerated ? (
                    <div className="space-y-4">
                      <Alert>
                        <Shield className="h-4 w-4" />
                        <AlertTitle>API Key Generated Successfully!</AlertTitle>
                        <AlertDescription>
                          Please copy your API key now. You won't be able to see it again for security reasons.
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-2">
                        <Label>Your New API Key</Label>
                        <div className="flex gap-2">
                          <Input
                            value={newKeyGenerated}
                            readOnly
                            className="font-mono text-sm"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(newKeyGenerated)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNewKeyGenerated('');
                            setCreateDialogOpen(false);
                          }}
                        >
                          Close
                        </Button>
                        <Button
                          onClick={() => copyToClipboard(newKeyGenerated)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Key
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="keyName">Key Name *</Label>
                          <Input
                            id="keyName"
                            placeholder="e.g., Production API, Mobile App"
                            value={createForm.name}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="keyDescription">Description</Label>
                          <Textarea
                            id="keyDescription"
                            placeholder="Describe what this API key will be used for..."
                            value={createForm.description}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                            rows={3}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Expiration</Label>
                          <Select
                            value={createForm.expiresIn}
                            onValueChange={(value) => setCreateForm(prev => ({ ...prev, expiresIn: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EXPIRY_OPTIONS.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {createForm.expiresIn === 'custom' && (
                            <Input
                              type="datetime-local"
                              value={customExpiry}
                              onChange={(e) => setCustomExpiry(e.target.value)}
                              className="mt-2"
                            />
                          )}
                        </div>

                        <div className="space-y-3">
                          <Label>Permissions *</Label>
                          <div className="grid gap-3">
                            {AVAILABLE_PERMISSIONS.map(permission => (
                              <div key={permission.id} className="flex items-start space-x-3">
                                <Checkbox
                                  id={permission.id}
                                  checked={createForm.permissions.includes(permission.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setCreateForm(prev => ({
                                        ...prev,
                                        permissions: [...prev.permissions, permission.id]
                                      }));
                                    } else {
                                      setCreateForm(prev => ({
                                        ...prev,
                                        permissions: prev.permissions.filter(p => p !== permission.id)
                                      }));
                                    }
                                  }}
                                />
                                <div className="grid gap-1.5 leading-none">
                                  <Label
                                    htmlFor={permission.id}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                  >
                                    {permission.label}
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    {permission.description}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setCreateDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button onClick={createAPIKey}>
                          <Key className="h-4 w-4 mr-2" />
                          Create API Key
                        </Button>
                      </DialogFooter>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className='container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6'>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Key className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{apiKeys.length}</p>
                  <p className="text-xs text-muted-foreground">Total Keys</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {apiKeys.filter(key => key.isActive && !isExpired(key.expiresAt)).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {apiKeys.filter(key => isExpired(key.expiresAt)).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Expired</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Zap className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {apiKeys.reduce((sum, key) => sum + key.usageCount, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Uses</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search API keys..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Keys</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* API Keys List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Your API Keys
            </CardTitle>
            <CardDescription>
              Manage your API keys for accessing OceanLinux services
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading API keys...</span>
              </div>
            ) : filteredKeys.length === 0 ? (
              <div className="text-center py-12">
                <Key className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No API keys found</h3>
                <p className="text-muted-foreground mb-4">
                  {apiKeys.length === 0
                    ? 'Create your first API key to start using OceanLinux APIs.'
                    : 'No keys match your current search and filter criteria.'
                  }
                </p>
                {apiKeys.length === 0 && (
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First API Key
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredKeys.map((key) => (
                  <div
                    key={key._id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold truncate">{key.name}</h3>
                          {getStatusBadge(key)}
                          {key.permissions.includes('servers:write') && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              High Access
                            </Badge>
                          )}
                        </div>

                        {key.description && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {key.description}
                          </p>
                        )}

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs font-medium">API Key:</Label>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate flex-1">
                                {showKeys[key._id]
                                  ? key.key
                                  : `${key.key.substring(0, 8)}...${key.key.substring(key.key.length - 4)}`
                                }
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleKeyVisibility(key._id)}
                                className="h-7 w-7 p-0"
                              >
                                {showKeys[key._id] ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(key.key)}
                                className="h-7 w-7 p-0"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>Created: {formatDate(key.createdAt)}</span>
                            </div>
                            {key.lastUsed && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>Last used: {formatDate(key.lastUsed)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              <span>Uses: {key.usageCount}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-medium">Permissions:</span>
                            {key.permissions.map(permission => (
                              <Badge key={permission} variant="outline" className="text-xs">
                                {AVAILABLE_PERMISSIONS.find(p => p.id === permission)?.label || permission}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => copyToClipboard(key.key)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Key
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleKeyStatus(key._id, key.isActive)}
                          >
                            {key.isActive ? (
                              <>
                                <EyeOff className="h-4 w-4 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Eye className="h-4 w-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => deleteAPIKey(key._id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security Notice */}
        <Alert className="mt-6">
          <Shield className="h-4 w-4" />
          <AlertTitle>Security Best Practices</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>Never share your API keys in public repositories or client-side code</li>
              <li>Use environment variables to store API keys in your applications</li>
              <li>Regularly rotate your API keys and delete unused ones</li>
              <li>Grant only the minimum permissions necessary for your use case</li>
            </ul>
</AlertDescription>
        </Alert>

        {/* API Documentation */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              API Documentation
            </CardTitle>
            <CardDescription>
              Quick reference for using your API keys
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Authentication</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Include your API key in the Authorization header:
                </p>
                <div className="bg-muted p-3 rounded-lg font-mono text-sm">
                  Authorization: Bearer YOUR_API_KEY
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Base URL</h4>
                <div className="bg-muted p-3 rounded-lg font-mono text-sm">
                  https://oceanlinux.com/api
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Example Request</h4>
                <div className="bg-muted p-3 rounded-lg font-mono text-sm whitespace-pre-wrap">
{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     https://api.oceanlinux.com/v1/servers`}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href="/docs/api" target="_blank" rel="noopener noreferrer">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Full Documentation
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="/docs/api/examples" target="_blank" rel="noopener noreferrer">
                    <Zap className="h-4 w-4 mr-2" />
                    Code Examples
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default APIKeysPage;
