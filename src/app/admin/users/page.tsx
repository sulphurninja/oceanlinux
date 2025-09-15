"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarInitials } from "@/components/ui/avatar";
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
  FileText
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
      <div className="p-6 space-y-6">
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage and monitor all platform users</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={fetchUsers} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Total Users</p>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Verified Users</p>
                  <p className="text-2xl font-bold">{users.filter(u => u.isVerified).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Active Orders</p>
                  <p className="text-2xl font-bold">{users.reduce((sum, u) => sum + u.orderCount, 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">Total Revenue</p>
                  <p className="text-2xl font-bold">₹{users.reduce((sum, u) => sum + u.totalSpent, 0).toLocaleString()}</p>
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
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="User">User</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px]">
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
              <SelectTrigger className="w-[120px]">
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
            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">{selectedUsers.length} selected</span>
              <div className="flex items-center space-x-1 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('verify')}
                  disabled={bulkActionLoading}
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('unverify')}
                  disabled={bulkActionLoading}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Unverify
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users ({users.length})</CardTitle>
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={selectedUsers.length === users.length && users.length > 0}
              onCheckedChange={toggleAllUsers}
            />
            <span className="text-sm text-muted-foreground">Select All</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.map((user) => (
              <div key={user._id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <Checkbox
                    checked={selectedUsers.includes(user._id)}
                    onCheckedChange={() => toggleUserSelection(user._id)}
                  />
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium">{user.name}</h3>
                      {user.isVerified ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span className="flex items-center">
                        <Mail className="w-3 h-3 mr-1" />
                        {user.email}
                      </span>
                     {user.phone && (
                        <span className="flex items-center">
                          <Phone className="w-3 h-3 mr-1" />
                          {user.phone}
                        </span>
                      )}
                      <span className="flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center">
                        <CreditCard className="w-3 h-3 mr-1" />
                        {user.orderCount} orders • ₹{user.totalSpent.toLocaleString()}
                      </span>
                      {user.lastOrderDate && (
                        <span className="text-xs">
                          Last order: {new Date(user.lastOrderDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                 
                  <Badge variant={user.isVerified ? "default" : "secondary"}>
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
                      <DropdownMenuItem onClick={() => handleUserAction(user._id, 'resetPassword')}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reset Password
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
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && <EditUserForm user={selectedUser} onClose={() => setSelectedUser(null)} onUpdate={fetchUsers} />}
        </DialogContent>
      </Dialog>
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
      <div className="grid grid-cols-2 gap-4">
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
