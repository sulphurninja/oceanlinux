"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, Clock, User, Bot, Loader2, Settings } from "lucide-react";
import Link from "next/link";
import { toast } from 'sonner';
import { useParams } from 'next/navigation';

interface Message {
    author: string;
    authorName: string;
    message: string;
    timestamp: string;
    isInternal?: boolean;
}

interface TicketDetails {
    _id: string;
    ticketId: string;
    subject: string;
    description: string;
    category: string;
    priority: string;
    status: string;
    messages: Message[];
    userId: {
        name: string;
        email: string;
    };
    createdAt: string;
    updatedAt: string;
}

const statusConfig = {
    open: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', label: 'Open' },
    'in-progress': { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', label: 'In Progress' },
    'waiting-response': { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', label: 'Waiting Response' },
    resolved: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', label: 'Resolved' },
    closed: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', label: 'Closed' }
};

const priorityConfig = {
    low: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', label: 'Low' },
    medium: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', label: 'Medium' },
    high: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', label: 'High' },
    critical: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', label: 'Critical' }
};

export default function AdminTicketDetailsPage() {
    const params = useParams();
    const [ticket, setTicket] = useState<TicketDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [sending, setSending] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [newStatus, setNewStatus] = useState('');

    useEffect(() => {
        fetchTicketDetails();
    }, [params.ticketId]);

    const fetchTicketDetails = async () => {
        try {
            const response = await fetch(`/api/admin/tickets/${params.ticketId}`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setTicket(data);
                setNewStatus(data.status);
            } else if (response.status === 404) {
                toast.error('Ticket not found');
            } else if (response.status === 401) {
                toast.error('Admin access required');
            } else {
                toast.error('Failed to load ticket details');
            }
        } catch (error) {
            console.error('Error fetching ticket details:', error);
            toast.error('Failed to load ticket details');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async () => {
        if (!newStatus || newStatus === ticket?.status) return;

        setUpdating(true);
        try {
            const response = await fetch(`/api/admin/tickets/${params.ticketId}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (response.ok) {
                toast.success('Ticket status updated successfully!');
                fetchTicketDetails();
            } else {
                const error = await response.json();
                toast.error(error.message || 'Failed to update status');
            }
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
        } finally {
            setUpdating(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        setSending(true);
        try {
            const response = await fetch(`/api/admin/tickets/${params.ticketId}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ adminReply: newMessage })
            });

            if (response.ok) {
                toast.success('Reply sent successfully!');
                setNewMessage('');
                fetchTicketDetails();
            } else {
                const error = await response.json();
                toast.error(error.message || 'Failed to send reply');
            }
        } catch (error) {
            console.error('Error sending reply:', error);
            toast.error('Failed to send reply');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                        <p className="text-muted-foreground">Loading ticket details...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="p-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Ticket Not Found</h1>
                    <p className="text-muted-foreground mb-8">The ticket you're looking for doesn't exist.</p>
                    <Link href="/admin/tickets">
                        <Button>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Tickets
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Link href="/admin/tickets">
                    <Button variant="ghost">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Tickets
                    </Button>
                </Link>
            </div>

            <div className="grid lg:grid-cols-4 gap-8">
                {/* Ticket Info Sidebar */}
                <div className="lg:col-span-1">
                    <Card className="sticky top-4">
                        <CardHeader>
                            <CardTitle className="text-lg">Ticket Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Ticket ID</p>
                                <p className="font-mono text-sm">{ticket.ticketId}</p>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Customer</p>
                                <p className="text-sm font-medium">{ticket.userId.name}</p>
                                <p className="text-xs text-muted-foreground">{ticket.userId.email}</p>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-2">Status</p>
                                <div className="space-y-2">
                                    <Select value={newStatus} onValueChange={setNewStatus}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="open">Open</SelectItem>
                                            <SelectItem value="in-progress">In Progress</SelectItem>
                                            <SelectItem value="waiting-response">Waiting Response</SelectItem>
                                            <SelectItem value="resolved">Resolved</SelectItem>
                                            <SelectItem value="closed">Closed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {newStatus !== ticket.status && (
                                        <Button
                                            size="sm"
                                            onClick={handleUpdateStatus}
                                            disabled={updating}
                                            className="w-full"
                                        >
                                            {updating ? (
                                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                            ) : (
                                                <Settings className="w-3 h-3 mr-1" />
                                            )}
                                            Update Status
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Priority</p>
                                <Badge className={priorityConfig[ticket.priority as keyof typeof priorityConfig].color}>
                                    {priorityConfig[ticket.priority as keyof typeof priorityConfig].label}
                                </Badge>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Category</p>
                                <p className="text-sm capitalize">{ticket.category.replace('-', ' ')}</p>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Created</p>
                                <p className="text-sm">{new Date(ticket.createdAt).toLocaleString()}</p>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                                <p className="text-sm">{new Date(ticket.updatedAt).toLocaleString()}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Conversation */}
                <div className="lg:col-span-3">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>{ticket.subject}</CardTitle>
                                <Badge className={statusConfig[ticket.status as keyof typeof statusConfig].color}>
                                    {statusConfig[ticket.status as keyof typeof statusConfig].label}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {/* Messages */}
                            <div className="space-y-6 mb-8">
                                {ticket.messages
                                    .filter(message => !message.isInternal)
                                    .map((message, index) => (
                                    <div
                                        key={index}
                                        className={`flex ${message.author === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-3xl ${message.author === 'user' ? 'order-2' : ''}`}>
                                            <div className="flex items-center space-x-2 mb-2">
                                                <Avatar className="w-8 h-8">
                                                    <AvatarFallback>
                                                        {message.author === 'user' ? (
                                                            <User className="w-4 h-4" />
                                                        ) : (
                                                            <Bot className="w-4 h-4" />
                                                        )}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium">{message.authorName}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(message.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className={`p-4 rounded-lg ${
                                                message.author === 'user'
                                                    ? 'bg-muted'
                                                    : 'bg-primary text-primary-foreground'
                                            }`}>
                                                <p className="whitespace-pre-wrap">{message.message}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Admin Reply Form */}
                            {ticket.status !== 'closed' && (
                                <form onSubmit={handleSendMessage} className="border-t pt-6">
                                    <div className="space-y-4">
                                        <Textarea
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            placeholder="Type your admin reply..."
                                            rows={4}
                                            required
                                        />
                                        <div className="flex justify-end">
                                            <Button type="submit" disabled={sending || !newMessage.trim()}>
                                                {sending ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Send className="w-4 h-4 mr-2" />
                                                )}
                                                Send Reply
                                            </Button>
                                        </div>
                                    </div>
                                </form>
                            )}

                            {ticket.status === 'closed' && (
                                <div className="border-t pt-6">
                                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                                        <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                        <p className="text-muted-foreground">This ticket has been closed.</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
