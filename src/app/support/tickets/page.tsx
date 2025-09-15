"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Ticket, Plus, Clock, CheckCircle, AlertCircle, XCircle, MessageSquare, Loader2 } from "lucide-react";
import Link from "next/link";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface SupportTicket {
    _id: string;
    ticketId: string;
    subject: string;
    category: string;
    priority: string;
    status: string;
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

export default function SupportTicketsPage() {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [authChecking, setAuthChecking] = useState(true);
    const router = useRouter();

    // Form state
    const [formData, setFormData] = useState({
        subject: '',
        description: '',
        category: '',
        priority: 'medium'
    });

    useEffect(() => {
        checkAuthAndFetchTickets();
    }, []);

    const checkAuthStatus = async () => {
        try {
            const response = await fetch('/api/auth/check', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
        }
    };

    const checkAuthAndFetchTickets = async () => {
        try {
            setAuthChecking(true);
            const isAuthenticated = await checkAuthStatus();

            if (!isAuthenticated) {
                setIsLoggedIn(false);
                setLoading(false);
                setAuthChecking(false);
                return;
            }

            setIsLoggedIn(true);

            const response = await fetch('/api/support/tickets', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                setIsLoggedIn(false);
                toast.error('Session expired. Please log in again.');
            } else if (response.ok) {
                const data = await response.json();
                setTickets(data);
            } else {
                throw new Error('Failed to fetch tickets');
            }
        } catch (error) {
            console.error('Error fetching tickets:', error);
            toast.error('Failed to load tickets');
        } finally {
            setLoading(false);
            setAuthChecking(false);
        }
    };

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);

        try {
            const response = await fetch('/api/support/tickets', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const data = await response.json();
                toast.success('Support ticket created successfully!');
                setShowCreateDialog(false);
                setFormData({ subject: '', description: '', category: '', priority: 'medium' });
                checkAuthAndFetchTickets(); // Refresh tickets
            } else if (response.status === 401) {
                toast.error('Session expired. Please log in again.');
                setIsLoggedIn(false);
            } else {
                const error = await response.json();
                toast.error(error.message || 'Failed to create ticket');
            }
        } catch (error) {
            console.error('Error creating ticket:', error);
            toast.error('Failed to create ticket');
        } finally {
            setCreating(false);
        }
    };

    if (authChecking || loading) {
        return (
            <div className="min-h-screen bg-background">
                <Header />
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                        <p className="text-muted-foreground">
                            {authChecking ? 'Checking authentication...' : 'Loading support tickets...'}
                        </p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-background">
                <Header />
                <section className="py-16 bg-background min-h-screen flex items-center">
                    <div className="container mx-auto px-6">
                        <div className="max-w-2xl mx-auto text-center">
                            <Card>
                                <CardContent className="p-12">
                                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Ticket className="w-10 h-10 text-primary" />
                                    </div>

                                    <h1 className="text-3xl font-bold mb-4">Login Required</h1>
                                    <p className="text-muted-foreground mb-8 leading-relaxed">
                                        Please log in to view and manage your support tickets. Our support system helps you
                                        track all your inquiries and get timely assistance.
                                    </p>

                                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                        <Link href="/login">
                                            <Button size="lg" className="px-8">
                                                Login to Continue
                                            </Button>
                                        </Link>
                                        <Link href="/register">
                                            <Button size="lg" variant="outline" className="px-8">
                                                Create Account
                                            </Button>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </section>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <Header />

            {/* Hero Section */}
            <section className="bg-gradient-to-br from-primary/10 to-secondary/10 py-16">
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center mb-4">
                                <Ticket className="w-12 h-12 text-primary mr-4" />
                                <h1 className="text-4xl lg:text-5xl font-bold">Support Tickets</h1>
                            </div>
                            <p className="text-xl text-muted-foreground max-w-2xl">
                                Track your support requests and get help from our expert team.
                            </p>
                        </div>

                        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                            <DialogTrigger asChild>
                                <Button size="lg" className="px-8">
                                    <Plus className="w-5 h-5 mr-2" />
                                    New Ticket
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Create Support Ticket</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleCreateTicket} className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="category">Category</Label>
                                            <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select category" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="technical">Technical Support</SelectItem>
                                                    <SelectItem value="billing">Billing & Pricing</SelectItem>
                                                    <SelectItem value="general">General Inquiry</SelectItem>
                                                    <SelectItem value="security">Security Issue</SelectItem>
                                                    <SelectItem value="feature-request">Feature Request</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="priority">Priority</Label>
                                            <Select value={formData.priority} onValueChange={(value) => setFormData({...formData, priority: value})}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="low">Low</SelectItem>
                                                    <SelectItem value="medium">Medium</SelectItem>
                                                    <SelectItem value="high">High</SelectItem>
                                                    <SelectItem value="critical">Critical</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="subject">Subject</Label>
                                        <Input
                                            id="subject"
                                            value={formData.subject}
                                            onChange={(e) => setFormData({...formData, subject: e.target.value})}
                                            placeholder="Brief description of your issue"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <Label htmlFor="description">Description</Label>
                                        <Textarea
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                                            placeholder="Provide detailed information about your issue..."
                                            rows={6}
                                            required
                                        />
                                    </div>

                                    <div className="flex gap-4">
                                        <Button type="submit" disabled={creating} className="flex-1">
                                            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                            Create Ticket
                                        </Button>
                                        <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </section>

            {/* Tickets List */}
            <div className="container mx-auto px-4 py-16">
                {tickets.length > 0 ? (
                    <div className="space-y-6">
                        {tickets.map((ticket) => {
                            const StatusIcon = statusConfig[ticket.status as keyof typeof statusConfig].icon;
                            return (
                                <Card key={ticket._id} className="hover:shadow-lg transition-shadow">
                                    <CardContent className="p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex-1">
                                                <div className="flex items-center space-x-3 mb-2">
                                                    <h3 className="text-lg font-semibold">{ticket.subject}</h3>
                                                    <Badge variant="outline" className="text-xs font-mono">
                                                        {ticket.ticketId}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                                                    <span>Created: {new Date(ticket.createdAt).toLocaleDateString()}</span>
                                                    <span>Updated: {new Date(ticket.updatedAt).toLocaleDateString()}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-2">
                                                <Badge className={priorityConfig[ticket.priority as keyof typeof priorityConfig].color}>
                                                    {priorityConfig[ticket.priority as keyof typeof priorityConfig].label}
                                                </Badge>
                                                <Badge className={statusConfig[ticket.status as keyof typeof statusConfig].color}>
                                                    <StatusIcon className="w-3 h-3 mr-1" />
                                                    {statusConfig[ticket.status as keyof typeof statusConfig].label}
                                                </Badge>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <Badge variant="outline" className="capitalize">
                                                {ticket.category.replace('-', ' ')}
                                            </Badge>
                                            <Link href={`/support/tickets/${ticket.ticketId}`}>
                                                <Button variant="outline" size="sm">
                                                    View Details
                                                </Button>
                                            </Link>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Ticket className="w-12 h-12 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No support tickets yet</h3>
                        <p className="text-muted-foreground mb-6">
                            Create your first support ticket to get help from our team.
                        </p>
                        <Button onClick={() => setShowCreateDialog(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Create Your First Ticket
                        </Button>
                    </div>
                )}
            </div>

            <Footer />
        </div>
    );
}
