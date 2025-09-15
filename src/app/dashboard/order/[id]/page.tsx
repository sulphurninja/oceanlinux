"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  Check,
  Play,
  Square,
  RotateCcw,
  KeyRound,
  HardDriveIcon,
  RefreshCw,
  Loader2,
  Globe,
  User,
  Lock,
  Terminal,
  Server,
  Network,
  Activity,
  Calendar,
  Clock,
  CreditCard,
  AlertTriangle,
  Computer,
  MemoryStick,
  Database,
  Shield,
  XCircle,
  Zap,
  Settings2,
  Info,
  Wallet
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Order {
  _id: string;
  productName: string;
  os: string;
  memory: string;
  status: string;
  price: number;
  ipAddress?: string;
  username?: string;
  password?: string;
  expiryDate?: Date;
  createdAt?: Date;
  provider?: 'hostycare' | 'smartvps';
  hostycareServiceId?: string;
  smartvpsServiceId?: string;
  provisioningStatus?: string;
  lastAction?: string;
  lastActionTime?: Date;
  lastSyncTime?: Date;
  ipStockId?: string;
  renewalPayments?: Array<{
    paymentId: string;
    amount: number;
    paidAt: Date;
    previousExpiry: Date;
    newExpiry: Date;
    renewalTxnId: string;
  }>;
}

// OS Icon Component
const OSIcon = ({ os, className = "h-8 w-8" }: { os: string; className?: string }) => {
  const osLower = os.toLowerCase();

  if (osLower.includes('ubuntu')) {
    return (
      <div className={`${className} rounded-lg flex items-center justify-center shadow-sm`}>
        <img src='/ubuntu.png' className={`${className} rounded-lg object-cover`} alt={os} />
      </div>
    );
  } else if (osLower.includes('centos')) {
    return (
      <div className={`${className} rounded-lg flex items-center justify-center shadow-sm`}>
        <img src='/centos.png' className={`${className} rounded-lg object-cover`} alt={os} />
      </div>
    );
  } else if (osLower.includes('windows')) {
    return (
      <div className={`${className} rounded-lg flex items-center justify-center shadow-sm`}>
        <img src='/windows.png' className={`${className} rounded-lg object-cover`} alt={os} />
      </div>
    );
  } else {
    return (
      <div className={`${className} bg-gray-500 rounded-lg flex items-center justify-center text-white shadow-sm`}>
        <Computer className="h-5 w-5" />
      </div>
    );
  }
};

function styleText(content: string) {
  const regex = /(\([^)]*\)|[a-zA-Z]+)/g;
  return content.split(regex).map((part, index) => {
    if (part.match(/\([^)]*\)/) || part.match(/[a-zA-Z]/)) {
      return <span key={index} className="text-primary font-semibold">{part}</span>;
    } else {
      return part;
    }
  });
}

const OrderDetails = () => {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Service management states
  const [serviceDetails, setServiceDetails] = useState<any | null>(null);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) throw new Error('Failed to fetch order');
      const data = await response.json();
      setOrder(data);
    } catch (error) {
      console.error('Failed to fetch order:', error);
      toast.error('Failed to load order details');
      router.push('/dashboard/viewLinux');
    } finally {
      setLoading(false);
    }
  };

  // Determine provider based on order data
  const getProviderFromOrder = (order: Order): 'hostycare' | 'smartvps' => {
    // Check if order has explicit provider field
    if (order.provider) {
      return order.provider;
    }

    // Check if it has hostycare service ID
    if (order.hostycareServiceId) {
      return 'hostycare';
    }

    // Check if it has smartvps service ID
    if (order.smartvpsServiceId) {
      return 'smartvps';
    }

    // Check product name patterns or IP ranges for SmartVPS
    if (order.productName.includes('103.195') ||
      order.ipAddress?.startsWith('103.195') ||
      order.productName.includes('🏅')) {
      return 'smartvps';
    }

    // Default to hostycare
    return 'hostycare';
  };

  const loadServiceDetails = async () => {
    if (!order) return;

    const provider = getProviderFromOrder(order);
    const serviceId = provider === 'smartvps' ? order.smartvpsServiceId : order.hostycareServiceId;

    setServiceLoading(true);
    try {
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : 'service-action';
      const res = await fetch(`/api/orders/${endpoint}?orderId=${order._id}`);
      const data = await res.json();
      if (data.success) {
        setServiceDetails(data);
        await fetchOrder(); // Refresh order data after sync
      }
    } catch (error) {
      toast.error('Failed to load service details');
    } finally {
      setServiceLoading(false);
    }
  };

  const runServiceAction = async (action: string, payload?: any) => {
    if (!order) return;

    setActionBusy(action);
    try {
      const provider = getProviderFromOrder(order);
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : 'service-action';

      const res = await fetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action, payload })
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Action "${action}" executed successfully`);
        await Promise.all([
          loadServiceDetails(),
          fetchOrder()
        ]);

        if (action === 'changepassword' || action === 'reinstall' || action === 'format') {
          toast.success('Password updated in your records');
        }
      } else {
        toast.error(data.error || `Failed to execute "${action}"`);
      }
    } catch (e: any) {
      toast.error(e.message || `Failed to execute "${action}"`);
    } finally {
      setActionBusy(null);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    toast.success(`${field} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  const getDaysUntilExpiry = (expiryDate: Date | string | null | undefined) => {
    if (!expiryDate) return 0;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const isRenewalEligible = (order: Order | null) => {
    if (!order || !order.expiryDate) return false;
    const daysLeft = getDaysUntilExpiry(order.expiryDate);
    return daysLeft <= 30 && daysLeft >= -7;
  };

  const isExpired = (order: Order | null) => {
    if (!order || !order.expiryDate) return false;
    return getDaysUntilExpiry(order.expiryDate) < 0;
  };

  const handleRenewService = async () => {
    if (!order || !order.expiryDate) {
      toast.error('Order has no expiry date');
      return;
    }

    const daysLeft = getDaysUntilExpiry(order.expiryDate);
    const isExpiredService = daysLeft < 0;

    const confirmed = confirm(
      `Renew service for ₹${order.price}?\n\n` +
      `Service: ${order.productName}\n` +
      `Configuration: ${order.memory}\n` +
      `Current Expiry: ${formatDate(order.expiryDate)}\n` +
      `${isExpiredService ? 'Service is expired' : `${daysLeft} days remaining`}\n\n` +
      `After payment, service will be extended for 30 days.\n` +
      `Proceed to payment?`
    );

    if (!confirmed) return;

    setActionBusy('renew');

    try {
      const res = await fetch("/api/payment/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order._id
        })
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to initiate renewal payment");
        setActionBusy(null);
        return;
      }

      if (data.renewalTxnId) {
        localStorage.setItem('lastRenewalTxnId', data.renewalTxnId);
        localStorage.setItem('renewalOrderId', order._id);
      }

      const sanitizedDescription = `Renewal: ${order.productName} - ${order.memory}`.replace(/[^\w\s\-\.]/g, '').trim();
      const sanitizedCustomerName = data.customer.name.replace(/[^\w\s\-\.]/g, '').trim();

      const options = {
        key: data.razorpay.key,
        amount: data.razorpay.amount,
        currency: data.razorpay.currency,
        name: 'OceanLinux',
        description: sanitizedDescription,
        order_id: data.razorpay.order_id,
        prefill: {
          name: sanitizedCustomerName,
          email: data.customer.email,
        },
        theme: {
          color: '#3b82f6'
        },
        handler: async function (response: any) {
          toast.success("Payment successful! Processing renewal...");

          try {
            const confirmRes = await fetch("/api/payment/renew-confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                renewalTxnId: data.renewalTxnId,
                orderId: order._id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const confirmData = await confirmRes.json();

            if (confirmRes.ok && confirmData.success) {
              toast.success("Service renewed successfully! New expiry date updated.");
              await fetchOrder();
            } else {
              toast.error("Payment successful but renewal processing failed. Please contact support.");
            }
          } catch (error) {
            toast.error("Payment successful but renewal confirmation failed. Please contact support.");
          } finally {
            setActionBusy(null);
          }
        },
        modal: {
          ondismiss: function () {
            setActionBusy(null);
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();

    } catch (error) {
      console.error("Error initiating renewal payment:", error);
      toast.error("Something went wrong. Please try again");
      setActionBusy(null);
    }
  };

  const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string) => {
    if (actionBusy) {
      const actionLabels = {
        'reboot': { label: 'Rebooting', icon: RefreshCw, color: 'bg-blue-50 text-blue-700 border dark:border-none-blue-200' },
        'start': { label: 'Starting', icon: Loader2, color: 'bg-green-50 text-green-700 border dark:border-none-green-200' },
        'stop': { label: 'Stopping', icon: Loader2, color: 'bg-gray-50 text-gray-700 border dark:border-none-gray-200' },
        'renew': { label: 'Renewing', icon: Loader2, color: 'bg-green-50 text-green-700 border dark:border-none-green-200' },
        'reinstall': { label: 'Reinstalling', icon: Loader2, color: 'bg-amber-50 text-amber-700 border dark:border-none-amber-200' },
        'format': { label: 'Formatting', icon: Loader2, color: 'bg-amber-50 text-amber-700 border dark:border-none-amber-200' },
        'changepassword': { label: 'Changing Password', icon: Loader2, color: 'bg-blue-50 text-blue-700 border dark:border-none-blue-200' }
      };

      const actionConfig = actionLabels[actionBusy as keyof typeof actionLabels];
      if (actionConfig) {
        const Icon = actionConfig.icon;
        return (
          <Badge className={actionConfig.color}>
            <Icon className="w-3 h-3 mr-1 animate-spin" />
            {actionConfig.label}
          </Badge>
        );
      }
    }

    if (status.toLowerCase() === 'completed' || status.toLowerCase() === 'active') {
      return (
        <Badge className="bg-green-50 text-green-700 border dark:border-none-green-200">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
          Active
        </Badge>
      );
    }

    const currentStatus = provisioningStatus || status;
    const statusConfigs = {
      'active': { label: 'Active', color: 'bg-green-50 text-green-700 border dark:border-none-green-200', icon: 'pulse' },
      'pending': { label: 'Pending', color: 'bg-amber-50 text-amber-700 border dark:border-none-amber-200', icon: Clock },
      'provisioning': { label: 'Provisioning', color: 'bg-amber-50 text-amber-700 border dark:border-none-amber-200', icon: Loader2 },
      'suspended': { label: 'Suspended', color: 'bg-orange-50 text-orange-700 border dark:border-none-orange-200', icon: AlertTriangle },
      'failed': { label: 'Failed', color: 'bg-red-50 text-red-700 border dark:border-none-red-200', icon: XCircle },
      'terminated': { label: 'Terminated', color: 'bg-red-50 text-red-700 border dark:border-none-red-200', icon: XCircle }
    };

    const statusConfig = statusConfigs[currentStatus.toLowerCase() as keyof typeof statusConfigs];
    if (statusConfig) {
      if (statusConfig.icon === 'pulse') {
        return (
          <Badge className={statusConfig.color}>
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            {statusConfig.label}
          </Badge>
        );
      }
      const Icon = statusConfig.icon as React.ElementType;
      return (
        <Badge className={statusConfig.color}>
          <Icon className="w-3 h-3 mr-1" />
          {statusConfig.label}
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="bg-gray-50 text-gray-700">
        <Shield className="w-3 h-3 mr-1" />
        {currentStatus}
      </Badge>
    );
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleAdvancedAction = async (action: 'reinstall' | 'format') => {
    if (!order) return;

    const provider = getProviderFromOrder(order);
    const actionName = action === 'format' ? 'format' : 'reinstall';
    const actionLabel = action === 'format' ? 'Format' : 'Reinstall OS';

    const confirmed = confirm(`Are you sure you want to ${actionName}? This will erase all data!`);
    if (!confirmed) return;

    try {
      setActionBusy(action);

      // Get available templates
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : 'service-action';
      const templatesRes = await fetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action: 'templates' })
      });
      const templatesData = await templatesRes.json();

      if (templatesData.success && templatesData.result) {
        const templates = templatesData.result;
        let templateOptions = '';
        let templateList = {};

        if (Array.isArray(templates)) {
          templates.forEach((template, index) => {
            const name = template.name || template.os || template.distro || `Template ${index + 1}`;
            const id = template.id || template.templateId || index.toString();
            templateList[id] = template;
            templateOptions += `${id}: ${name}\n`;
          });
        } else if (typeof templates === 'object' && templates !== null) {
          Object.entries(templates).forEach(([id, template]) => {
            const name = typeof template === 'string' ? template :
              (template?.name || template?.os || template?.distro || `Template ${id}`);
            templateList[id] = template;
            templateOptions += `${id}: ${name}\n`;
          });
        }

        if (templateOptions && Object.keys(templateList).length > 0) {
          const selectedTemplateId = prompt(
            `Select OS Template for ${actionLabel}:\n\n${templateOptions}\nEnter template ID (or leave blank for default):`
          );

          if (selectedTemplateId === null) {
            setActionBusy(null);
            return;
          }

          if (selectedTemplateId && !templateList[selectedTemplateId]) {
            toast.error('Invalid template ID selected');
            setActionBusy(null);
            return;
          }

          const pwd = prompt(`Enter new root/administrator password for ${actionLabel} (minimum 6 characters):`);
          if (pwd && pwd.length >= 6) {
            await runServiceAction(action, {
              password: pwd,
              templateId: selectedTemplateId || undefined
            });
          } else if (pwd !== null) {
            toast.error('Password must be at least 6 characters long');
            setActionBusy(null);
          } else {
            setActionBusy(null);
          }
        } else {
          const pwd = prompt(`No templates available. Proceed with default ${actionLabel}?\n\nEnter new root/administrator password (minimum 6 characters):`);
          if (pwd && pwd.length >= 6) {
            await runServiceAction(action, { password: pwd });
          } else if (pwd !== null) {
            toast.error('Password must be at least 6 characters long');
            setActionBusy(null);
          } else {
            setActionBusy(null);
          }
        }
      } else {
        const pwd = prompt(`Failed to load templates. Proceed with default ${actionLabel}?\n\nEnter new root/administrator password (minimum 6 characters):`);
        if (pwd && pwd.length >= 6) {
          await runServiceAction(action, { password: pwd });
        } else if (pwd !== null) {
          toast.error('Password must be at least 6 characters long');
          setActionBusy(null);
        } else {
          setActionBusy(null);
        }
      }
    } catch (error) {
      console.error(`Error in ${action} process:`, error);
      toast.error(`Failed to initiate ${action}`);
      setActionBusy(null);
    }
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex justify-center items-center'>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 bg-primary/20 rounded-full animate-pulse"></div>
            <Loader2 className="absolute inset-0 m-auto animate-spin h-8 w-8 text-primary" />
          </div>
          <p className="text-muted-foreground font-medium">Loading server details...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex justify-center items-center'>
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
            <XCircle className="h-10 w-10 text-red-500" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Server not found</h3>
          <p className="text-muted-foreground mb-6">The requested server could not be found.</p>
          <Button onClick={() => router.push('/dashboard/viewLinux')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Servers
          </Button>
        </div>
      </div>
    );
  }

  const provider = getProviderFromOrder(order);
  const canManage = (provider === 'hostycare' && order.hostycareServiceId) ||
    (provider === 'smartvps') || // SmartVPS doesn't need service ID
    order.ipAddress; // Can manage if we have IP address

  return (
    <div className='min-h-screen bg-gradient-to-br from-gray-50 to-gray-100'>
      {/* Header */}
      <div className='sticky top-0 z-40 border dark:border-none-b bg-white/95 backdrop-blur-sm shadow-sm'>
        <div className='flex h-16 items-center justify-between px-4 lg:px-6 max-w-7xl mx-auto'>
          <div className='flex items-center gap-4'>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard/viewLinux')}
              className="hover:bg-gray-100 rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className='flex items-center gap-3'>
              <OSIcon os={order.os} className="h-12 w-12" />
              <div>
                <h1 className='text-xl font-bold text-gray-900'>
                  {styleText(order.productName)}
                </h1>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {provider === 'smartvps' ? 'SmartVPS' : 'Hostycare'}
                  </Badge>
                  {getStatusBadge(order.status, order.provisioningStatus, order.lastAction)}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isRenewalEligible(order) && (
              <Button
                onClick={handleRenewService}
                disabled={actionBusy === 'renew'}
                className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg"
              >
                {actionBusy === 'renew' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Renew
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 hover:bg-gray-50"
              onClick={fetchOrder}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className='max-w-7xl mx-auto p-4 lg:p-6'>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Server Info & Connection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Server Overview */}
            <Card className="shadow-lg border dark:border-none-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Server className="h-6 w-6 text-primary" />
                    Server Overview
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Created {order.createdAt ? formatDate(order.createdAt) : 'Unknown'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border dark:border-none border dark:border-none-blue-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500 rounded-lg">
                        <Terminal className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Operating System</p>
                        <p className="font-semibold text-blue-900">{order.os}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border dark:border-none border dark:border-none-purple-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-500 rounded-lg">
                        <MemoryStick className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">Memory</p>
                        <p className="font-semibold text-purple-900">{order.memory}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border dark:border-none border dark:border-none-green-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500 rounded-lg">
                        <Activity className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Status</p>
                        <p className="font-semibold text-green-900 capitalize">
                          {order.provisioningStatus || order.status}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border dark:border-none border dark:border-none-orange-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500 rounded-lg">
                        <Database className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Provider</p>
                        <p className="font-semibold text-orange-900 capitalize">
                          {provider === 'smartvps' ? 'SmartVPS' : 'Hostycare'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Connection Details */}
            {order.ipAddress && order.username ? (
              <Card className="shadow-lg border dark:border-none-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Network className="h-6 w-6 text-primary" />
                    Connection Details
                  </CardTitle>
                  <CardDescription>
                    Use these credentials to connect to your server
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* IP Address */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Globe className="h-4 w-4 text-blue-600" />
                      Server IP Address
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={order.ipAddress}
                        className="font-mono bg-gray-50 border dark:border-none-gray-200"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(order.ipAddress!, 'IP Address')}
                        className="shrink-0"
                      >
                        {copied === 'IP Address' ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Username */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <User className="h-4 w-4 text-green-600" />
                      Username
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={order.username}
                        className="font-mono bg-gray-50 border dark:border-none-gray-200"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(order.username!, 'Username')}
                        className="shrink-0"
                      >
                        {copied === 'Username' ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Lock className="h-4 w-4 text-red-600" />
                      Password
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        type={showPassword ? "text" : "password"}
                        value={order.password || ''}
                        className="font-mono bg-gray-50 border dark:border-none-gray-200"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowPassword(!showPassword)}
                        className="shrink-0"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(order.password || '', 'Password')}
                        className="shrink-0"
                      >
                        {copied === 'Password' ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* SSH Command */}
                  <div className="mt-6">
                    <Label className="text-sm font-medium mb-2 block">SSH Connection Command</Label>
                    <div className="relative">
                      <div className="p-4 bg-gray-900 rounded-xl border dark:border-none">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            <span className="text-gray-400 text-sm ml-2">Terminal</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(`ssh ${order.username}@${order.ipAddress}`, 'SSH Command')}
                            className="text-green-400 hover:bg-green-400/20 h-6"
                          >
                            {copied === 'SSH Command' ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                        <code className="text-green-300 font-mono text-sm">
                          ssh {order.username}@{order.ipAddress}
                        </code>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-lg border dark:border-none-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="text-center py-12">
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-8 w-8 text-amber-600" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Server Setup in Progress</h3>
                  <p className="text-muted-foreground mb-4">
                    Your server is being configured. Connection details will appear here once ready.
                  </p>
                  <div className="inline-flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                    <Clock className="h-4 w-4" />
                    Estimated setup time: 5-10 minutes
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Activity */}
            {(order.lastAction || order.lastActionTime) && (
              <Card className="shadow-lg border dark:border-none-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Activity className="h-6 w-6 text-primary" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl border dark:border-none border dark:border-none-blue-200">
                    <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                      {order.lastAction === 'start' && <Play className="h-6 w-6 text-white" />}
                      {order.lastAction === 'stop' && <Square className="h-6 w-6 text-white" />}
                      {order.lastAction === 'reboot' && <RotateCcw className="h-6 w-6 text-white" />}
                      {order.lastAction === 'renew' && <CreditCard className="h-6 w-6 text-white" />}
                      {order.lastAction === 'changepassword' && <KeyRound className="h-6 w-6 text-white" />}
                      {order.lastAction === 'reinstall' && <HardDriveIcon className="h-6 w-6 text-white" />}
                      {order.lastAction === 'format' && <HardDriveIcon className="h-6 w-6 text-white" />}
                      {!order.lastAction && <Activity className="h-6 w-6 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-blue-900 text-lg">
                        {order.lastAction ?
                          `Last action: ${order.lastAction.charAt(0).toUpperCase() + order.lastAction.slice(1)}`
                          : 'Server Activity'
                        }
                      </p>
                      {order.lastActionTime && (
                        <p className="text-blue-600 text-sm">
                          {formatDate(order.lastActionTime)}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Management & Billing */}
          <div className="space-y-6">
            {/* Server Management */}
            {canManage && (
              <Card className="shadow-lg border dark:border-none-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Settings2 className="h-6 w-6 text-primary" />
                    Server Control
                  </CardTitle>
                  <CardDescription>
                    Manage your server's power state and configuration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Power Controls */}
                  <div className="grid grid-cols-1 gap-3">
                    <Button
                      variant="default"
                      size="lg"
                      onClick={() => runServiceAction('start')}
                      disabled={!!actionBusy}
                      className="h-12 gap-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                    >
                      {actionBusy === 'start' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Start Server
                    </Button>

                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => runServiceAction('stop')}
                      disabled={!!actionBusy}
                      className="h-12 gap-2 hover:bg-red-50 hover:border dark:border-none-red-200 hover:text-red-700"
                    >
                      {actionBusy === 'stop' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                      Stop Server
                    </Button>

                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => runServiceAction('reboot')}
                      disabled={!!actionBusy}
                      className="h-12 gap-2"
                    >
                      {actionBusy === 'reboot' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Reboot Server
                    </Button>
                  </div>

                  <Separator />

                  {/* Advanced Actions */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-gray-700">Advanced Actions</h4>

                    <Button
                      variant="outline"
                      size="lg"
                      onClick={async () => {
                        const newPassword = prompt('Enter new password (minimum 6 characters):');
                        if (newPassword && newPassword.length >= 6) {
                          await runServiceAction('changepassword', {
                            password: newPassword
                          });
                        } else if (newPassword !== null) {
                          toast.error('Password must be at least 6 characters long');
                        }
                      }}
                      disabled={!!actionBusy}
                      className="w-full h-12 gap-2 hover:bg-blue-50 hover:border dark:border-none-blue-200 hover:text-blue-700"
                    >
                      {actionBusy === 'changepassword' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      Change Password
                    </Button>

                    <Button
                      variant="destructive"
                      size="lg"
                      onClick={() => handleAdvancedAction(provider === 'smartvps' ? 'format' : 'reinstall')}
                      disabled={!!actionBusy}
                      className="w-full h-12 gap-2"
                    >
                      {(actionBusy === 'reinstall' || actionBusy === 'format') ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <HardDriveIcon className="h-4 w-4" />
                      )}
                      {provider === 'smartvps' ? 'Format Server' : 'Reinstall OS'}
                    </Button>
                  </div>

                  {/* Service Status */}
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-gray-700">Service Status</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadServiceDetails}
                        disabled={serviceLoading}
                        className="gap-2 h-8 px-2"
                      >
                        <RefreshCw className={`h-3 w-3 ${serviceLoading ? 'animate-spin' : ''}`} />
                        Sync
                      </Button>
                    </div>

                    {serviceLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-gray-50 rounded-lg">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Syncing server status...
                      </div>
                    ) : serviceDetails ? (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Last synced: {order.lastSyncTime ? formatDate(order.lastSyncTime) : 'Never'}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <p className="text-muted-foreground text-sm p-3 bg-gray-50 rounded-lg">
                        Click Sync to refresh server status
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Billing & Renewal */}
            {order.expiryDate && (
              <Card className="shadow-lg border dark:border-none-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Wallet className="h-6 w-6 text-primary" />
                    Billing Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn(
                    "p-4 rounded-xl border dark:border-none",
                    isExpired(order)
                      ? "bg-gradient-to-r from-red-50 to-red-100 border dark:border-none-red-200"
                      : getDaysUntilExpiry(order.expiryDate) <= 7
                        ? "bg-gradient-to-r from-amber-50 to-amber-100 border dark:border-none-amber-200"
                        : "bg-gradient-to-r from-blue-50 to-blue-100 border dark:border-none-blue-200"
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className={cn(
                          "font-semibold text-lg",
                          isExpired(order)
                            ? "text-red-700"
                            : getDaysUntilExpiry(order.expiryDate) <= 7
                              ? "text-amber-700"
                              : "text-blue-700"
                        )}>
                          {isExpired(order) ? 'Service Expired' : 'Service Expires'}
                        </p>
                        <p className={cn(
                          "text-sm",
                          isExpired(order)
                            ? "text-red-600"
                            : getDaysUntilExpiry(order.expiryDate) <= 7
                              ? "text-amber-600"
                              : "text-blue-600"
                        )}>
                          {formatDate(order.expiryDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-3xl font-bold",
                          isExpired(order)
                            ? "text-red-700"
                            : getDaysUntilExpiry(order.expiryDate) <= 7
                              ? "text-amber-700"
                              : "text-blue-700"
                        )}>
                          {Math.abs(getDaysUntilExpiry(order.expiryDate))}
                        </p>
                        <p className={cn(
                          "text-sm font-medium",
                          isExpired(order)
                            ? "text-red-600"
                            : getDaysUntilExpiry(order.expiryDate) <= 7
                              ? "text-amber-600"
                              : "text-blue-600"
                        )}>
                          {isExpired(order) ? 'days ago' : 'days left'}
                        </p>
                      </div>
                    </div>

                    {getDaysUntilExpiry(order.expiryDate) > 0 && (
                      <div className="mb-4">
                        <Progress
                          value={Math.max(0, 100 - (getDaysUntilExpiry(order.expiryDate) / 30) * 100)}
                          className="h-2"
                        />
                      </div>
                    )}

                    {/* Renewal Button */}
                    {isRenewalEligible(order) && (
                      <Button
                        onClick={handleRenewService}
                        disabled={actionBusy === 'renew'}
                        className={cn(
                          "w-full gap-2 h-12",
                          isExpired(order)
                            ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                            : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                        )}
                      >
                        {actionBusy === 'renew' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Processing Payment...
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-4 w-4" />
                            Renew for ₹{order.price}
                          </>
                        )}
                      </Button>
                    )}

                    {isExpired(order) && isRenewalEligible(order) && (
                      <p className="text-xs text-red-600 mt-2 text-center">
                        ⚠️ Service renewal available for up to 7 days after expiry
                      </p>
                    )}
                  </div>

                  {/* Renewal History */}
                  {order.renewalPayments && order.renewalPayments.length > 0 && (
                    <div className="mt-4 pt-4 border dark:border-none-t">
                      <h4 className="font-semibold text-sm mb-3">Renewal History</h4>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {order.renewalPayments.map((renewal, index) => (
                          <div key={index} className="flex items-center justify-between text-xs p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-semibold">₹{renewal.amount} paid</p>
                              <p className="text-muted-foreground">{formatDate(renewal.paidAt)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-muted-foreground">Extended to</p>
                              <p className="font-medium">{formatDate(renewal.newExpiry)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetails;
