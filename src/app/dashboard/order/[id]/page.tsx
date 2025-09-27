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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

declare global {
  interface Window {
    Razorpay: any;
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
  const [ipStock, setIpStock] = useState<IPStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Service management states
  const [serviceDetails, setServiceDetails] = useState<any | null>(null);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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
      ipStockTags: ipStock?.tags || 'No IPStock data'
    });

    // Primary logic: Check if order has hostycare service ID
    if (order.hostycareServiceId) {
      console.log('[ORDER-DETAILS] Detected Hostycare via serviceId');
      return 'hostycare';
    }

    // Secondary logic: Check if ipStock has smartvps tag
    if (ipStock && ipStock.tags && ipStock.tags.includes('smartvps')) {
      console.log('[ORDER-DETAILS] Detected SmartVPS via ipStock tags');
      return 'smartvps';
    }

    // Fallback: Check explicit provider field


    // Additional fallback: Check smartvps service ID
    if (order.smartvpsServiceId) {
      console.log('[ORDER-DETAILS] Detected SmartVPS via serviceId');
      return 'smartvps';
    }

    // Final fallback: Check product name patterns for SmartVPS
    if (order.productName.includes('103.195') ||
      order.ipAddress?.startsWith('103.195') ||
      order.productName.includes('🏅')) {
      console.log('[ORDER-DETAILS] Detected SmartVPS via patterns');
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

  // ... existing imports and code ...

  const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string, order?: Order) => {
    if (actionBusy) {
      const actionLabels = {
        'restart': { label: 'Restarting', icon: RefreshCw, color: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' },
        'start': { label: 'Starting', icon: Loader2, color: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' },
        'stop': { label: 'Stopping', icon: Loader2, color: 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800' },
        'renew': { label: 'Renewing', icon: Loader2, color: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' },
        'reinstall': { label: 'Reinstalling', icon: Loader2, color: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
        'format': { label: 'Formatting', icon: Loader2, color: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
        'changepassword': { label: 'Changing Password', icon: Loader2, color: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' }
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

    if (status.toLowerCase() === 'completed') {
      return (
        <Badge className="bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
          Active
        </Badge>
      );
    }

    const currentStatus = provisioningStatus || status;

    // 🆕 Check for configuration errors first
    if (order?.provisioningError &&
      (order.provisioningError.includes('Missing hostycareProductId') ||
        order.provisioningError.includes('CONFIG:') ||
        order.provisioningError.includes('Memory configuration not found') ||
        order.provisioningError.includes('lacks hostycareProductId'))) {
      return (
        <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <Settings2 className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    }

    switch (currentStatus.toLowerCase()) {
      case 'active':
        return (
          <Badge className="bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            Active
          </Badge>
        );
      case 'pending':
      case 'confirmed':
        return (
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
            <Clock className="w-3 h-3 mr-1" />
            Pending Setup
          </Badge>
        );
      case 'provisioning':
        return (
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Provisioning
          </Badge>
        );
      case 'suspended':
        return (
          <Badge className="bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Suspended
          </Badge>
        );
      case 'failed':
        // Double-check for config errors even in failed status
        if (order?.provisioningError && order.provisioningError.includes('CONFIG:')) {
          return (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
              <Settings2 className="w-3 h-3 mr-1" />
              Awaiting Config
            </Badge>
          );
        }
        return (
          <Badge className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'terminated':
        return (
          <Badge className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Terminated
          </Badge>
        );
      default:
        // Enhanced default case
        const isManualOrder = !lastAction || lastAction.includes('manual');
        if (isManualOrder || currentStatus.toLowerCase() === 'confirmed') {
          return (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
              <Clock className="w-3 h-3 mr-1" />
              Awaiting Setup
            </Badge>
          );
        }

        return (
          <Badge variant="secondary" className="bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-300">
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
        {/* Mobile-optimized Header */}
        <div className='sticky top-16 lg:top-0 z-40 bg-background/95 backdrop-blur-sm shadow-sm border-b border-border'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 max-w-7xl mx-auto'>
            <div className='flex items-start sm:items-center gap-3'>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/dashboard/viewLinux')}
                className="hover:bg-muted rounded-full flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className='flex items-start sm:items-center gap-3 min-w-0 flex-1'>
                <OSIcon os={order.os} className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <h1 className='text-lg sm:text-xl font-bold break-words'>
                    {styleText(order.productName)}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {getProviderDisplayName(provider)}
                    </Badge>
                    {getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* {isRenewalEligible(order) && (
                <Button
                  onClick={handleRenewService}
                  disabled={actionBusy === 'renew'}
                  size="sm"
                  className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg"
                >
                  {actionBusy === 'renew' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Renew</span>
                </Button>
              )} */}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={fetchOrder}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        <div className='max-w-7xl mx-auto p-4 lg:p-6'>
          {/* Check if service is expired */}
          {isExpired(order) ? (
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
                <Card className="shadow-lg border-0 bg-card">
                  <CardHeader className="pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                        <Server className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                        Server Overview
                      </CardTitle>
                      <Badge variant="outline" className="text-xs self-start sm:self-auto">
                        Created {order.createdAt ? formatDate(order.createdAt) : 'Unknown'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                      <div className="p-3 lg:p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-xl border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 lg:gap-3">
                          <div className="p-1.5 lg:p-2 bg-blue-500 rounded-lg flex-shrink-0">
                            <Terminal className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Operating System</p>
                            <p className="font-semibold text-blue-900 dark:text-blue-100 text-sm lg:text-base break-words">{order.os}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 lg:p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-xl border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-2 lg:gap-3">
                          <div className="p-1.5 lg:p-2 bg-purple-500 rounded-lg flex-shrink-0">
                            <MemoryStick className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Memory</p>
                            <p className="font-semibold text-purple-900 dark:text-purple-100 text-sm lg:text-base break-words">{order.memory}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 lg:p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-xl border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 lg:gap-3">
                          <div className="p-1.5 lg:p-2 bg-green-500 rounded-lg flex-shrink-0">
                            <Activity className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Status</p>
                            <p className="font-semibold text-green-900 dark:text-green-100 text-sm lg:text-base capitalize break-words">
                              {getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 lg:p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 rounded-xl border border-orange-200 dark:border-orange-800">
                        <div className="flex items-center gap-2 lg:gap-3">
                          <div className="p-1.5 lg:p-2 bg-orange-500 rounded-lg flex-shrink-0">
                            <Database className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">Provider</p>
                            <p className="font-semibold text-orange-900 dark:text-orange-100 text-sm lg:text-base capitalize">
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
                  <Card className="shadow-lg border-0 bg-card">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                        <Network className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                        Connection Details
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Use these credentials to connect to your server
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* IP Address */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <Globe className="h-4 w-4 text-blue-600 flex-shrink-0" />
                          Server IP Address
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={order.ipAddress}
                            className="font-mono bg-muted border-border text-sm min-w-0"
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
                          <User className="h-4 w-4 text-green-600 flex-shrink-0" />
                          Username
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={order.username}
                            className="font-mono bg-muted border-border text-sm min-w-0"
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
                          <Lock className="h-4 w-4 text-red-600 flex-shrink-0" />
                          Password
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            type={showPassword ? "text" : "password"}
                            value={order.password || ''}
                            className="font-mono bg-muted border-border text-sm min-w-0"
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
                          <div className="p-3 lg:p-4 bg-gray-900 dark:bg-gray-950 rounded-xl border">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 bg-red-500 rounded-full"></div>
                                <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 bg-yellow-500 rounded-full"></div>
                                <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 bg-green-500 rounded-full"></div>
                                <span className="text-gray-400 text-xs lg:text-sm ml-2">Terminal</span>
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
                            <div className="overflow-x-auto">
                              <code className="text-green-300 font-mono text-xs lg:text-sm whitespace-nowrap">
                                ssh {order.username}@{order.ipAddress}
                              </code>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shadow-lg border-0 bg-card">
                    <CardContent className="text-center py-8 lg:py-12">
                      <div className="w-12 h-12 lg:w-16 lg:h-16 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="h-6 w-6 lg:h-8 lg:w-8 text-amber-600" />
                      </div>
                      <h3 className="text-lg lg:text-xl font-semibold mb-2">Server Setup in Progress</h3>
                      <p className="text-muted-foreground mb-4 text-sm lg:text-base px-4">
                        Your server is being configured. Connection details will appear here once ready.
                      </p>
                      <div className="inline-flex items-center gap-2 text-xs lg:text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full">
                        <Clock className="h-4 w-4" />
                        Estimated setup time: 5-10 minutes
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Activity */}
                {(order.lastAction || order.lastActionTime) && (
                  <Card className="shadow-lg border-0 bg-card">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                        <Activity className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-xl border border-blue-200 dark:border-blue-800">
                        <div className="w-10 h-10 lg:w-12 lg:h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                          {order.lastAction === 'start' && <Play className="h-5 w-5 lg:h-6 lg:w-6 text-white" />}
                          {order.lastAction === 'stop' && <Square className="h-5 w-5 lg:h-6 lg:w-6 text-white" />}
                          {order.lastAction === 'restart' && <RotateCcw className="h-5 w-5 lg:h-6 lg:w-6 text-white" />}
                          {order.lastAction === 'renew' && <CreditCard className="h-5 w-5 lg:h-6 lg:w-6 text-white" />}
                          {order.lastAction === 'changepassword' && <KeyRound className="h-5 w-5 lg:h-6 lg:w-6 text-white" />}
                          {order.lastAction === 'reinstall' && <HardDriveIcon className="h-5 w-5 lg:h-6 lg:w-6 text-white" />}
                          {order.lastAction === 'format' && <HardDriveIcon className="h-5 w-5 lg:h-6 lg:w-6 text-white" />}
                          {!order.lastAction && <Activity className="h-5 w-5 lg:h-6 lg:w-6 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-blue-900 dark:text-blue-100 text-sm lg:text-lg break-words">
                            {order.lastAction ?
                              `Last action: ${order.lastAction.charAt(0).toUpperCase() + order.lastAction.slice(1)}`
                              : 'Server Activity'
                            }
                          </p>
                          {order.lastActionTime && (
                            <p className="text-blue-600 dark:text-blue-400 text-xs lg:text-sm">
                              {formatDate(order.lastActionTime)}
                            </p>
                          )}
                        </div>
                      </div>
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
                  <Card className="shadow-lg border-0 bg-card">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                        <Settings2 className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                        Server Control
                      </CardTitle>
                      <CardDescription className="text-sm">
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
                          className="h-10 lg:h-12 gap-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-sm lg:text-base"
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
                          className="h-10 lg:h-12 gap-2 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-200 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-300 text-sm lg:text-base"
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
                          onClick={() => runServiceAction('restart')}
                          disabled={!!actionBusy}
                          className="h-10 lg:h-12 gap-2 text-sm lg:text-base"
                        >
                          {actionBusy === 'restart' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        Restart Server
                        </Button>
                      </div>

                      <Separator />

                      {/* Advanced Actions */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-muted-foreground">Advanced Actions</h4>

                        {/* <Button
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
                        className="w-full h-10 lg:h-12 gap-2 hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-200 dark:hover:border-blue-800 hover:text-blue-700 dark:hover:text-blue-300 text-sm lg:text-base"
                      >
                        {actionBusy === 'changepassword' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                        Change Password
                      </Button> */}

                        <Button
                          variant="destructive"
                          size="lg"
                          onClick={() => handleAdvancedAction(provider === 'smartvps' ? 'format' : 'reinstall')}
                          disabled={!!actionBusy}
                          className="w-full h-10 lg:h-12 gap-2 text-sm lg:text-base"
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
                          <h4 className="font-semibold text-sm text-muted-foreground">Service Status</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadServiceDetails}
                            disabled={serviceLoading}
                            className="gap-2 h-8 px-2"
                          >
                            <RefreshCw className={`h-3 w-3 ${serviceLoading ? 'animate-spin' : ''}`} />
                            {serviceLoading ? 'Syncing...' : 'Sync'}
                          </Button>
                        </div>

                        {serviceLoading ? (
                          <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-muted rounded-lg">
                            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                            <span>Syncing server status...</span>
                          </div>
                        ) : serviceDetails ? (
                          <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              Last synced: {order.lastSyncTime ? formatDate(order.lastSyncTime) : 'Never'}
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <p className="text-muted-foreground text-sm p-3 bg-muted rounded-lg">
                            Click Sync to refresh server status
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  /* Show info card when management is not available */
                  <Card className="shadow-lg border-0 bg-card">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                        <Info className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                        Service Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-3 lg:p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 lg:w-10 lg:h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <Database className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1 text-sm lg:text-base">
                              {getProviderDisplayName(provider)} Service
                            </h4>
                            <p className="text-xs lg:text-sm text-blue-700 dark:text-blue-300 mb-2">
                              {provider === 'oceanlinux'
                                ? 'This service is directly managed by OceanLinux. Server management tools are not available through this interface.'
                                : 'This service is offered with a partner provider.'}
                            </p>
                            {order.ipAddress && (
                              <p className="text-xs text-blue-600 dark:text-blue-400">
                                You can still connect to your server using the connection details above.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Billing & Renewal */}
                {order.expiryDate && (
                  <Card className="shadow-lg border-0 bg-card">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                        <Wallet className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                        Billing Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={cn(
                        "p-3 lg:p-4 rounded-xl border",
                        isExpired(order)
                          ? "bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800"
                          : getDaysUntilExpiry(order.expiryDate) <= 7
                            ? "bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800"
                            : "bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800"
                      )}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                          <div>
                            <p className={cn(
                              "font-semibold text-base lg:text-lg",
                              isExpired(order)
                                ? "text-red-700 dark:text-red-300"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-amber-700 dark:text-amber-300"
                                  : "text-blue-700 dark:text-blue-300"
                            )}>
                              {isExpired(order) ? 'Service Expired' : 'Service Expires'}
                            </p>
                            <p className={cn(
                              "text-xs lg:text-sm",
                              isExpired(order)
                                ? "text-red-600 dark:text-red-400"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-blue-600 dark:text-blue-400"
                            )}>
                              {formatDate(order.expiryDate)}
                            </p>
                          </div>
                          <div className="text-center sm:text-right">
                            <p className={cn(
                              "text-2xl lg:text-3xl font-bold",
                              isExpired(order)
                                ? "text-red-700 dark:text-red-300"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-amber-700 dark:text-amber-300"
                                  : "text-blue-700 dark:text-blue-300"
                            )}>
                              {Math.abs(getDaysUntilExpiry(order.expiryDate))}
                            </p>
                            <p className={cn(
                              "text-xs lg:text-sm font-medium",
                              isExpired(order)
                                ? "text-red-600 dark:text-red-400"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-blue-600 dark:text-blue-400"
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
                              "w-full gap-2 h-10 lg:h-12 text-sm lg:text-base",
                              isExpired(order)
                                ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                                : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
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
                        )}

                        {isExpired(order) && isRenewalEligible(order) && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-2 text-center">
                            ⚠️ Service renewal available for up to 7 days after expiry
                          </p>
                        )}
                      </div>

                      {/* Renewal History */}
                      {order.renewalPayments && order.renewalPayments.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="font-semibold text-sm mb-3">Renewal History</h4>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {order.renewalPayments.map((renewal, index) => (
                              <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs p-3 bg-muted rounded-lg">
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
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Service Details */}
                <Card className="shadow-lg border-0 bg-card">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                      <Server className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                      Service Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 lg:space-y-4 text-sm">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                        <span className="text-muted-foreground">Service ID</span>
                        <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">{order._id}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-border">
                        <span className="text-muted-foreground">Price</span>
                        <span className="font-semibold">₹{order.price}</span>
                      </div>
                      {order.ipStockId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                          <span className="text-muted-foreground">IP Stock ID</span>
                          <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">{order.ipStockId}</span>
                        </div>
                      )}
                      {order.lastSyncTime && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                          <span className="text-muted-foreground">Last Sync</span>
                          <span className="text-xs">{formatDate(order.lastSyncTime)}</span>
                        </div>
                      )}
                      {provider === 'hostycare' && order.hostycareServiceId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2">
                          <span className="text-muted-foreground">Hostycare ID</span>
                          <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">{order.hostycareServiceId}</span>
                        </div>
                      )}
                      {provider === 'smartvps' && order.smartvpsServiceId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2">
                          <span className="text-muted-foreground">SmartVPS ID</span>
                          <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">{order.smartvpsServiceId}</span>
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
