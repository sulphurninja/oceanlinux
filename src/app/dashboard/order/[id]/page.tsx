"use client";

import React, { useEffect, useRef, useState } from 'react';
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
  Settings2,
  Info,
  Wallet,
  LifeBuoy
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
import { useSessionAlert } from '@/components/session-alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

declare global {
  interface Window {
    Cashfree: any;
  }
}

interface IPStock {
  _id: string;
  name: string;
  tags: string[];
  // ... other ipStock fields
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
  provider?: 'hostycare' | 'smartvps' | 'oceanlinux';
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
      return <span key={index} className="text- font-semibold">{part}</span>;
    } else {
      return part;
    }
  });
}

const OrderDetails = () => {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const { showAlert } = useSessionAlert();

  const [order, setOrder] = useState<Order | null>(null);
  const [ipStock, setIpStock] = useState<IPStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Service management states
  const [serviceDetails, setServiceDetails] = useState<any | null>(null);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [serverPowerState, setServerPowerState] = useState<'running' | 'stopped' | 'suspended' | 'busy' | 'unknown'>('unknown');
  const [powerStateLoading, setPowerStateLoading] = useState(false);

  // Payment method for renewals
  const [renewalPaymentMethod, setRenewalPaymentMethod] = useState<'cashfree' | 'razorpay' | 'upi'>('cashfree');

  // Format dialog state
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const [formatLoading, setFormatLoading] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<any>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [formatProgress, setFormatProgress] = useState<string>('');

  // With:
  const [osDialogOpen, setOsDialogOpen] = useState(false);
  const [osLoading, setOsLoading] = useState(false);
  const [osTemplates, setOsTemplates] = useState<any>({});
  const [selectedOs, setSelectedOs] = useState<string>('');
  const [osProgress, setOsProgress] = useState<string>('');
  const [osMode, setOsMode] = useState<'reinstall' | 'format'>('reinstall'); // label + behavior

  // Manual server action request states
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [requestLoading, setRequestLoading] = useState(false);


  useEffect(() => {
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);
  useEffect(() => {
    if (orderId) {
      fetchOrderAndIPStock();
    }
  }, [orderId]);

  // Fetch server power state when order is loaded (for Hostycare and SmartVPS orders)
  useEffect(() => {
    if (order && !loading) {
      const provider = getProviderFromOrder(order, ipStock);
      // Fetch power state for both Hostycare and SmartVPS
      if ((provider === 'hostycare' && order.hostycareServiceId) ||
        (provider === 'smartvps' && (order.smartvpsServiceId || order.ipAddress))) {
        fetchServerPowerState();
      }
      // Fetch pending request for manual products
      if (provider === 'oceanlinux') {
        fetchPendingRequest();
      }
    }
  }, [order?.hostycareServiceId, order?.smartvpsServiceId, order?.ipAddress, ipStock, loading]);

  const fetchOrderAndIPStock = async () => {
    setLoading(true);
    try {
      console.log('[ORDER-DETAILS] Fetching order:', orderId);
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) throw new Error('Failed to fetch order');
      const orderData = await response.json();
      console.log('[ORDER-DETAILS] Order data received:', {
        _id: orderData._id,
        ipStockId: orderData.ipStockId,
        hostycareServiceId: orderData.hostycareServiceId,
        smartvpsServiceId: orderData.smartvpsServiceId,
        provider: orderData.provider
      });
      setOrder(orderData);

      // Fetch IPStock data if ipStockId exists
      if (orderData.ipStockId) {
        console.log('[ORDER-DETAILS] Fetching IPStock for ID:', orderData.ipStockId);
        try {
          const ipStockResponse = await fetch(`/api/ipstock/${orderData.ipStockId}`);
          if (ipStockResponse.ok) {
            const ipStockData = await ipStockResponse.json();
            console.log('[ORDER-DETAILS] IPStock data received:', {
              _id: ipStockData._id,
              name: ipStockData.name,
              tags: ipStockData.tags
            });
            setIpStock(ipStockData);
          } else {
            console.warn('[ORDER-DETAILS] Failed to fetch IPStock data');
          }
        } catch (ipStockError) {
          console.warn('[ORDER-DETAILS] Error fetching IPStock:', ipStockError);
        }
      } else {
        console.log('[ORDER-DETAILS] No ipStockId found in order');
      }
    } catch (error) {
      console.error('Failed to fetch order:', error);
      toast.error('Failed to load order details');
      router.push('/dashboard/viewLinux');
    } finally {
      setLoading(false);
    }
  };

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

  // Determine provider based on order data and ipStock
  const getProviderFromOrder = (order: Order, ipStock: IPStock | null): 'hostycare' | 'smartvps' | 'oceanlinux' => {
    console.log('[ORDER-DETAILS] Determining provider for order:', {
      explicitProvider: order.provider,
      hostycareServiceId: order.hostycareServiceId,
      smartvpsServiceId: order.smartvpsServiceId,
      ipStockId: order.ipStockId,
      ipStockTags: ipStock?.tags || 'No IPStock data',
      productName: order.productName
    });

    // Check explicit provider field first
    if (order.provider === 'smartvps') {
      console.log('[ORDER-DETAILS] Detected SmartVPS via explicit provider field');
      return 'smartvps';
    }

    // Check if order has hostycare service ID
    if (order.hostycareServiceId) {
      console.log('[ORDER-DETAILS] Detected Hostycare via serviceId');
      return 'hostycare';
    }

    // Check smartvps service ID
    if (order.smartvpsServiceId) {
      console.log('[ORDER-DETAILS] Detected SmartVPS via serviceId');
      return 'smartvps';
    }

    // Check if ipStock has smartvps or ocean linux tag (SmartVPS uses 'ocean linux' tag)
    if (ipStock && ipStock.tags) {
      const tagsLower = ipStock.tags.map((t: string) => t.toLowerCase());
      if (tagsLower.includes('smartvps') || tagsLower.includes('ocean linux')) {
        console.log('[ORDER-DETAILS] Detected SmartVPS via ipStock tags:', ipStock.tags);
        return 'smartvps';
      }
    }

    // Check product name patterns for SmartVPS (🌊 emoji indicates SmartVPS)
    if (order.productName?.includes('🌊') ||
      order.productName?.includes('103.195') ||
      order.ipAddress?.startsWith('103.195') ||
      order.productName?.includes('🏅')) {
      console.log('[ORDER-DETAILS] Detected SmartVPS via product name patterns');
      return 'smartvps';
    }

    // Default to oceanlinux
    console.log('[ORDER-DETAILS] Defaulting to OceanLinux');
    return 'oceanlinux';
  };

  // Get provider display name
  const getProviderDisplayName = (provider: string): string => {
    switch (provider) {
      case 'smartvps':
        return 'SmartVPS';
      case 'hostycare':
        return 'Hostycare';
      case 'oceanlinux':
        return 'OceanLinux';
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
  };

  const OS_DIALOG_AUTO_CLOSE_MS = 120_000; // 2 minutes
  const osAutoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startOsAutoCloseTimer = () => {
    if (osAutoCloseTimer.current) clearTimeout(osAutoCloseTimer.current);
    osAutoCloseTimer.current = setTimeout(() => {
      // Close and reset dialog state
      setOsDialogOpen(false);
      setOsLoading(false);
      setOsProgress('');
      setSelectedOs('');
    }, OS_DIALOG_AUTO_CLOSE_MS);
  };

  // Clear timer on dialog close/unmount to avoid leaks
  useEffect(() => {
    if (!osDialogOpen && osAutoCloseTimer.current) {
      clearTimeout(osAutoCloseTimer.current);
      osAutoCloseTimer.current = null;
    }
  }, [osDialogOpen]);

  useEffect(() => {
    return () => {
      if (osAutoCloseTimer.current) clearTimeout(osAutoCloseTimer.current);
    };
  }, []);

  const openOsDialog = async (provider: 'hostycare' | 'smartvps') => {
    if (osAutoCloseTimer.current) {
      clearTimeout(osAutoCloseTimer.current);
      osAutoCloseTimer.current = null;
    }
    setOsMode(provider === 'smartvps' ? 'format' : 'reinstall');
    setOsProgress('Loading available operating systems...');
    setOsDialogOpen(true);
    setOsLoading(true);
    setSelectedOs('');

    try {
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : 'service-action';
      const templatesRes = await fetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order!._id, action: 'templates' })
      });
      const templatesData = await templatesRes.json();

      if (templatesData.success && templatesData.result) {
        setOsTemplates(templatesData.result); // expects { [id]: name }
        setOsProgress('');
        setOsLoading(false);
      } else {
        throw new Error(templatesData.error || 'Failed to load templates');
      }
    } catch (err: any) {
      setOsProgress(`Failed to load operating systems: ${err.message || 'unknown error'}`);
      setOsLoading(false);
    }
  };


  const executeOsAction = async () => {
    if (!selectedOs) {
      toast.error('Please select an operating system');
      return;
    }
    const provider = getProviderFromOrder(order!, ipStock);
    setOsLoading(true);
    setOsProgress(osMode === 'format' ? 'Initiating server format...' : 'Submitting reinstall...');

    try {
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : 'service-action';
      const action = provider === 'smartvps' ? 'format' : 'reinstall';

      const res = await fetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order!._id,
          action,
          payload: { templateId: selectedOs } // server reads payload.templateId
        })
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Failed');
      startOsAutoCloseTimer();
      setOsProgress(osMode === 'format'
        ? 'Format initiated. Waiting for server to update...'
        : 'Reinstall submitted. Waiting for server to update...'
      );

      // re-use your existing poller
      await pollForServerUpdates();

    } catch (err: any) {
      setOsProgress(`Error: ${err.message || 'unknown error'}`);
      setTimeout(() => {
        setOsDialogOpen(false);
        setOsLoading(false);
        setOsProgress('');
      }, 3000);
    }
  };


  // Fetch pending server action request for manual products
  const fetchPendingRequest = async () => {
    if (!order) return;

    try {
      const res = await fetch(`/api/server-actions/status?orderId=${order._id}`);
      const data = await res.json();

      if (data.success && data.hasRequest) {
        setPendingRequest(data.request);
      } else {
        setPendingRequest(null);
      }
    } catch (error) {
      console.error('[ORDER-DETAILS] Failed to fetch pending request:', error);
    }
  };

  // Request server action for manual products
  const requestServerAction = async (action: string) => {
    if (!order) return;

    const confirmed = confirm(
      `Request ${action} action? An admin will review your request and perform the action.`
    );
    if (!confirmed) return;

    setRequestLoading(true);
    try {
      const res = await fetch('/api/server-actions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action })
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Request submitted! Admin will review shortly.');
        await fetchPendingRequest();
      } else {
        toast.error(data.message || 'Failed to submit request');
      }
    } catch (error) {
      console.error('[ORDER-DETAILS] Failed to request action:', error);
      toast.error('Failed to submit request');
    } finally {
      setRequestLoading(false);
    }
  };

  // Check if server management actions are available
  const isServerManagementAvailable = (order: Order, ipStock: IPStock | null): boolean => {
    const provider = getProviderFromOrder(order, ipStock);

    console.log('[ORDER-DETAILS] Checking server management availability:', {
      provider,
      hostycareServiceId: order.hostycareServiceId,
      ipAddress: order.ipAddress,
      smartvpsServiceId: order.smartvpsServiceId
    });

    if (provider === 'hostycare') {
      const available = !!order.hostycareServiceId;
      console.log('[ORDER-DETAILS] Hostycare management available:', available);
      return available;
    }

    if (provider === 'smartvps') {
      // For SmartVPS, we need either smartvpsServiceId OR ipAddress
      const available = !!(order.smartvpsServiceId || order.ipAddress);
      console.log('[ORDER-DETAILS] SmartVPS management available:', available);
      return available;
    }

    // OceanLinux managed services don't have external management
    if (provider === 'oceanlinux') {
      console.log('[ORDER-DETAILS] OceanLinux - no external management');
      return false;
    }
    console.log('[ORDER-DETAILS] Unknown provider or no management available');
    return false;
  };

  const fetchServerPowerState = async () => {
    if (!order) return;

    const provider = getProviderFromOrder(order, ipStock);

    // Check if this provider supports power state fetching
    const isHostycare = provider === 'hostycare' && order.hostycareServiceId;
    const isSmartVPS = provider === 'smartvps' && (order.smartvpsServiceId || order.ipAddress);

    if (!isHostycare && !isSmartVPS) {
      return;
    }

    // Don't refetch if already loading
    if (powerStateLoading) return;

    setPowerStateLoading(true);

    try {
      console.log('[ORDER-DETAILS] Fetching server power state for provider:', provider);

      // Use the appropriate endpoint based on provider
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : 'service-action';

      const res = await fetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action: 'status' })
      });
      const data = await res.json();

      if (data.powerState) {
        console.log('[ORDER-DETAILS] Server power state:', data.powerState);
        setServerPowerState(data.powerState);
      } else {
        console.log('[ORDER-DETAILS] Could not determine power state:', data);
        setServerPowerState('unknown');
      }
    } catch (error) {
      console.error('[ORDER-DETAILS] Failed to fetch power state:', error);
      setServerPowerState('unknown');
    } finally {
      setPowerStateLoading(false);
    }
  };

  const loadServiceDetails = async () => {
    if (!order) return;

    const provider = getProviderFromOrder(order, ipStock);

    // Only load service details for providers with management APIs
    if (!isServerManagementAvailable(order, ipStock)) {
      return;
    }

    setServiceLoading(true);
    try {
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : 'service-action';
      console.log('[ORDER-DETAILS] Loading service details from:', endpoint);

      const res = await fetch(`/api/orders/${endpoint}?orderId=${order._id}`);
      const data = await res.json();

      if (data.success) {
        console.log('[ORDER-DETAILS] Service details loaded:', {
          serviceId: data.serviceId,
          credentialsUpdated: data.syncResult?.credentialsUpdated,
          lastSyncTime: data.syncResult?.lastSyncTime
        });

        setServiceDetails(data);

        // Refresh order data to get latest synced information
        await fetchOrder();

        // Also fetch power state for Hostycare and SmartVPS
        if (provider === 'hostycare' || provider === 'smartvps') {
          await fetchServerPowerState();
        }

        // Show success message if credentials were updated during sync
        if (data.syncResult?.credentialsUpdated) {
          toast.success('Server information updated from provider');
        }
      }
    } catch (error) {
      console.error('[ORDER-DETAILS] Failed to load service details:', error);
      toast.error('Failed to load service details');
    } finally {
      setServiceLoading(false);
    }
  };

  const runServiceAction = async (action: string, payload?: any) => {
    if (!order || !isServerManagementAvailable(order, ipStock)) return;

    setActionBusy(action);

    // Set power state to busy during action
    if (['start', 'stop', 'restart'].includes(action)) {
      setServerPowerState('busy');
    }

    try {
      const provider = getProviderFromOrder(order, ipStock);
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : 'service-action';

      const res = await fetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action, payload })
      });
      const data = await res.json();

      if (data.success) {
        // For power actions, show a more informative message
        if (['start', 'stop', 'restart'].includes(action)) {
          const actionLabel = action === 'start' ? 'Starting' : action === 'stop' ? 'Stopping' : 'Restarting';
          toast.success(`${actionLabel} server... This may take a few moments.`, {
            duration: 4000,
          });

          // Give the server a moment to change state
          await new Promise(resolve => setTimeout(resolve, 3000));
          await fetchServerPowerState();

          // Show follow-up message to refresh if status doesn't update
          toast.info('If status doesn\'t update, please refresh the page.', {
            duration: 5000,
          });
        } else {
          toast.success(`Action "${action}" executed successfully`);
        }

        await Promise.all([
          loadServiceDetails(),
          fetchOrder()
        ]);

        if (action === 'changepassword' || action === 'reinstall' || action === 'format') {
          toast.success('Password updated in your records');
        }
      } else {
        toast.error(data.error || `Failed to execute "${action}"`);
        // Refresh power state on error too
        if (['start', 'stop', 'restart'].includes(action) && (provider === 'hostycare' || provider === 'smartvps')) {
          await fetchServerPowerState();
        }
      }
    } catch (e: any) {
      toast.error(e.message || `Failed to execute "${action}"`);
      // Refresh power state on error
      const provider = getProviderFromOrder(order, ipStock);
      if (['start', 'stop', 'restart'].includes(action) && (provider === 'hostycare' || provider === 'smartvps')) {
        await fetchServerPowerState();
      }
    } finally {
      setActionBusy(null);
    }
  };

  // Also update the handleAdvancedAction function
  // Updated handleAdvancedAction function
  const handleAdvancedAction = async (action: 'reinstall' | 'format') => {
    if (!order || !isServerManagementAvailable(order, ipStock)) return;

    const provider = getProviderFromOrder(order, ipStock);
    const actionName = action === 'format' ? 'format' : 'reinstall';
    const actionLabel = action === 'format' ? 'Format' : 'Reinstall OS';

    const confirmed = confirm(`Are you sure you want to ${actionName}? This will erase all data!`);
    if (!confirmed) return;

    // NEW
    if ((provider === 'smartvps' && action === 'format') ||
      (provider === 'hostycare' && action === 'reinstall')) {
      await openOsDialog(provider);
      return;
    }


    // For other providers, use the existing prompt-based approach
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



  // New function to open format dialog for SmartVPS
  const openFormatDialog = async () => {
    console.log('[FORMAT-DIALOG] Opening format dialog for SmartVPS');
    setFormatProgress('Loading available operating systems...');
    setFormatDialogOpen(true);
    setFormatLoading(true);
    setSelectedTemplate('');

    try {
      // Get available templates
      const templatesRes = await fetch(`/api/orders/smartvps-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order!._id, action: 'templates' })
      });
      const templatesData = await templatesRes.json();

      if (templatesData.success && templatesData.result) {
        console.log('[FORMAT-DIALOG] Templates loaded:', templatesData.result);
        setAvailableTemplates(templatesData.result);
        setFormatProgress('');
        setFormatLoading(false);
      } else {
        throw new Error('Failed to load templates');
      }
    } catch (error) {
      console.error('[FORMAT-DIALOG] Error loading templates:', error);
      setFormatProgress('Failed to load operating systems. Please try again.');
      setFormatLoading(false);
    }
  };

  // Function to execute SmartVPS format
  const executeSmartVPSFormat = async () => {
    if (!selectedTemplate) {
      toast.error('Please select an operating system');
      return;
    }

    console.log('[FORMAT-DIALOG] Starting format with template:', selectedTemplate);
    setFormatLoading(true);
    setFormatProgress('Initiating server format...');

    try {
      // Execute format action
      const formatRes = await fetch(`/api/orders/smartvps-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order!._id,
          action: 'format',
          payload: {
            templateId: selectedTemplate
          }
        })
      });
      const formatData = await formatRes.json();

      if (formatData.success) {
        console.log('[FORMAT-DIALOG] Format initiated successfully');
        setFormatProgress('Format initiated. Waiting for server to update...');

        // Start polling for updates
        await pollForServerUpdates();
      } else {
        throw new Error(formatData.error || 'Format failed');
      }
    } catch (error) {
      console.error('[FORMAT-DIALOG] Format error:', error);
      setFormatProgress(`Error: ${error.message}`);
      setTimeout(() => {
        setFormatDialogOpen(false);
        setFormatLoading(false);
        setFormatProgress('');
      }, 3000);
    }
  };

  // Function to poll for server updates after format
  const pollForServerUpdates = async () => {
    console.log('[FORMAT-DIALOG] Starting enhanced polling for server updates');
    const maxAttempts = 24; // 4 minutes max (10 seconds * 24)
    let attempts = 0;
    const originalOrder = { ...order! };

    const poll = async () => {
      attempts++;
      console.log(`[FORMAT-DIALOG] Polling attempt ${attempts}/${maxAttempts}`);

      setFormatProgress(`Checking server status... (${attempts}/${maxAttempts})`);

      try {
        // First, try to sync from SmartVPS
        console.log('[FORMAT-DIALOG] Triggering service sync...');
        const syncRes = await fetch(`/api/orders/smartvps-action?orderId=${order!._id}`);
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          console.log('[FORMAT-DIALOG] Sync response:', {
            success: syncData.success,
            credentialsUpdated: syncData.syncResult?.credentialsUpdated
          });
        }

        // Then fetch the latest order data
        const orderRes = await fetch(`/api/orders/${order!._id}`);
        if (!orderRes.ok) throw new Error('Failed to fetch order');
        const latestOrder = await orderRes.json();

        console.log('[FORMAT-DIALOG] Order comparison:', {
          original: {
            username: originalOrder.username,
            password: originalOrder.password ? '[PASSWORD SET]' : 'null',
            os: originalOrder.os
          },
          latest: {
            username: latestOrder.username,
            password: latestOrder.password ? '[PASSWORD SET]' : 'null',
            os: latestOrder.os
          }
        });

        // Check if credentials have been updated (indicating format completion)
        const credentialsUpdated = (
          latestOrder.username !== originalOrder.username ||
          latestOrder.password !== originalOrder.password ||
          latestOrder.os !== originalOrder.os
        );

        const statusImproved = (
          latestOrder.provisioningStatus === 'active' &&
          originalOrder.provisioningStatus !== 'active'
        );

        if (credentialsUpdated || statusImproved) {
          console.log('[FORMAT-DIALOG] Server format completed - credentials or status updated');
          setFormatProgress('Server format completed successfully!');

          // Update local order state
          setOrder(latestOrder);

          // Show appropriate success message
          if (credentialsUpdated) {
            toast.success('Server format completed! New credentials have been generated.');
          } else {
            toast.success('Server format completed! Server is now active.');
          }

          setTimeout(() => {
            setFormatDialogOpen(false);
            setFormatLoading(false);
            setFormatProgress('');
          }, 2000);
          return;
        }

        // Continue polling if not complete and haven't exceeded max attempts
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          console.log('[FORMAT-DIALOG] Polling timeout reached');
          setFormatProgress('Format is taking longer than expected. Please check back in a few minutes or use the sync button.');
          setTimeout(() => {
            setFormatDialogOpen(false);
            setFormatLoading(false);
            setFormatProgress('');
            // Refresh order data one final time
            fetchOrder();
          }, 5000);
        }
      } catch (error) {
        console.error('[FORMAT-DIALOG] Polling error:', error);
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Continue polling despite error
        } else {
          setFormatProgress('Unable to verify format completion. Please refresh the page or use the sync button to check status.');
          setTimeout(() => {
            setFormatDialogOpen(false);
            setFormatLoading(false);
            setFormatProgress('');
          }, 5000);
        }
      }
    };

    // Start first poll after a short delay
    setTimeout(poll, 8000); // Wait 8 seconds for format to start
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



  // Add this function after the other utility functions
  const isExpired = (order: Order | null) => {
    if (!order || !order.expiryDate) return false;
    return getDaysUntilExpiry(order.expiryDate) < 0;
  };

  // Check if order is unpaid (pending status means payment didn't go through)
  const isUnpaid = (order: Order | null) => {
    if (!order) return false;
    return order.status.toLowerCase() === 'pending';
  };

  const handleRenewService = async (selectedMethod?: 'cashfree' | 'razorpay' | 'upi') => {
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

    const paymentMethod = selectedMethod || renewalPaymentMethod;
    console.log(`[RENEWAL] Initiating renewal with payment method: ${paymentMethod}`);

    try {
      const res = await fetch("/api/payment/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order._id,
          paymentMethod: paymentMethod
        })
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle auth errors with proper session alerts
        if (res.status === 401) {
          const errorCode = data.code || '';
          if (errorCode === 'SESSION_EXPIRED' || data.message?.toLowerCase().includes('expired')) {
            showAlert('session_expired', 'Your session expired. Please log in again to renew your service.');
          } else {
            showAlert('action_requires_login', 'Please log in to renew your service.');
          }
        } else {
          toast.error(data.message || "Failed to initiate renewal payment");
        }
        setActionBusy(null);
        return;
      }

      if (data.renewalTxnId) {
        localStorage.setItem('lastRenewalTxnId', data.renewalTxnId);
        localStorage.setItem('renewalOrderId', order._id);
      }

      console.log("Renewal payment data received:", data);
      const actualMethod = data.paymentMethod || paymentMethod;
      console.log(`[RENEWAL] Backend returned payment method: ${actualMethod}`);

      // Handle payment based on method
      if (actualMethod === 'razorpay') {
        await handleRazorpayRenewal(data);
      } else if (actualMethod === 'upi') {
        await handleUpiRenewal(data);
      } else {
        await handleCashfreeRenewal(data);
      }

    } catch (error: any) {
      console.error("[RENEWAL] Error initiating renewal payment:", error);
      toast.error("Something went wrong. Please try again");
      setActionBusy(null);
    }
  };

  const handleCashfreeRenewal = async (data: any) => {
    try {
      console.log("[RENEWAL] Initializing Cashfree renewal checkout");

      if (!window.Cashfree) {
        throw new Error("Cashfree SDK not loaded");
      }

      const cashfree = await window.Cashfree({
        mode: process.env.NEXT_PUBLIC_CASHFREE_ENVIRONMENT || "production"
      });

      const returnUrl = `${window.location.origin}/payment/callback?client_txn_id=${data.renewalTxnId}&order_id=${order?._id}`;

      const checkoutOptions = {
        paymentSessionId: data.cashfree.payment_session_id,
        returnUrl: returnUrl,
        notifyUrl: `${window.location.origin}/api/payment/webhook`
      };

      console.log("[RENEWAL] Opening Cashfree checkout");
      await cashfree.checkout(checkoutOptions);

    } catch (error: any) {
      console.error("[RENEWAL] Cashfree renewal error:", error);
      toast.error("Cashfree payment failed. Trying Razorpay...");

      // Fallback to Razorpay
      await handleRenewService('razorpay');
    }
  };

  const handleRazorpayRenewal = async (data: any) => {
    try {
      console.log("[RENEWAL] Initializing Razorpay renewal checkout");

      if (!window.Razorpay) {
        throw new Error("Razorpay SDK not loaded");
      }

      const options = {
        key: data.razorpay.key,
        amount: data.razorpay.amount,
        currency: data.razorpay.currency,
        name: "OceanLinux",
        description: `Renewal: ${order?.productName}`,
        order_id: data.razorpay.order_id,
        handler: async function (response: any) {
          console.log("[RENEWAL] Razorpay payment successful:", response);
          toast.success("Payment successful! Processing renewal...");

          try {
            const confirmRes = await fetch("/api/payment/renew-confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                renewalTxnId: data.renewalTxnId,
                orderId: order?._id,
                paymentMethod: 'razorpay',
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature
              })
            });

            const confirmData = await confirmRes.json();

            if (confirmRes.ok && confirmData.success) {
              toast.success("Service renewed successfully!");
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
        prefill: {
          name: data.customer.name,
          email: data.customer.email,
          contact: data.customer.phone
        },
        theme: {
          color: "#3399cc"
        }
      };

      const rzp = new window.Razorpay(options);

      rzp.on('payment.failed', function (response: any) {
        console.error("[RENEWAL] Razorpay payment failed:", response);
        toast.error("Razorpay payment failed. Trying UPI Gateway...");
        setActionBusy(null);

        // Fallback to UPI Gateway
        handleRenewService('upi');
      });

      rzp.open();

    } catch (error: any) {
      console.error("[RENEWAL] Razorpay renewal error:", error);
      toast.error("Razorpay payment failed. Trying UPI Gateway...");

      // Fallback to UPI Gateway
      await handleRenewService('upi');
    }
  };

  const handleUpiRenewal = async (data: any) => {
    try {
      console.log("[RENEWAL] Redirecting to UPI Gateway");

      if (!data.upi || !data.upi.payment_url) {
        throw new Error("UPI Gateway payment URL not available");
      }

      // Redirect to UPI Gateway payment page
      window.location.href = data.upi.payment_url;

    } catch (error: any) {
      console.error("[RENEWAL] UPI Gateway renewal error:", error);
      toast.error("UPI Gateway payment failed. Trying Cashfree...");

      // Fallback to Cashfree
      await handleRenewService('cashfree');
    }
  };

  // ... existing imports and code ...

  // Helper to get power state badge for active servers
  const getPowerStateBadge = () => {
    if (powerStateLoading) {
      return (
        <Badge className="bg-muted text-muted-foreground border-border">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Checking...
        </Badge>
      );
    }

    switch (serverPowerState) {
      case 'running':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            Online
          </Badge>
        );
      case 'stopped':
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Offline
          </Badge>
        );
      case 'suspended':
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Offline
          </Badge>
        );
      case 'busy':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      default:
        return (
          <Badge className="bg-primary/10 text-green-500 border-primary/20">
            <div className="w-2 h-2 bg-primary rounded-full mr-2 animate-pulse"></div>
            Active
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string, order?: Order) => {
    if (actionBusy) {
      const actionLabels = {
        'restart': { label: 'Restarting', icon: RefreshCw, color: 'bg-primary/10 text-primary border-primary/20' },
        'start': { label: 'Starting', icon: Loader2, color: 'bg-primary/10 text-primary border-primary/20' },
        'stop': { label: 'Stopping', icon: Loader2, color: 'bg-muted text-muted-foreground border-border' },
        'renew': { label: 'Renewing', icon: Loader2, color: 'bg-primary/10 text-primary border-primary/20' },
        'reinstall': { label: 'Reinstalling', icon: Loader2, color: 'bg-muted text-muted-foreground border-border' },
        'format': { label: 'Formatting', icon: Loader2, color: 'bg-muted text-muted-foreground border-border' },
        'changepassword': { label: 'Changing Password', icon: Loader2, color: 'bg-primary/10 text-primary border-primary/20' }
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

    const currentStatus = provisioningStatus || status;
    const isActiveStatus = status.toLowerCase() === 'completed' || currentStatus.toLowerCase() === 'active';
    const canShowPowerState = (provider === 'hostycare' || provider === 'smartvps') && isActiveStatus;

    // For active servers with power state support, show actual power state
    if (canShowPowerState && serverPowerState !== 'unknown') {
      return getPowerStateBadge();
    }

    if (status.toLowerCase() === 'completed') {
      return (
        <Badge className="bg-primary/10 text-green-500 border-primary/20">
          <div className="w-2 h-2 bg-primary rounded-full mr-2 animate-pulse"></div>
          Active
        </Badge>
      );
    }

    // Check for configuration errors first
    if (order?.provisioningError &&
      (order.provisioningError.includes('Missing hostycareProductId') ||
        order.provisioningError.includes('CONFIG:') ||
        order.provisioningError.includes('Memory configuration not found') ||
        order.provisioningError.includes('lacks hostycareProductId'))) {
      return (
        <Badge className="bg-muted text-muted-foreground border-border">
          <Settings2 className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    }

    switch (currentStatus.toLowerCase()) {
      case 'active':
        // If we're here, powerState is unknown - show loading or default
        if (powerStateLoading && (provider === 'hostycare' || provider === 'smartvps')) {
          return (
            <Badge className="bg-muted text-muted-foreground border-border">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Checking...
            </Badge>
          );
        }
        return (
          <Badge className="bg-primary/10 text-green-500 border-primary/20">
            <div className="w-2 h-2 bg-primary rounded-full mr-2 animate-pulse"></div>
            Active
          </Badge>
        );
      case 'pending':
      case 'confirmed':
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            <Clock className="w-3 h-3 mr-1" />
            Pending Setup
          </Badge>
        );
      case 'provisioning':
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Provisioning
          </Badge>
        );
      case 'suspended':
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Offline
          </Badge>
        );
      case 'failed':
        // Double-check for config errors even in failed status
        if (order?.provisioningError && order.provisioningError.includes('CONFIG:')) {
          return (
            <Badge className="bg-muted text-muted-foreground border-border">
              <Settings2 className="w-3 h-3 mr-1" />
              Awaiting Config
            </Badge>
          );
        }
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'terminated':
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
            <XCircle className="w-3 h-3 mr-1" />
            Terminated
          </Badge>
        );
      default:
        // Enhanced default case
        const isManualOrder = !lastAction || lastAction.includes('manual');
        if (isManualOrder || currentStatus.toLowerCase() === 'confirmed') {
          return (
            <Badge className="bg-muted text-muted-foreground border-border">
              <Clock className="w-3 h-3 mr-1" />
              Awaiting Setup
            </Badge>
          );
        }

        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
            <Shield className="w-3 h-3 mr-1" />
            {currentStatus}
          </Badge>
        );
    }
  };

  // ... rest of existing code ...
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-background flex justify-center items-center'>
        <div className="w-full flex justify-center items-center px-4">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 bg-primary/20 rounded-full animate-pulse"></div>
              <Loader2 className="absolute inset-0 m-auto animate-spin h-8 w-8 text-primary" />
            </div>
            <p className="text-muted-foreground font-medium">Loading server details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className='min-h-screen bg-background flex justify-center items-center'>
        <div className="w-full flex justify-center items-center px-4">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
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
      </div>
    );
  }

  const provider = getProviderFromOrder(order, ipStock);
  const canManageServer = isServerManagementAvailable(order, ipStock);

  return (
    <div className='min-h-screen bg-background'>
      {/* Add proper mobile top spacing */}
      <div className="pt-16 lg:pt-0">
        {/* Modern Header */}
        <div className='sticky top-16 lg:top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 lg:p-5 max-w-7xl mx-auto'>
            <div className='flex items-start sm:items-center gap-3 min-w-0 flex-1'>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/dashboard/viewLinux')}
                className="hover:bg-muted rounded-lg flex-shrink-0 h-10 w-10"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <OSIcon os={order.os} className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className='text-base sm:text-lg font-semibold break-words mb-1.5'>
                  {styleText(order.productName)}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-xs h-5">
                    {getProviderDisplayName(provider)}
                  </Badge>
                  {getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchOrder}
                disabled={loading}
                className="h-9 gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync</span>
              </Button>
            </div>
          </div>
        </div>

        <div className='max-w-7xl mx-auto p-4 lg:p-6'>
          {/* Check if order is unpaid */}
          {isUnpaid(order) ? (
            /* Unpaid Order UI */
            <div className="flex justify-center items-center min-h-[60vh]">
              <Card className="shadow-lg border-0 bg-card max-w-lg w-full">
                <CardContent className="p-6 lg:p-8 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <XCircle className="h-8 w-8 sm:h-10 sm:w-10 text-red-600 dark:text-red-400" />
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold mb-4">
                    Order Purchase Didn't Go Through
                  </h2>

                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 sm:p-6 mb-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-left">
                        <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
                          Payment Not Completed
                        </h3>
                        <p className="text-sm text-red-700 dark:text-red-300">
                          This order was created but the payment was not completed.
                          The server has not been provisioned.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-xl p-4 sm:p-6 mb-6 text-left">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      Order Details
                    </h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Service:</span>
                        <span className="font-medium text-foreground break-words max-w-[60%] text-right">
                          {order.productName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Configuration:</span>
                        <span className="font-medium text-foreground">{order.memory}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Operating System:</span>
                        <span className="font-medium text-foreground">{order.os}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Price:</span>
                        <span className="font-medium text-foreground">₹{order.price}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Order ID:</span>
                        <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">
                          {order._id}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <Button
                      onClick={() => router.push('/dashboard/ipStock')}
                      className="flex-1 gap-2 h-11 sm:h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                    >
                      <Server className="h-4 w-4 sm:h-5 sm:w-5" />
                      Purchase New Server
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/dashboard/viewLinux')}
                      className="flex-1 gap-2 h-11 sm:h-12"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Servers
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : isExpired(order) ? (
            /* Expired Service UI */
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
              {/* Left Column - Service Information */}
              <div className="xl:col-span-2">
                <Card className="shadow-lg border-0 bg-card">
                  <CardContent className="p-6 lg:p-8 text-center">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Calendar className="h-8 w-8 sm:h-10 sm:w-10 text-amber-600 dark:text-amber-400" />
                    </div>

                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-4">
                      Your Service Has Expired
                    </h2>

                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 sm:p-6 mb-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-left">
                          <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                            Service No Longer Active
                          </h3>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                            This server service expired on <strong>{formatDate(order.expiryDate!)}</strong>
                            ({Math.abs(getDaysUntilExpiry(order.expiryDate))} days ago) and is no longer accessible.
                            To continue using our services, you'll need to purchase a new plan.
                          </p>

                          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-2 rounded-lg">
                            <strong>Note:</strong> All server data and configurations have been removed due to expiration.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-xl p-4 sm:p-6 mb-6 text-left">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        Expired Service Details
                      </h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Service:</span>
                          <span className="font-medium text-foreground break-words max-w-[60%] text-right">
                            {order.productName}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Configuration:</span>
                          <span className="font-medium text-foreground">{order.memory}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Operating System:</span>
                          <span className="font-medium text-foreground">{order.os}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Original Price:</span>
                          <span className="font-medium text-foreground">₹{order.price}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Provider:</span>
                          <span className="font-medium text-foreground">{getProviderDisplayName(provider)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Service ID:</span>
                          <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">
                            {order._id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <Button
                        onClick={() => router.push('/dashboard/ipStock')}
                        className="flex-1 gap-2 h-11 sm:h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                      >
                        <Server className="h-4 w-4 sm:h-5 sm:w-5" />
                        Browse New Plans
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => router.push('/dashboard/viewLinux')}
                        className="flex-1 gap-2 h-11 sm:h-12 text-base"
                      >
                        <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                        Back to Servers
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Additional Info */}
              <div className="space-y-4 lg:space-y-6">
                {/* Renewal History if exists */}
                {order.renewalPayments && order.renewalPayments.length > 0 && (
                  <Card className="shadow-lg border-0 bg-card">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                        <CreditCard className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                        Payment History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm p-3 bg-muted rounded-lg">
                          <div>
                            <p className="font-semibold">₹{order.price} paid</p>
                            <p className="text-muted-foreground">{order.createdAt ? formatDate(order.createdAt) : 'Initial purchase'}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-muted-foreground">Service period</p>
                            <p className="font-medium">{order.expiryDate ? formatDate(order.expiryDate) : 'N/A'}</p>
                          </div>
                        </div>

                        {order.renewalPayments.map((renewal, index) => (
                          <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm p-3 bg-muted rounded-lg">
                            <div>
                              <p className="font-semibold">₹{renewal.amount} paid</p>
                              <p className="text-muted-foreground">{formatDate(renewal.paidAt)}</p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-muted-foreground">Extended to</p>
                              <p className="font-medium">{formatDate(renewal.newExpiry)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Support Card */}
                <Card className="shadow-lg border-0 bg-card">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                      <Info className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                      Need Help?
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        If you have questions about this expired service or need assistance with a new purchase, our support team is here to help.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => router.push('/support/tickets')}
                        className="w-full gap-2"
                      >
                        <LifeBuoy className="h-4 w-4" />
                        Contact Support
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
              {/* Left Column - Server Info & Connection */}
              <div className="xl:col-span-2 space-y-4 lg:space-y-6">
                {/* Server Overview */}
                <Card className="border-border hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Server className="h-4 w-4 text-primary" />
                        </div>
                        Server Overview
                      </CardTitle>
                      <Badge variant="outline" className="text-xs h-6 self-start sm:self-auto">
                        <Clock className="h-3 w-3 mr-1" />
                        {order.createdAt ? formatDate(order.createdAt) : 'Unknown'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-primary/10 rounded-lg border border-primary/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <Terminal className="h-5 w-5 text-" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Operating System</p>
                            <p className="font-semibold text-foreground text-sm break-words mt-0.5">{order.os}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-primary/10 rounded-lg border border-primary/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <MemoryStick className="h-5 w-5 text-" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Memory</p>
                            <p className="font-semibold text-foreground text-sm break-words mt-0.5">{order.memory}</p>
                          </div>
                        </div>
                      </div>

                      <div className={cn(
                        "p-3 rounded-lg border shadow-sm",
                        (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'running' && "bg-green-500/10 border-green-500/30",
                        (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'stopped' && "bg-red-500/10 border-red-500/30",
                        (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'busy' && "bg-blue-500/10 border-blue-500/30",
                        !((provider === 'hostycare' || provider === 'smartvps') && ['running', 'stopped', 'busy'].includes(serverPowerState)) && "bg-primary/10 border-primary/30"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm",
                            (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'running' && "bg-green-500/20",
                            (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'stopped' && "bg-red-500/20",
                            (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'busy' && "bg-blue-500/20",
                            !((provider === 'hostycare' || provider === 'smartvps') && ['running', 'stopped', 'busy'].includes(serverPowerState)) && "bg-primary/20"
                          )}>
                            <Activity className={cn(
                              "h-5 w-5",
                              (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'running' && "text-green-600",
                              (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'stopped' && "text-red-600",
                              (provider === 'hostycare' || provider === 'smartvps') && serverPowerState === 'busy' && "text-blue-600"
                            )} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                              {(provider === 'hostycare' || provider === 'smartvps') ? 'Power Status' : 'Status'}
                            </p>
                            <div className="mt-1">
                              {getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-primary/10 rounded-lg border border-primary/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <Database className="h-5 w-5 text-" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Provider</p>
                            <p className="font-semibold text-foreground text-sm capitalize mt-0.5">
                              {getProviderDisplayName(provider)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Connection Details */}
                {order.ipAddress && order.username ? (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Network className="h-4 w-4 text-primary" />
                        </div>
                        Connection Details
                      </CardTitle>
                      <CardDescription className="text-xs lg:text-sm">
                        Use these credentials to connect to your server
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* IP Address */}
                      <div className="space-y-2">
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                              <Globe className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-muted-foreground">Server IP Address</span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={order.ipAddress}
                              className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(order.ipAddress!, 'IP Address')}
                              className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                            >
                              {copied === 'IP Address' ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Username */}
                      <div className="space-y-2">
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-muted-foreground">Username</span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={order.username}
                              className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(order.username!, 'Username')}
                              className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                            >
                              {copied === 'Username' ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Password */}
                      <div className="space-y-2">
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                              <Lock className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-muted-foreground">Password</span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              type={showPassword ? "text" : "password"}
                              value={order.password || ''}
                              className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setShowPassword(!showPassword)}
                              className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
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
                              className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                            >
                              {copied === 'Password' ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* SSH/RDP Command */}
                      <div className="pt-1">
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                              <Terminal className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-muted-foreground">
                              {order.os.toLowerCase().includes('windows') ? 'RDP Connection' : 'SSH Connection Command'}
                            </span>
                          </Label>
                          <div className="relative">
                            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                                  <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></div>
                                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                                  <span className="text-gray-400 text-xs ml-2">
                                    {order.os.toLowerCase().includes('windows') ? 'Remote Desktop' : 'Terminal'}
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (order.os.toLowerCase().includes('windows')) {
                                      copyToClipboard(order.ipAddress, 'RDP Address');
                                    } else {
                                      copyToClipboard(`ssh ${order.username}@${order.ipAddress}`, 'SSH Command');
                                    }
                                  }}
                                  className="text-green-400 hover:bg-green-400/20 h-6 px-2"
                                >
                                  {copied === 'SSH Command' || copied === 'RDP Address' ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                              <div className="overflow-x-auto">
                                {order.os.toLowerCase().includes('windows') ? (
                                  <div className="space-y-1">
                                    <code className="text-green-400 font-mono text-xs whitespace-nowrap block">
                                      Address: {order.ipAddress}
                                    </code>
                                    <code className="text-gray-400 font-mono text-xs whitespace-nowrap block">
                                      Use Remote Desktop Connection (mstsc)
                                    </code>
                                  </div>
                                ) : (
                                  <code className="text-green-400 font-mono text-xs whitespace-nowrap">
                                    ssh {order.username}@{order.ipAddress}
                                  </code>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-border">
                    <CardContent className="text-center py-10 lg:py-12">
                      <div className="w-14 h-14 lg:w-16 lg:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="h-7 w-7 lg:h-8 lg:w-8 text-primary" />
                      </div>
                      <h3 className="text-base lg:text-lg font-semibold mb-2">Server Setup in Progress</h3>
                      <p className="text-muted-foreground mb-4 text-sm px-4">
                        Your server is being configured. Connection details will appear here once ready.
                      </p>
                      <Badge variant="outline" className="text-xs px-3 py-1.5">
                        <Clock className="h-3 w-3 mr-1.5" />
                        Est. setup time: 5-10 minutes
                      </Badge>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Activity */}
                {(order.lastAction || order.lastActionTime) && (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Activity className="h-4 w-4 text-primary" />
                        </div>
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          {order.lastAction === 'start' && <Play className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'stop' && <Square className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'restart' && <RotateCcw className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'renew' && <CreditCard className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'changepassword' && <KeyRound className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'reinstall' && <HardDriveIcon className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'format' && <HardDriveIcon className="h-5 w-5 text-primary" />}
                          {!order.lastAction && <Activity className="h-5 w-5 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm break-words">
                            {order.lastAction ?
                              `Last action: ${order.lastAction.charAt(0).toUpperCase() + order.lastAction.slice(1)}`
                              : 'Server Activity'
                            }
                          </p>
                          {order.lastActionTime && (
                            <p className="text-muted-foreground text-xs mt-0.5">
                              {formatDate(order.lastActionTime)}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Manual Server Action Requests - For non-auto-provisioned products */}
                {provider === 'oceanlinux' && (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Settings2 className="h-4 w-4 text-primary" />
                        </div>
                        Server Actions
                      </CardTitle>
                      <CardDescription className="text-xs lg:text-sm">
                        Request server actions - Admin will review and process
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Pending Request Alert */}
                      {pendingRequest && (
                        <Alert className={
                          pendingRequest.status === 'pending' ? 'bg-yellow-500/10 border-yellow-500/20' :
                            pendingRequest.status === 'approved' ? 'bg-green-500/10 border-green-500/20' :
                              'bg-red-500/10 border-red-500/20'
                        }>
                          <Clock className="h-4 w-4" />
                          <AlertDescription>
                            <div className="space-y-1">
                              <p className="font-semibold">
                                {pendingRequest.status === 'pending' && `${pendingRequest.action.toUpperCase()} request pending admin approval`}
                                {pendingRequest.status === 'approved' && `${pendingRequest.action.toUpperCase()} request approved`}
                                {pendingRequest.status === 'rejected' && `${pendingRequest.action.toUpperCase()} request rejected`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Requested: {new Date(pendingRequest.requestedAt).toLocaleString()}
                              </p>
                              {pendingRequest.adminNotes && (
                                <p className="text-xs mt-2 p-2 bg-muted rounded">
                                  <span className="font-medium">Admin notes:</span> {pendingRequest.adminNotes}
                                </p>
                              )}
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestServerAction('start')}
                          disabled={!!pendingRequest || requestLoading}
                          className="flex items-center gap-2"
                        >
                          {requestLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Request Start
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestServerAction('stop')}
                          disabled={!!pendingRequest || requestLoading}
                          className="flex items-center gap-2"
                        >
                          <Square className="h-4 w-4" />
                          Request Stop
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestServerAction('restart')}
                          disabled={!!pendingRequest || requestLoading}
                          className="flex items-center gap-2"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Request Restart
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestServerAction('format')}
                          disabled={!!pendingRequest || requestLoading}
                          className="flex items-center gap-2"
                        >
                          <HardDriveIcon className="h-4 w-4" />
                          Request Format
                        </Button>
                      </div>

                      {!pendingRequest && (
                        <p className="text-xs text-muted-foreground text-center pt-2">
                          Submit a request and an admin will process it shortly
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
              <Dialog
                open={osDialogOpen}
                onOpenChange={(open) => {
                  if (!osLoading) {
                    setOsDialogOpen(open);
                    if (!open) {
                      setSelectedOs('');
                      setOsTemplates({});
                      setOsProgress('');
                    }
                  }
                }}
              >
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <HardDriveIcon className="h-5 w-5 text-primary" />
                      {osMode === 'format' ? 'Format Server' : 'Reinstall OS'}
                    </DialogTitle>
                    <DialogDescription>
                      Select an operating system. This will erase all data and install a fresh OS.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 py-4">
                    {osLoading && osProgress ? (
                      <div className="flex flex-col items-center gap-4 py-6">
                        <div className="relative">
                          <div className="w-16 h-16 bg-primary/20 rounded-full animate-pulse"></div>
                          <Loader2 className="absolute inset-0 m-auto animate-spin h-8 w-8 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-sm">{osProgress}</p>
                          <p className="text-xs text-muted-foreground mt-1">Please don't close this dialog</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="os-select" className="text-sm font-medium">
                            Select Operating System
                          </Label>
                          <Select value={selectedOs} onValueChange={setSelectedOs}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose an operating system" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(osTemplates).map(([id, name]) => (
                                <SelectItem key={id} value={id}>
                                  {typeof name === 'string' ? name : (name as any)?.name || `Template ${id}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription className="text-sm">
                            <strong>Warning:</strong> This will permanently delete all data on your server and install the selected operating system.
                          </AlertDescription>
                        </Alert>

                        <div className="flex gap-3 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setOsDialogOpen(false)}
                            className="flex-1"
                            disabled={osLoading}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={executeOsAction}
                            disabled={!selectedOs || osLoading}
                            className="flex-1 bg-destructive hover:bg-destructive/90"
                          >
                            {osMode === 'format' ? 'Format Server' : 'Reinstall OS'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>


              {/* Right Column - Management & Billing */}
              <div className="space-y-4 lg:space-y-6">
                {/* Server Management - Only show if provider supports management */}
                {canManageServer ? (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Settings2 className="h-4 w-4 text-primary" />
                        </div>
                        Server Control
                      </CardTitle>
                      <CardDescription className="text-xs lg:text-sm">
                        Manage your server's power state and configuration
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Server Power State Indicator */}
                      {(provider === 'hostycare' || provider === 'smartvps') && (
                        <div className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                          powerStateLoading && "bg-muted/50 border-border",
                          !powerStateLoading && serverPowerState === 'running' && "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
                          !powerStateLoading && serverPowerState === 'stopped' && "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
                          !powerStateLoading && serverPowerState === 'suspended' && "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
                          !powerStateLoading && serverPowerState === 'busy' && "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
                          !powerStateLoading && serverPowerState === 'unknown' && "bg-muted/50 border-border"
                        )}>
                          {powerStateLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-muted-foreground">Checking Status...</p>
                                <p className="text-xs text-muted-foreground">Fetching server power state</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className={cn(
                                "w-3 h-3 rounded-full",
                                serverPowerState === 'running' && "bg-green-500 animate-pulse",
                                serverPowerState === 'stopped' && "bg-red-500",
                                serverPowerState === 'suspended' && "bg-red-500",
                                serverPowerState === 'busy' && "bg-blue-500 animate-pulse",
                                serverPowerState === 'unknown' && "bg-gray-400"
                              )} />
                              <div className="flex-1">
                                <p className={cn(
                                  "text-sm font-medium",
                                  serverPowerState === 'running' && "text-green-700 dark:text-green-300",
                                  serverPowerState === 'stopped' && "text-red-700 dark:text-red-300",
                                  serverPowerState === 'suspended' && "text-red-700 dark:text-red-300",
                                  serverPowerState === 'busy' && "text-blue-700 dark:text-blue-300",
                                  serverPowerState === 'unknown' && "text-muted-foreground"
                                )}>
                                  {serverPowerState === 'running' && 'Server is Online'}
                                  {serverPowerState === 'stopped' && 'Server is Offline'}
                                  {serverPowerState === 'suspended' && 'Server is Offline'}
                                  {serverPowerState === 'busy' && 'Processing...'}
                                  {serverPowerState === 'unknown' && 'Status Unknown'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {serverPowerState === 'running' && 'Your server is online and responding'}
                                  {serverPowerState === 'stopped' && 'Your server is powered off'}
                                  {serverPowerState === 'suspended' && 'Your server is powered off'}
                                  {serverPowerState === 'busy' && 'Please wait while the action completes'}
                                  {serverPowerState === 'unknown' && 'Click Sync to check server status'}
                                </p>
                              </div>
                              {serverPowerState === 'busy' ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => fetchServerPowerState()}
                                  disabled={powerStateLoading}
                                  className="h-8 w-8 p-0 hover:bg-muted"
                                  title="Refresh status"
                                >
                                  <RefreshCw className={cn(
                                    "h-4 w-4 text-muted-foreground",
                                    powerStateLoading && "animate-spin"
                                  )} />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Power Controls */}
                      <div className="grid grid-cols-1 gap-2">
                        <Button
                          variant="default"
                          onClick={() => runServiceAction('start')}
                          disabled={!!actionBusy || serverPowerState === 'running' || serverPowerState === 'busy'}
                          className={cn(
                            "h-10 gap-2 text-sm",
                            serverPowerState === 'running'
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-primary hover:bg-primary/90"
                          )}
                        >
                          {actionBusy === 'start' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          {serverPowerState === 'running' ? 'Server Already Online' : 'Start Server'}
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => runServiceAction('stop')}
                          disabled={!!actionBusy || serverPowerState === 'stopped' || serverPowerState === 'busy'}
                          className={cn(
                            "h-10 gap-2 text-sm",
                            serverPowerState === 'stopped' && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {actionBusy === 'stop' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                          {serverPowerState === 'stopped' ? 'Server Already Offline' : 'Stop Server'}
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => runServiceAction('restart')}
                          disabled={!!actionBusy || serverPowerState === 'stopped' || serverPowerState === 'busy'}
                          className={cn(
                            "h-10 gap-2 text-sm",
                            serverPowerState === 'stopped' && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {actionBusy === 'restart' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          {serverPowerState === 'stopped' ? 'Cannot Restart (Offline)' : 'Restart Server'}
                        </Button>
                      </div>

                      <Separator className="my-3" />

                      {/* Advanced Actions */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Advanced Actions</h4>

                        <Button
                          variant="destructive"
                          onClick={() => handleAdvancedAction(provider === 'smartvps' ? 'format' : 'reinstall')}
                          disabled={!!actionBusy}
                          className="w-full h-10 gap-2 text-sm"
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
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Service Status</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadServiceDetails}
                            disabled={serviceLoading}
                            className="gap-1.5 h-7 px-2 text-xs"
                          >
                            <RefreshCw className={`h-3 w-3 ${serviceLoading ? 'animate-spin' : ''}`} />
                            {serviceLoading ? 'Syncing...' : 'Sync'}
                          </Button>
                        </div>

                        {serviceLoading ? (
                          <div className="flex items-center gap-2 text-muted-foreground text-xs p-2.5 bg-muted/50 rounded-lg">
                            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                            <span>Syncing server status...</span>
                          </div>
                        ) : serviceDetails ? (
                          <div className="p-2.5 bg-primary/5 rounded-lg border border-primary/20">
                            <div className="flex items-start gap-2">
                              <Info className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-muted-foreground">
                                Last synced: {order.lastSyncTime ? formatDate(order.lastSyncTime) : 'Never'}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-xs p-2.5 bg-muted/50 rounded-lg">
                            Click Sync to refresh server status
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  /* Show info card when management is not available */
                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Info className="h-4 w-4 text-primary" />
                        </div>
                        Service Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-3 bg-muted/50 rounded-lg border border-border">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Database className="h-4 w-4 text-" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-foreground mb-1 text-sm">
                              {getProviderDisplayName(provider)} Service
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">
                              {provider === 'oceanlinux'
                                ? 'This service is directly managed by OceanLinux. Server management tools are not available through this interface.'
                                : 'This service is offered with a partner provider.'}
                            </p>
                            {order.ipAddress && (
                              <p className="text-xs text-muted-foreground">
                                You can still connect to your server using the connection details above.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Billing & Renewal - Hide for manual orders (oceanlinux provider) */}
                {order.expiryDate && provider !== 'oceanlinux' && (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Wallet className="h-4 w-4 text-primary" />
                        </div>
                        Billing Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={cn(
                        "p-4 rounded-lg border shadow-sm",
                        isExpired(order)
                          ? "bg-destructive/10 border-destructive/30"
                          : getDaysUntilExpiry(order.expiryDate) <= 7
                            ? "bg-muted/70 border-border"
                            : "bg-primary/10 border-primary/30"
                      )}>
                        {/* Expiry Status with Icon */}
                        <div className="flex items-start gap-3 mb-4">
                          <div className={cn(
                            "h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0",
                            isExpired(order)
                              ? "bg-destructive/15"
                              : getDaysUntilExpiry(order.expiryDate) <= 7
                                ? "bg-muted"
                                : "bg-primary/15"
                          )}>
                            <Calendar className={cn(
                              "h-6 w-6",
                              isExpired(order)
                                ? "text-destructive"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground"
                                  : "text-primary"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "font-semibold text-sm mb-0.5",
                              isExpired(order)
                                ? "text-destructive"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground"
                                  : "text- "
                            )}>
                              {isExpired(order) ? 'Service Expired' : 'Service Expires'}
                            </p>
                            <p className={cn(
                              "text-xs",
                              isExpired(order)
                                ? "text-destructive/80"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground/80"
                                  : "text-muted-foreground /80"
                            )}>
                              {formatDate(order.expiryDate)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={cn(
                              "text-3xl font-bold leading-none",
                              isExpired(order)
                                ? "text-destructive"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground"
                                  : "text-"
                            )}>
                              {Math.abs(getDaysUntilExpiry(order.expiryDate))}
                            </p>
                            <p className={cn(
                              "text-xs font-medium mt-1",
                              isExpired(order)
                                ? "text-destructive/80"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground/80"
                                  : "text-muted-foreground /80"
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

                        {/* Service Price */}
                        <div className="flex items-center justify-between p-2.5 bg-background/50 rounded-md border border-border mb-3">
                          <span className="text-xs text-muted-foreground">Service Price</span>
                          <span className="font-semibold text-sm">₹{order.price}/month</span>
                        </div>

                        {/* Renewal Payment Method Selection */}
                        {isRenewalEligible(order) && (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <button
                                onClick={() => setRenewalPaymentMethod('cashfree')}
                                disabled={actionBusy === 'renew'}
                                className={cn(
                                  "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                  renewalPaymentMethod === 'cashfree'
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                              >
                                Cashfree
                              </button>
                              <button
                                onClick={() => setRenewalPaymentMethod('razorpay')}
                                disabled={actionBusy === 'renew'}
                                className={cn(
                                  "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                  renewalPaymentMethod === 'razorpay'
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                              >
                                Razorpay
                              </button>
                              <button
                                onClick={() => setRenewalPaymentMethod('upi')}
                                disabled={actionBusy === 'renew'}
                                className={cn(
                                  "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                  renewalPaymentMethod === 'upi'
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                              >
                                UPI
                              </button>
                            </div>

                            <Button
                              onClick={() => handleRenewService()}
                              disabled={actionBusy === 'renew'}
                              className={cn(
                                "w-full gap-2 h-10 text-sm shadow-sm",
                                isExpired(order)
                                  ? "bg-destructive hover:bg-destructive/90"
                                  : "dark:bg-green-700 bg-green-500 text-white  hover:bg-primary/90"
                              )}
                            >
                              {actionBusy === 'renew' ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="hidden sm:inline">Processing Payment...</span>
                                  <span className="sm:hidden">Processing...</span>
                                </>
                              ) : (
                                <>
                                  <CreditCard className="h-4 w-4" />
                                  Renew for ₹{order.price}
                                </>
                              )}
                            </Button>
                          </>
                        )}

                        {isExpired(order) && isRenewalEligible(order) && (
                          <div className="flex items-start gap-2 mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-destructive/90">
                              Service renewal available for up to 7 days after expiry
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Renewal History */}
                      {order.renewalPayments && order.renewalPayments.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-3">Renewal History</h4>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {order.renewalPayments.map((renewal, index) => (
                              <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs p-3 bg-primary/5 rounded-lg border border-primary/20">
                                <div>
                                  <p className="font-semibold text-foreground">₹{renewal.amount} paid</p>
                                  <p className="text-muted-foreground mt-0.5">{formatDate(renewal.paidAt)}</p>
                                </div>
                                <div className="text-left sm:text-right">
                                  <p className="text-muted-foreground">Extended to</p>
                                  <p className="font-medium text-foreground mt-0.5">{formatDate(renewal.newExpiry)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Service Details */}
                <Card className="border-border hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Server className="h-4 w-4 text-primary" />
                      </div>
                      Service Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                        <span className="text-xs text-muted-foreground">Service ID</span>
                        <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order._id}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-border">
                        <span className="text-xs text-muted-foreground">Price</span>
                        <span className="font-semibold text-sm">₹{order.price}</span>
                      </div>
                      {order.ipStockId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                          <span className="text-xs text-muted-foreground">IP Stock ID</span>
                          <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order.ipStockId}</span>
                        </div>
                      )}
                      {order.lastSyncTime && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                          <span className="text-xs text-muted-foreground">Last Sync</span>
                          <span className="text-xs">{formatDate(order.lastSyncTime)}</span>
                        </div>
                      )}
                      {provider === 'hostycare' && order.hostycareServiceId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2">
                          <span className="text-xs text-muted-foreground">Hostycare ID</span>
                          <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order.hostycareServiceId}</span>
                        </div>
                      )}
                      {provider === 'smartvps' && order.smartvpsServiceId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2">
                          <span className="text-xs text-muted-foreground">SmartVPS ID</span>
                          <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order.smartvpsServiceId}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderDetails;
