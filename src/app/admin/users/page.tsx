"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Filter,
  Users,
  UserPlus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Shield,
  ShieldOff,
  Download,
  RefreshCw,
  Loader2,
  Calendar,
  Mail,
  Phone,
  CreditCard,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  FileText,
  Wallet,
  KeyRound,
} from "lucide-react";
import { toast } from 'sonner';
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isVerified: boolean;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  walletBalance?: number;
  lastOrderDate?: string;
}

interface UserStats {
  totalUsers: number;
  verifiedUsers: number;
  activeUsers: number;
  totalRevenue: number;
}

const roleConfig = {
  Admin: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', label: 'Admin' },
  User: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', label: 'User' }
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [walletUser, setWalletUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, [currentPage, searchQuery, roleFilter, statusFilter, sortBy, sortOrder]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        sortBy,
        sortOrder
      });

      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setTotalPages(data.pagination.totalPages);
        setSelectedUsers([]); // Clear selections when data refreshes
      } else {
        toast.error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // This could be a separate endpoint, for now we'll calculate basic stats
      const response = await fetch('/api/admin/users?limit=1', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setStats({
          totalUsers: data.pagination.totalUsers,
          verifiedUsers: 0, // Would need separate calculation
          activeUsers: 0,   // Would need separate calculation
          totalRevenue: 0   // Would need separate calculation
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleUserAction = async (userId: string, action: string, data?: any) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetUserId: userId, action, data })
      });

      if (response.ok) {
        toast.success(`User ${action} successful`);
        fetchUsers();
      } else {
        const error = await response.json();
        toast.error(error.message || `Failed to ${action} user`);
      }
    } catch (error) {
      console.error(`Error ${action} user:`, error);
      toast.error(`Failed to ${action} user`);
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedUsers.length === 0) {
      toast.error('Please select users first');
      return;
    }

    try {
      setBulkActionLoading(true);
      const response = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userIds: selectedUsers, action })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setSelectedUsers([]);
        fetchUsers();
      } else {
        const error = await response.json();
        toast.error(error.message || `Failed to ${action} users`);
      }
    } catch (error) {
      console.error(`Error ${action} users:`, error);
      toast.error(`Failed to ${action} users`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAllUsers = () => {
    setSelectedUsers(
      selectedUsers.length === users.length
        ? []
        : users.map(user => user._id)
    );
  };

  if (loading && users.length === 0) {
    return (
      <div className="min-w-0 overflow-x-hidden p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading users...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-hidden p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl lg:text-3xl">User Management</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Manage and monitor all platform users</p>
        </div>
        <Button onClick={fetchUsers} variant="outline" size="sm" className="w-full sm:w-auto shrink-0">
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-2 min-w-0">
                <Users className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">Total Users</p>
                  <p className="text-lg sm:text-2xl font-bold">{stats.totalUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-2 min-w-0">
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">Verified Users</p>
                  <p className="text-lg sm:text-2xl font-bold">{users.filter(u => u.isVerified).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-2 min-w-0">
                <TrendingUp className="w-4 h-4 text-purple-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">Active Orders</p>
                  <p className="text-lg sm:text-2xl font-bold">{users.reduce((sum, u) => sum + u.orderCount, 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-2 min-w-0">
                <CreditCard className="w-4 h-4 text-orange-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">Total Revenue</p>
                  <p className="text-lg sm:text-2xl font-bold truncate">₹{users.reduce((sum, u) => sum + u.totalSpent, 0).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters & Search</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-4">
            <div className="sm:col-span-2 lg:col-span-1 xl:col-span-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search name, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="User">User</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Join Date</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="totalSpent">Total Spent</SelectItem>
                <SelectItem value="orderCount">Order Count</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bulk Actions */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium shrink-0">{selectedUsers.length} selected</span>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleBulkAction('verify')}
                  disabled={bulkActionLoading}
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleBulkAction('unverify')}
                  disabled={bulkActionLoading}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Unverify
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleBulkAction('delete')}
                  disabled={bulkActionLoading}
                >
                  {bulkActionLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                  Delete
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Users ({users.length})</CardTitle>
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={selectedUsers.length === users.length && users.length > 0}
              onCheckedChange={toggleAllUsers}
            />
            <span className="text-sm text-muted-foreground">Select All</span>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="space-y-3 sm:space-y-4">
            {users.map((user) => (
              <div
                key={user._id}
                className="flex flex-col gap-3 p-3 sm:p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors min-w-0"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Checkbox
                    checked={selectedUsers.includes(user._id)}
                    onCheckedChange={() => toggleUserSelection(user._id)}
                    className="mt-1 shrink-0"
                  />
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback>
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-medium truncate max-w-full">{user.name}</h3>
                      {user.isVerified ? (
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                      )}
                      <Badge
                        variant={user.isVerified ? "default" : "secondary"}
                        className="sm:hidden shrink-0"
                      >
                        {user.isVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                      <span className="flex items-start min-w-0 sm:col-span-2">
                        <Mail className="w-3 h-3 mr-1.5 mt-0.5 shrink-0" />
                        <span className="break-all">{user.email}</span>
                      </span>
                      {user.phone && (
                        <span className="flex items-center min-w-0">
                          <Phone className="w-3 h-3 mr-1.5 shrink-0" />
                          <span className="truncate">{user.phone}</span>
                        </span>
                      )}
                      <span className="flex items-center min-w-0">
                        <Calendar className="w-3 h-3 mr-1.5 shrink-0" />
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center min-w-0">
                        <CreditCard className="w-3 h-3 mr-1.5 shrink-0" />
                        {user.orderCount} orders • ₹{user.totalSpent.toLocaleString()}
                      </span>
                      <span className="flex items-center min-w-0">
                        <Wallet className="w-3 h-3 mr-1.5 shrink-0" />
                        ₹{(user.walletBalance ?? 0).toLocaleString('en-IN')}
                      </span>
                      {user.lastOrderDate && (
                        <span className="text-xs sm:col-span-2">
                          Last order: {new Date(user.lastOrderDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 pl-9 sm:pl-0 border-t border-border/50 pt-3 sm:border-0 sm:pt-0">
                  <Badge variant={user.isVerified ? "default" : "secondary"} className="hidden sm:inline-flex">
                    {user.isVerified ? 'Verified' : 'Unverified'}
                  </Badge>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <Link href={`/admin/users/${user._id}`}>
                        <DropdownMenuItem>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                      </Link>
                      <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit User
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWalletUser(user)}>
                        <Wallet className="w-4 h-4 mr-2" />
                        Adjust Wallet Balance
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {user.isVerified ? (
                        <DropdownMenuItem onClick={() => handleUserAction(user._id, 'unverify')}>
                          <ShieldOff className="w-4 h-4 mr-2" />
                          Unverify User
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handleUserAction(user._id, 'verify')}>
                          <Shield className="w-4 h-4 mr-2" />
                          Verify User
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleUserAction(user._id, 'changeRole', { role: user.role === 'Admin' ? 'User' : 'Admin' })}>
                        <Users className="w-4 h-4 mr-2" />
                        Change Role
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPasswordUser(user)}>
                        <KeyRound className="w-4 h-4 mr-2" />
                        Change Password
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            {users.length === 0 && !loading && (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No users found</h3>
                <p className="text-muted-foreground text-sm">
                  {searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
                    ? 'No users match your current filters.'
                    : 'No users have registered yet.'
                  }
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground text-center sm:text-left">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && <EditUserForm user={selectedUser} onClose={() => setSelectedUser(null)} onUpdate={fetchUsers} />}
        </DialogContent>
      </Dialog>

      {/* Adjust Wallet Balance Dialog */}
      <Dialog open={!!walletUser} onOpenChange={(open) => !open && setWalletUser(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Wallet Balance</DialogTitle>
          </DialogHeader>
          {walletUser && (
            <AdjustWalletBalanceForm
              user={walletUser}
              onClose={() => setWalletUser(null)}
              onSuccess={fetchUsers}
            />
          )}
        </DialogContent>
      </Dialog>
      {/* Change Password Dialog */}
      <Dialog open={!!passwordUser} onOpenChange={(open) => !open && setPasswordUser(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          {passwordUser && (
            <ChangePasswordForm user={passwordUser} onClose={() => setPasswordUser(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChangePasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSave = async () => {
    if (newPassword.trim().length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${user._id}/password`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.message || 'Failed to update password');
        return;
      }
      toast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (error) {
      console.error('Error updating password:', error);
      toast.error('Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">{user.name}</p>
        <p className="text-muted-foreground">{user.email}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Passwords are encrypted and cannot be viewed. Enter a new password below.
      </p>

      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">New password</label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Confirm password</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Update Password
        </Button>
      </DialogFooter>
    </div>
  );
}

// Edit User Form Component
function EditUserForm({ user, onClose, onUpdate }: { user: User, onClose: () => void, onUpdate: () => void }) {
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetUserId: user._id,
          action: 'updateProfile',
          data: formData
        })
      });

      if (response.ok) {
        toast.success('User updated successfully');
        onUpdate();
        onClose();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to update user');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">Phone</label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Role</label>
          <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="User">User</SelectItem>
              <SelectItem value="Admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Update User
        </Button>
      </div>
    </form>
  );
}

function AdjustWalletBalanceForm({
  user,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [action, setAction] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [currentBalance, setCurrentBalance] = useState<number | null>(user.walletBalance ?? null);
  const [loading, setLoading] = useState(false);
  const [fetchingBalance, setFetchingBalance] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch(`/api/admin/users/${user._id}/wallet`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setCurrentBalance(data.wallet?.balance ?? 0);
        }
      } catch (error) {
        console.error('Failed to fetch wallet balance:', error);
      } finally {
        setFetchingBalance(false);
      }
    };
    fetchBalance();
  }, [user._id]);

  const parsedAmount = Number(amount);
  const projectedBalance =
    currentBalance != null && Number.isFinite(parsedAmount) && parsedAmount > 0
      ? action === 'add'
        ? currentBalance + parsedAmount
        : Math.max(0, currentBalance - parsedAmount)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid amount greater than 0');
      return;
    }

    if (action === 'deduct' && currentBalance != null && parsedAmount > currentBalance) {
      toast.error(`Cannot deduct more than current balance (₹${currentBalance.toLocaleString('en-IN')})`);
      return;
    }
    if (!/^\d{6}$/.test(authCode.trim())) {
      toast.error('Enter the 6-digit authenticator code');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user._id}/wallet`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          amount: parsedAmount,
          description: description.trim() || undefined,
          authCode: authCode.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || 'Wallet updated');
        onSuccess();
        onClose();
      } else {
        toast.error(data.message || 'Failed to update wallet balance');
      }
    } catch (error) {
      console.error('Error updating wallet balance:', error);
      toast.error('Failed to update wallet balance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">{user.name}</p>
        <p className="text-muted-foreground">{user.email}</p>
        <p className="mt-2 flex items-center gap-1.5">
          <Wallet className="w-4 h-4" />
          Current balance:{' '}
          {fetchingBalance ? (
            <Loader2 className="w-3 h-3 animate-spin inline" />
          ) : (
            <span className="font-semibold">₹{(currentBalance ?? 0).toLocaleString('en-IN')}</span>
          )}
        </p>
      </div>

      <div>
        <label className="text-sm font-medium">Action</label>
        <Select value={action} onValueChange={(v: 'add' | 'deduct') => setAction(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add">Add balance</SelectItem>
            <SelectItem value="deduct">Deduct balance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">
          Amount to {action === 'add' ? 'add' : 'deduct'} (₹)
        </label>
        <Input
          type="number"
          min="0.01"
          step="0.01"
          max={action === 'deduct' && currentBalance != null ? currentBalance : undefined}
          placeholder={action === 'add' ? 'e.g. 500' : 'e.g. 100'}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        {action === 'deduct' && currentBalance != null && (
          <p className="text-xs text-muted-foreground mt-1">
            Max deductible: ₹{currentBalance.toLocaleString('en-IN')}
          </p>
        )}
        {projectedBalance != null && (
          <p className="text-xs text-muted-foreground mt-1">
            New balance after {action}: ₹{projectedBalance.toLocaleString('en-IN')}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium">Google Authenticator code</label>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          value={authCode}
          onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
        />
      </div>

      <div>
        <label className="text-sm font-medium">Note (optional)</label>
        <Input
          placeholder={
            action === 'add'
              ? 'Reason for credit, e.g. refund, promo, manual top-up'
              : 'Reason for deduction, e.g. correction, chargeback'
          }
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={action === 'deduct' ? 'destructive' : 'default'}
          disabled={loading || fetchingBalance || authCode.length !== 6}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Wallet className="w-4 h-4 mr-2" />
          )}
          {action === 'add' ? 'Add Balance' : 'Deduct Balance'}
        </Button>
      </DialogFooter>
    </form>
  );
}
