"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
    Clock,
    CheckCircle,
    XCircle,
    Loader2,
    Play,
    Square,
    RotateCcw,
    HardDriveIcon,
    KeyRound,
    RefreshCw
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';

interface ActionRequest {
    _id: string;
    orderId: string;
    userId: {
        _id: string;
        name: string;
        email: string;
    };
    action: string;
    status: string;
    requestedAt: string;
    processedAt?: string;
    processedBy?: {
        _id: string;
        name: string;
        email: string;
    };
    adminNotes?: string;
    orderSnapshot: {
        productName: string;
        ipAddress: string;
        customerEmail: string;
        customerName: string;
        os: string;
        memory: string;
    };
}

export default function ServerActionRequestsPage() {
    const router = useRouter();
    const [requests, setRequests] = useState<ActionRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState('pending');

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<ActionRequest | null>(null);
    const [dialogAction, setDialogAction] = useState<'approve' | 'reject'>('approve');
    const [adminNotes, setAdminNotes] = useState('');

    useEffect(() => {
        fetchRequests();
    }, [statusFilter]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/server-actions/pending?status=${statusFilter}`);
            const data = await res.json();

            if (data.success) {
                setRequests(data.requests);
            } else {
                toast.error(data.message || 'Failed to fetch requests');
            }
        } catch (error) {
            console.error('Error fetching requests:', error);
            toast.error('Failed to fetch requests');
        } finally {
            setLoading(false);
        }
    };

    const openProcessDialog = (request: ActionRequest, action: 'approve' | 'reject') => {
        setSelectedRequest(request);
        setDialogAction(action);
        setAdminNotes('');
        setDialogOpen(true);
    };

    const processRequest = async () => {
        if (!selectedRequest) return;

        setProcessingId(selectedRequest._id);
        try {
            const res = await fetch('/api/server-actions/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestId: selectedRequest._id,
                    action: dialogAction,
                    adminNotes: adminNotes || undefined
                })
            });

            const data = await res.json();

            if (data.success) {
                toast.success(`Request ${dialogAction}d successfully`);
                setDialogOpen(false);
                await fetchRequests();
            } else {
                toast.error(data.message || `Failed to ${dialogAction} request`);
            }
        } catch (error) {
            console.error(`Error ${dialogAction}ing request:`, error);
            toast.error(`Failed to ${dialogAction} request`);
        } finally {
            setProcessingId(null);
        }
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'start': return <Play className="h-4 w-4" />;
            case 'stop': return <Square className="h-4 w-4" />;
            case 'restart': return <RotateCcw className="h-4 w-4" />;
            case 'format': return <HardDriveIcon className="h-4 w-4" />;
            case 'reinstall': return <RefreshCw className="h-4 w-4" />;
            case 'changepassword': return <KeyRound className="h-4 w-4" />;
            default: return <Clock className="h-4 w-4" />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                </Badge>;
            case 'approved':
                return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Approved
                </Badge>;
            case 'rejected':
                return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                    <XCircle className="h-3 w-3 mr-1" />
                    Rejected
                </Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">Server Action Requests</h1>
                <p className="text-muted-foreground">
                    Manage manual server action requests from customers
                </p>
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 mb-6">
                <Button
                    variant={statusFilter === 'pending' ? 'default' : 'outline'}
                    onClick={() => setStatusFilter('pending')}
                >
                    Pending
                </Button>
                <Button
                    variant={statusFilter === 'approved' ? 'default' : 'outline'}
                    onClick={() => setStatusFilter('approved')}
                >
                    Approved
                </Button>
                <Button
                    variant={statusFilter === 'rejected' ? 'default' : 'outline'}
                    onClick={() => setStatusFilter('rejected')}
                >
                    Rejected
                </Button>
            </div>

            {/* Requests List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : requests.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">No {statusFilter} requests found</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {requests.map((request) => (
                        <Card key={request._id}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 rounded-lg">
                                            {getActionIcon(request.action)}
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">
                                                {request.action.toUpperCase()} Request
                                            </CardTitle>
                                            <CardDescription>
                                                Requested {new Date(request.requestedAt).toLocaleString()}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    {getStatusBadge(request.status)}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Customer</Label>
                                        <p className="font-medium">{request.orderSnapshot.customerName}</p>
                                        <p className="text-sm text-muted-foreground">{request.orderSnapshot.customerEmail}</p>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Product</Label>
                                        <p className="font-medium">{request.orderSnapshot.productName}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {request.orderSnapshot.memory} • {request.orderSnapshot.os}
                                        </p>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">IP Address</Label>
                                        <p className="font-medium">{request.orderSnapshot.ipAddress}</p>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Order ID</Label>
                                        <p className="font-mono text-sm">{request.orderId}</p>
                                    </div>
                                </div>

                                {request.adminNotes && (
                                    <div className="mb-4 p-3 bg-muted rounded-lg">
                                        <Label className="text-xs text-muted-foreground">Admin Notes</Label>
                                        <p className="text-sm mt-1">{request.adminNotes}</p>
                                    </div>
                                )}

                                {request.processedAt && request.processedBy && (
                                    <div className="mb-4 text-sm text-muted-foreground">
                                        Processed by {request.processedBy.name} on {new Date(request.processedAt).toLocaleString()}
                                    </div>
                                )}

                                {request.status === 'pending' && (
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={() => openProcessDialog(request, 'approve')}
                                            disabled={processingId === request._id}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            {processingId === request._id ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            ) : (
                                                <CheckCircle className="h-4 w-4 mr-2" />
                                            )}
                                            Approve
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            onClick={() => openProcessDialog(request, 'reject')}
                                            disabled={processingId === request._id}
                                        >
                                            <XCircle className="h-4 w-4 mr-2" />
                                            Reject
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => router.push(`/admin/orders?orderId=${request.orderId}`)}
                                        >
                                            View Order
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Process Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {dialogAction === 'approve' ? 'Approve' : 'Reject'} Request
                        </DialogTitle>
                        <DialogDescription>
                            {dialogAction === 'approve'
                                ? 'Approve this server action request? The customer will be notified.'
                                : 'Reject this server action request? Please provide a reason.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <Label>Admin Notes {dialogAction === 'reject' && '(Required)'}</Label>
                            <Textarea
                                value={adminNotes}
                                onChange={(e) => setAdminNotes(e.target.value)}
                                placeholder={dialogAction === 'approve'
                                    ? 'Optional notes for internal reference...'
                                    : 'Reason for rejection (will be shown to customer)...'}
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={processRequest}
                            disabled={processingId !== null || (dialogAction === 'reject' && !adminNotes)}
                            className={dialogAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
                            variant={dialogAction === 'reject' ? 'destructive' : 'default'}
                        >
                            {processingId ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {dialogAction === 'approve' ? 'Approve' : 'Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
