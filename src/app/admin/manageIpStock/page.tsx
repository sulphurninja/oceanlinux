'use client';

import { useEffect, useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogHeader,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { X, ExternalLink, Zap, BookOpen, Copy, RefreshCw, Loader2, Cloud, EyeOff, Eye } from 'lucide-react';
import { ResellerZonePicker, buildResellerZoneConfig } from '@/components/admin/ResellerZonePicker';

interface MemoryOptionDetails {
    price: number;
    hostycareProductId?: string;
    hostycareProductName?: string;
}

interface PromoCode {
    code: string;
    discount: number;
    discountType: 'percentage' | 'fixed';
    isActive: boolean;
    createdAt?: string;
}

interface IPStock {
    _id: string;
    name: string;
    description?: string;
    memoryOptions: Record<string, MemoryOptionDetails>;
    available: boolean;
    hiddenFromStore?: boolean;
    availabilityManual?: boolean;
    stockCount?: number;
    serverType: string;
    tags: string[];
    promoCodes: PromoCode[];
    defaultConfigurations?: Record<string, any>;
    company?: string | null;
}

interface CompanyOption {
    _id: string;
    name: string;
    netbayApi?: { enabled?: boolean; useLiveStockApi?: boolean; apiKey?: string; apiSecret?: string } | null;
    resellerApi?: { enabled?: boolean; useLiveStockApi?: boolean } | null;
}

type PanelZone = {
    id: number;
    name: string;
    status: string;
    live: boolean;
};

function readResellerApiConfig(stock: IPStock | null) {
    const cfg: any = stock?.defaultConfigurations?.resellerApi || {};
    const zoneIds = Array.isArray(cfg.zoneIds)
        ? cfg.zoneIds.map(Number).filter((n: number) => Number.isFinite(n))
        : cfg.zoneId != null
        ? [Number(cfg.zoneId)]
        : [];
    return {
        zoneId: zoneIds[0] ?? (cfg.zoneId != null ? Number(cfg.zoneId) : null),
        zoneIds,
        zoneName: cfg.zoneName || '',
        zoneNames: (cfg.zoneNames && typeof cfg.zoneNames === 'object') ? cfg.zoneNames : {},
        planType: cfg.planType || 'SHARED',
        gateway: cfg.gateway || 'WALLET',
        lastStockSync: cfg.lastStockSync || '',
        variantStock: (cfg.variantStock && typeof cfg.variantStock === 'object') ? cfg.variantStock : {},
    };
}

function resellerZoneLabel(stock: IPStock) {
    const cfg = readResellerApiConfig(stock);
    if (cfg.zoneName) return cfg.zoneName;
    if (cfg.zoneId != null) return `Zone ${cfg.zoneId}`;
    return '—';
}

/**
 * Read the Netbay block out of an IPStock's defaultConfigurations.
 * Tolerates both Map (server-shape) and plain-object (client-shape) storage.
 *
 * Shape:
 *   {
 *     groupTag?: string,
 *     planByMemory?: { '4GB': planId, ... },
 *     defaultOs?: { Linux?: 'Ubuntu 22.04', Windows?: 'Windows Server 2022' },
 *   }
 */
function stockHasNetbayConfig(stock: IPStock | null) {
    const cfg = stock?.defaultConfigurations?.netbay;
    return !!(cfg?.planByMemory && Object.values(cfg.planByMemory).some(Boolean));
}

function companyUsesNetbayLiveForStock(stock: IPStock, companies: CompanyOption[]) {
    if (!stock.company || !stockHasNetbayConfig(stock)) return false;
    const c = companies.find((co) => co._id === stock.company);
    return !!(c?.netbayApi?.enabled && c?.netbayApi?.useLiveStockApi);
}

function stockHasResellerPanelConfig(stock: IPStock | null) {
    const cfg = stock?.defaultConfigurations?.resellerApi;
    if (cfg && typeof cfg === 'object') return true;
    const tags = (stock?.tags || []).map((t) => String(t).toLowerCase());
    return tags.includes('reseller-api') || tags.includes('primevps') || tags.includes('primevm');
}

function companyUsesResellerLiveForStock(stock: IPStock, companies: CompanyOption[]) {
    if (!stock.company || !stockHasResellerPanelConfig(stock)) return false;
    const c = companies.find((co) => co._id === stock.company);
    return !!(c?.resellerApi?.enabled && c?.resellerApi?.useLiveStockApi);
}

function isStockOutOfStock(stock: IPStock, companies: CompanyOption[]): boolean {
    if (companyUsesNetbayLiveForStock(stock, companies)) return !stock.available;
    if (companyUsesResellerLiveForStock(stock, companies)) return !stock.available;
    if (stock.company) return (stock.stockCount ?? 0) <= 0;
    return !stock.available;
}

function readNetbayConfig(stock: IPStock | null): {
    groupTag: string;
    planByMemory: Record<string, string>;
    defaultOs: { Linux?: string; Windows?: string };
} {
    const cfg: any = stock?.defaultConfigurations?.netbay || {};
    const planByMemory = (cfg?.planByMemory && typeof cfg.planByMemory === 'object') ? { ...cfg.planByMemory } : {};
    const defaultOs = (cfg?.defaultOs && typeof cfg.defaultOs === 'object') ? { ...cfg.defaultOs } : {};
    return {
        groupTag: cfg?.groupTag || '',
        planByMemory,
        defaultOs,
    };
}

const ManageIpStock = () => {
    const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
    const [currentStock, setCurrentStock] = useState<IPStock | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newPromoCode, setNewPromoCode] = useState('');
    const [newPromoDiscount, setNewPromoDiscount] = useState('');
    const [newPromoDiscountType, setNewPromoDiscountType] = useState<'percentage' | 'fixed'>('fixed');
    const [newTag, setNewTag] = useState('');
    const [newMemorySize, setNewMemorySize] = useState('');
    const [newMemoryPrice, setNewMemoryPrice] = useState('');
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [cloneSource, setCloneSource] = useState<IPStock | null>(null);
    const [cloneName, setCloneName] = useState('');
    const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
    const [cloning, setCloning] = useState(false);
    const [panelZones, setPanelZones] = useState<PanelZone[]>([]);
    const [panelZonesLoading, setPanelZonesLoading] = useState(false);
    const [refreshingLiveStock, setRefreshingLiveStock] = useState(false);
    const [hideOutDialogOpen, setHideOutDialogOpen] = useState(false);
    const [unhideOutDialogOpen, setUnhideOutDialogOpen] = useState(false);
    const [hidingOutOfStock, setHidingOutOfStock] = useState(false);
    const [unhidingOutOfStock, setUnhidingOutOfStock] = useState(false);

    const outOfStockVisibleCount = ipStocks.filter(
        (stock) => !stock.hiddenFromStore && isStockOutOfStock(stock, companies)
    ).length;

    const outOfStockHiddenCount = ipStocks.filter(
        (stock) => !!stock.hiddenFromStore && isStockOutOfStock(stock, companies)
    ).length;

    const reloadIpStocks = async () => {
        const response = await fetch('/api/ipstock?includeHidden=1', { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (Array.isArray(data)) setIpStocks(data);
    };

    useEffect(() => {
        reloadIpStocks();
        fetch('/api/admin/companies')
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setCompanies(data); })
            .catch(() => {});
    }, []);

    const fetchPanelZones = async (companyId: string, silent = false) => {
        if (!companyId) return;
        setPanelZonesLoading(true);
        try {
            const r = await fetch(
                `/api/reseller-panel/zones?companyId=${encodeURIComponent(companyId)}`,
                { credentials: 'include', cache: 'no-store' }
            );
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || 'Failed to fetch zones');
            setPanelZones(Array.isArray(j.zones) ? j.zones : []);
            if (!silent) toast.success(`${j.zones?.length || 0} region(s) loaded`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Zone fetch failed';
            if (!silent) toast.error(msg);
            setPanelZones([]);
        } finally {
            setPanelZonesLoading(false);
        }
    };

    const refreshLivePanelStock = async () => {
        setRefreshingLiveStock(true);
        try {
            const r = await fetch('/api/admin/reseller-panel/refresh-stock', { credentials: 'include', cache: 'no-store' });
            const j = await r.json();
            if (!r.ok && !j.skipped) throw new Error(j.error || 'Refresh failed');
            await reloadIpStocks();
            toast.success(
                j.throttled
                    ? 'Stock recently synced — list refreshed'
                    : `Panel stock synced (${j.inStock ?? 0}/${j.total ?? 0} in stock)`
            );
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Refresh failed');
        } finally {
            setRefreshingLiveStock(false);
        }
    };

    const hideAllOutOfStock = async () => {
        setHidingOutOfStock(true);
        try {
            const r = await fetch('/api/ipstock/hide-out-of-stock', {
                method: 'POST',
                credentials: 'include',
            });
            const j = await r.json();
            if (!r.ok || !j.success) throw new Error(j.error || 'Failed to hide plans');
            await reloadIpStocks();
            setHideOutDialogOpen(false);
            toast.success(
                j.hiddenCount > 0
                    ? `${j.hiddenCount} out-of-stock plan(s) hidden from store`
                    : 'No visible out-of-stock plans to hide'
            );
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to hide out-of-stock plans');
        } finally {
            setHidingOutOfStock(false);
        }
    };

    const unhideAllOutOfStock = async () => {
        setUnhidingOutOfStock(true);
        try {
            const r = await fetch('/api/ipstock/unhide-out-of-stock', {
                method: 'POST',
                credentials: 'include',
            });
            const j = await r.json();
            if (!r.ok || !j.success) throw new Error(j.error || 'Failed to unhide plans');
            await reloadIpStocks();
            setUnhideOutDialogOpen(false);
            toast.success(
                j.unhiddenCount > 0
                    ? `${j.unhiddenCount} out-of-stock plan(s) visible on store (still out of stock)`
                    : 'No hidden out-of-stock plans to show'
            );
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to unhide out-of-stock plans');
        } finally {
            setUnhidingOutOfStock(false);
        }
    };

    const addMemoryOption = () => {
        if (!currentStock || !newMemorySize.trim()) return;
        const size = newMemorySize.trim().toUpperCase();
        if (currentStock.memoryOptions[size]) {
            toast.error(`${size} already exists`);
            return;
        }
        setCurrentStock({
            ...currentStock,
            memoryOptions: {
                ...currentStock.memoryOptions,
                [size]: { price: parseFloat(newMemoryPrice) || 0 },
            },
        });
        setNewMemorySize('');
        setNewMemoryPrice('');
    };

    const removeMemoryOption = (size: string) => {
        if (!currentStock) return;
        const updated = { ...currentStock.memoryOptions };
        delete updated[size];
        setCurrentStock({ ...currentStock, memoryOptions: updated });
    };

    const addTag = () => {
        if (currentStock && newTag.trim() && !currentStock.tags.includes(newTag.trim().toLowerCase())) {
            setCurrentStock({
                ...currentStock,
                tags: [...currentStock.tags, newTag.trim().toLowerCase()]
            });
            setNewTag('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        if (currentStock) {
            setCurrentStock({
                ...currentStock,
                tags: currentStock.tags.filter(tag => tag !== tagToRemove)
            });
        }
    };

    const handleEdit = (stock: IPStock) => {
        setCurrentStock({
            ...stock,
            hiddenFromStore: stock.hiddenFromStore === true,
        });
        setPanelZones([]);
        setIsDialogOpen(true);
        if (stock.company && stockHasResellerPanelConfig(stock)) {
            const c = companies.find((co) => co._id === stock.company);
            if (c?.resellerApi?.enabled) {
                void fetchPanelZones(stock.company, true);
            }
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/ipstock/update`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _id: id })
            });
            setIpStocks(prev => prev.filter(stock => stock._id !== id));
            toast.success('IP Stock deleted successfully!');
        } catch (error) {
            toast.error('Failed to delete IP stock');
        }
    };

    const openCloneDialog = (stock: IPStock) => {
        setCloneSource(stock);
        setCloneName(`${stock.name} (Copy)`);
        setIsCloneDialogOpen(true);
    };

    const handleClone = async () => {
        if (!cloneSource || !cloneName.trim()) {
            toast.error('Enter a name for the clone');
            return;
        }
        setCloning(true);
        try {
            const response = await fetch('/api/ipstock/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    sourceId: cloneSource._id,
                    name: cloneName.trim(),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.message || 'Failed to clone IP stock');
            }

            const listRes = await fetch('/api/ipstock?includeHidden=1', { credentials: 'include' });
            const list = await listRes.json();
            if (Array.isArray(list)) {
                setIpStocks(list);
            } else {
                setIpStocks(prev => [...prev, data]);
            }

            toast.success('IP Stock cloned — update group tag / name if needed');
            setIsCloneDialogOpen(false);
            setCloneSource(null);
            setCloneName('');

            if (data?._id) {
                handleEdit({
                    ...data,
                    hiddenFromStore: data.hiddenFromStore === true,
                });
            }
        } catch (error: any) {
            toast.error(error?.message || 'Failed to clone IP stock');
        } finally {
            setCloning(false);
        }
    };

    const handleUpdate = async () => {
        if (!currentStock) return;
        const resellerCfg = readResellerApiConfig(currentStock);
        const editCompany = currentStock.company
            ? companies.find((co) => co._id === currentStock.company)
            : null;
        const companyHasResellerApi = !!(editCompany?.resellerApi?.enabled);
        const companyUsesResellerLiveStock = !!(
            editCompany?.resellerApi?.enabled && editCompany?.resellerApi?.useLiveStockApi
        );
        const liveResellerStock =
            companyUsesResellerLiveStock && stockHasResellerPanelConfig(currentStock);
        if (companyHasResellerApi && stockHasResellerPanelConfig(currentStock) && resellerCfg.zoneId == null) {
            toast.error('Sync regions karo aur panel se zone select karo');
            return;
        }
        try {
            const payload = {
                _id: currentStock._id,
                name: currentStock.name,
                description: currentStock.description,
                available: currentStock.available,
                availabilityManual: liveResellerStock ? false : currentStock.availabilityManual,
                serverType: currentStock.serverType,
                tags: currentStock.tags,
                memoryOptions: currentStock.memoryOptions,
                promoCodes: currentStock.promoCodes,
                defaultConfigurations: currentStock.defaultConfigurations,
                company: currentStock.company ?? null,
                stockCount: liveResellerStock ? 1 : currentStock.stockCount,
                hiddenFromStore: currentStock.hiddenFromStore === true,
            };

            const response = await fetch(`/api/ipstock/update`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || 'Failed to update IP stock');
            }

            const updated = await response.json();
            if ('hiddenFromStore' in payload && updated?.hiddenFromStore !== payload.hiddenFromStore) {
                throw new Error('Hide setting did not save — please try again');
            }

            const listRes = await fetch('/api/ipstock?includeHidden=1', { credentials: 'include' });
            const list = await listRes.json();
            if (Array.isArray(list)) {
                setIpStocks(list);
            } else {
                setIpStocks(prev =>
                    prev.map(stock => stock._id === currentStock._id ? { ...currentStock, ...updated } : stock)
                );
            }

            toast.success('IP Stock updated successfully');
            setIsDialogOpen(false);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update IP stock');
        }
    };

    const handlePriceChange = (size: string, value: string) => {
        if (currentStock) {
            const updatedMemoryOptions = {
                ...currentStock.memoryOptions,
                [size]: {
                    ...currentStock.memoryOptions[size],
                    price: parseFloat(value) || 0
                }
            };
            setCurrentStock({
                ...currentStock,
                memoryOptions: updatedMemoryOptions
            });
        }
    };

    // -------------- Netbay configuration helpers --------------
    const updateNetbayConfig = (
        next: Partial<{ groupTag: string; planByMemory: Record<string, string>; defaultOs: { Linux?: string; Windows?: string } }>
    ) => {
        if (!currentStock) return;
        const existing = readNetbayConfig(currentStock);
        const merged = {
            groupTag: next.groupTag ?? existing.groupTag,
            planByMemory: next.planByMemory ?? existing.planByMemory,
            defaultOs: next.defaultOs ?? existing.defaultOs,
        };
        const isEmpty =
            !merged.groupTag &&
            Object.values(merged.planByMemory || {}).filter(Boolean).length === 0 &&
            !merged.defaultOs?.Linux &&
            !merged.defaultOs?.Windows;
        const nextDefaults = { ...(currentStock.defaultConfigurations || {}) } as Record<string, any>;
        if (isEmpty) {
            delete nextDefaults.netbay;
        } else {
            nextDefaults.netbay = merged;
        }
        setCurrentStock({ ...currentStock, defaultConfigurations: nextDefaults });
    };

    const handleNetbayPlanIdChange = (size: string, value: string) => {
        const cfg = readNetbayConfig(currentStock);
        const next = { ...cfg.planByMemory };
        if (value.trim()) next[size] = value.trim();
        else delete next[size];
        updateNetbayConfig({ planByMemory: next });
    };

    const updateResellerApiConfig = (
        next: Partial<{ zoneId: number | null; zoneName: string; planType: string; gateway: string }>
    ) => {
        if (!currentStock) return;
        const existing = readResellerApiConfig(currentStock);
        const merged = {
            zoneId: next.zoneId !== undefined ? next.zoneId : existing.zoneId,
            zoneName: next.zoneName !== undefined ? next.zoneName : existing.zoneName,
            planType: next.planType ?? existing.planType,
            gateway: next.gateway ?? existing.gateway,
        };
        const prevBlock = (currentStock.defaultConfigurations?.resellerApi || {}) as Record<string, unknown>;
        const nextDefaults = { ...(currentStock.defaultConfigurations || {}) } as Record<string, unknown>;
        nextDefaults.resellerApi = {
            ...prevBlock,
            zoneId: merged.zoneId,
            zoneName: merged.zoneName || undefined,
            planType: merged.planType,
            gateway: merged.gateway,
        };
        const tags = currentStock.tags.includes('reseller-api')
            ? currentStock.tags
            : [...currentStock.tags, 'reseller-api'];
        setCurrentStock({ ...currentStock, defaultConfigurations: nextDefaults, tags });
    };

    const handleResellerZoneIdsChange = (nextZoneIds: number[]) => {
        if (!currentStock) return;
        const existing = readResellerApiConfig(currentStock);
        const prevBlock = (currentStock.defaultConfigurations?.resellerApi || {}) as Record<string, unknown>;
        const nextDefaults = { ...(currentStock.defaultConfigurations || {}) } as Record<string, unknown>;
        const zoneBlock = buildResellerZoneConfig(panelZones, nextZoneIds);

        nextDefaults.resellerApi = {
            ...prevBlock,
            ...zoneBlock,
            planType: existing.planType,
            gateway: existing.gateway,
        };

        const tags = currentStock.tags.includes('reseller-api')
            ? currentStock.tags
            : [...currentStock.tags, 'reseller-api'];

        const primaryZone = panelZones.find((z) => Number(z.id) === Number(nextZoneIds[0]));
        const nextName =
            primaryZone?.name && !currentStock.name.trim() ? `${primaryZone.name} VPS` : currentStock.name;

        setCurrentStock({
            ...currentStock,
            name: nextName,
            defaultConfigurations: nextDefaults,
            tags,
        });
    };

    const selectedCompanyHasResellerApi = (() => {
        if (!currentStock?.company) return false;
        const c = companies.find((co) => co._id === currentStock.company);
        return !!(c?.resellerApi?.enabled);
    })();

    const selectedCompanyUsesResellerLiveStock = (() => {
        if (!currentStock?.company) return false;
        const c = companies.find((co) => co._id === currentStock.company);
        return !!(c?.resellerApi?.enabled && c?.resellerApi?.useLiveStockApi);
    })();

    const selectedResellerZoneIds = currentStock ? readResellerApiConfig(currentStock).zoneIds : [];

    const selectedCompanyHasNetbay = (() => {
        if (!currentStock?.company) return false;
        const c = companies.find((co) => co._id === currentStock.company);
        return !!(c?.netbayApi?.enabled);
    })();

    const selectedCompanyUsesNetbayLiveStock = (() => {
        if (!currentStock?.company) return false;
        const c = companies.find((co) => co._id === currentStock.company);
        return !!(c?.netbayApi?.enabled && c?.netbayApi?.useLiveStockApi);
    })();

    const handleHostycareProductIdChange = (size: string, value: string) => {
        if (currentStock) {
            const updatedMemoryOptions = {
                ...currentStock.memoryOptions,
                [size]: {
                    ...currentStock.memoryOptions[size],
                    hostycareProductId: value,
                    hostycareProductName: value ? `${currentStock.name} ${size}` : undefined
                }
            };
            setCurrentStock({
                ...currentStock,
                memoryOptions: updatedMemoryOptions
            });
        }
    };

    const handleAvailableChange = (value: string) => {
        if (currentStock) {
            setCurrentStock({
                ...currentStock,
                available: value === "true",
                availabilityManual: true,
            });
        }
    };

    const addPromoCode = () => {
        if (currentStock && newPromoCode && newPromoDiscount) {
            const discount = parseFloat(newPromoDiscount);
            if (discount >= 0) {
                if (newPromoDiscountType === 'percentage' && discount > 100) {
                    toast.error('Percentage discount cannot exceed 100%');
                    return;
                }

                const updatedPromoCodes = [...(currentStock.promoCodes || []), {
                    code: newPromoCode.toUpperCase(),
                    discount,
                    discountType: newPromoDiscountType,
                    isActive: true
                }];
                setCurrentStock({
                    ...currentStock,
                    promoCodes: updatedPromoCodes
                });
                setNewPromoCode('');
                setNewPromoDiscount('');
            } else {
                toast.error('Discount must be a positive number');
            }
        }
    };

    const removePromoCode = (index: number) => {
        if (currentStock) {
            const updatedPromoCodes = currentStock.promoCodes.filter((_, i) => i !== index);
            setCurrentStock({
                ...currentStock,
                promoCodes: updatedPromoCodes
            });
        }
    };

    const togglePromoCodeActive = (index: number) => {
        if (currentStock) {
            const updatedPromoCodes = currentStock.promoCodes.map((promo, i) =>
                i === index ? { ...promo, isActive: !promo.isActive } : promo
            );
            setCurrentStock({
                ...currentStock,
                promoCodes: updatedPromoCodes
            });
        }
    };

    const getHostycareStatus = (memoryOptions: Record<string, MemoryOptionDetails>) => {
        const totalConfigs = Object.keys(memoryOptions).length;
        const configuredCount = Object.values(memoryOptions).filter(option => option.hostycareProductId).length;

        if (configuredCount === 0) {
            return <Badge variant="destructive">No Auto-Provision</Badge>;
        } else if (configuredCount === totalConfigs) {
            return <Badge className="bg-green-50 text-green-700 border dark:border-none-green-200">Full Auto-Provision</Badge>;
        } else {
            return <Badge className="bg-orange-50 text-orange-700 border dark:border-none-orange-200">Partial Auto-Provision</Badge>;
        }
    };

    return (
        <div className='w-full'>
            <div className='h-[63px] flex gap-2 items-center justify-between border dark:border-none-b p-4'>
                <h1 className='text-xl'>Manage IP Stock</h1>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setUnhideOutDialogOpen(true)}
                        disabled={outOfStockHiddenCount === 0 || unhidingOutOfStock}
                    >
                        <Eye className="h-4 w-4" />
                        Show out of stock ({outOfStockHiddenCount})
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setHideOutDialogOpen(true)}
                        disabled={outOfStockVisibleCount === 0 || hidingOutOfStock}
                    >
                        <EyeOff className="h-4 w-4" />
                        Hide out of stock ({outOfStockVisibleCount})
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => void refreshLivePanelStock()}
                        disabled={refreshingLiveStock}
                    >
                        {refreshingLiveStock ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                        Sync PrimeVPS stock
                    </Button>
                </div>
            </div>
            <div className='mx-12 mt-6'>
                <Table className='w-full border dark:border-none'>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Region</TableHead>
                            <TableHead>Available</TableHead>
                            <TableHead>Store</TableHead>
                            <TableHead>4 GB</TableHead>
                            <TableHead>8 GB</TableHead>
                            <TableHead>16 GB</TableHead>
                            <TableHead>Auto-Provision</TableHead>
                            <TableHead>Promo Codes</TableHead>
                            <TableHead>Edit</TableHead>
                            <TableHead>Clone</TableHead>
                            <TableHead>Delete</TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {ipStocks.map(stock => (
                            <TableRow key={stock._id}>
                                <TableCell>
                                    <div>
                                        <div className="font-medium">{stock.name}</div>
                                        {stock.description && (
                                            <div className="text-sm text-gray-500 max-w-xs truncate">
                                                {stock.description}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={stock.serverType === 'VPS' ? 'default' : 'secondary'}>
                                        {stock.serverType}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {stockHasResellerPanelConfig(stock) ? (
                                        <span className="text-xs">
                                            {resellerZoneLabel(stock)}
                                            {readResellerApiConfig(stock).zoneId != null && (
                                                <span className="text-muted-foreground"> (ID {readResellerApiConfig(stock).zoneId})</span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {companyUsesNetbayLiveForStock(stock, companies)
                                        ? (stock.available ? 'Netbay API: Yes' : 'Netbay API: No')
                                        : companyUsesResellerLiveForStock(stock, companies)
                                        ? (
                                            <span className="text-xs">
                                                {stock.available ? (
                                                    <Badge className="bg-sky-50 text-sky-700 border-sky-200">Panel: In stock</Badge>
                                                ) : (
                                                    <Badge variant="destructive">Panel: Out</Badge>
                                                )}
                                            </span>
                                        )
                                        : stock.company
                                        ? `${stock.stockCount ?? 0} units`
                                        : (
                                            <span className="inline-flex items-center gap-1">
                                              {stock.available ? 'Yes' : 'No'}
                                              {stock.availabilityManual && (
                                                <Badge variant="outline" className="text-[10px] h-5">Manual</Badge>
                                              )}
                                            </span>
                                          )}
                                </TableCell>
                                <TableCell>
                                    {stock.hiddenFromStore ? (
                                        <Badge variant="secondary">Hidden</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-green-700 border-green-200">Visible</Badge>
                                    )}
                                </TableCell>
                                {Object.entries(stock.memoryOptions).map(([memory, details]) => (
                                    <TableCell key={memory}>
                                        <div>
                                            <div className="font-medium">₹{details.price}</div>
                                            {details.hostycareProductId && (
                                                <div className="text-xs text-blue-600 flex items-center gap-1">
                                                    <ExternalLink className="w-3 h-3" />
                                                    ID: {details.hostycareProductId}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                ))}

                                <TableCell>
                                    {getHostycareStatus(stock.memoryOptions)}
                                </TableCell>

                                <TableCell>
                                    {stock.promoCodes?.length > 0 ? (
                                        <div className="text-xs">
                                            {stock.promoCodes.slice(0, 2).map((promo, idx) => (
                                                <div key={idx}>
                                                    {promo.code} ({promo.discountType === 'fixed' ? `₹${promo.discount}` : `${promo.discount}%`})
                                                </div>
                                            ))}
                                            {stock.promoCodes.length > 2 && (
                                                <div>+{stock.promoCodes.length - 2} more</div>
                                            )}
                                        </div>
                                    ) : (
                                        'No promo codes'
                                    )}
                                </TableCell>

                                <TableCell>
                                    <Button onClick={() => handleEdit(stock)}>Edit</Button>
                                </TableCell>
                                <TableCell>
                                    <Button variant="outline" onClick={() => openCloneDialog(stock)} className="gap-1.5">
                                        <Copy className="h-3.5 w-3.5" />
                                        Clone
                                    </Button>
                                </TableCell>
                                <TableCell>
                                    <Button onClick={() => handleDelete(stock._id)}>Delete</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {isDialogOpen && currentStock && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Edit IP Stock</DialogTitle>
                            </DialogHeader>
                            <DialogDescription>
                                Update the details of the IP stock and Hostycare integration.
                            </DialogDescription>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Name:</Label>
                                        <Input
                                            value={currentStock.name}
                                            onChange={(e) => setCurrentStock({ ...currentStock, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        {currentStock.company && stockHasNetbayConfig(currentStock) && selectedCompanyUsesNetbayLiveStock ? (
                                            <div className="rounded-lg border dark:border-none p-3 bg-muted/30 space-y-1">
                                                <Label>Availability</Label>
                                                <p className="text-sm font-medium">
                                                    {currentStock.available ? 'In stock (Netbay API)' : 'Out of stock (Netbay API)'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Auto-synced from Netbay GET /services/stock. Toggle live stock in{' '}
                                                    <Link href="/admin/companies" className="text-blue-600 hover:underline">/admin/companies</Link>.
                                                </p>
                                            </div>
                                        ) : currentStock.company && stockHasResellerPanelConfig(currentStock) && selectedCompanyUsesResellerLiveStock ? (
                                            <div className="rounded-lg border p-3 bg-sky-50/50 dark:bg-sky-950/20 border-sky-200/60 space-y-1">
                                                <Label>Availability</Label>
                                                <p className="text-sm font-medium">
                                                    {currentStock.available ? 'In stock (panel zone)' : 'Out of stock (panel zone)'}
                                                </p>
                                                {resellerCfgForDialog?.zoneName && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Region: <strong>{resellerCfgForDialog.zoneName}</strong>
                                                        {resellerCfgForDialog.zoneId != null ? ` (ID ${resellerCfgForDialog.zoneId})` : ''}
                                                    </p>
                                                )}
                                                {resellerCfgForDialog?.lastStockSync && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Last sync: {new Date(resellerCfgForDialog.lastStockSync).toLocaleString()}
                                                    </p>
                                                )}
                                                <p className="text-xs text-muted-foreground">
                                                    Auto-synced from primevm GET /api/users/zones. Use <strong>Sync PrimeVPS stock</strong> above or customer page refresh.
                                                </p>
                                            </div>
                                        ) : currentStock.company ? (
                                            <>
                                                <Label>Stock Count (orderable units):</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={currentStock.stockCount ?? 0}
                                                    onChange={(e) => {
                                                        const stockCount = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                                        setCurrentStock({
                                                            ...currentStock,
                                                            stockCount,
                                                            available: stockCount > 0,
                                                        });
                                                    }}
                                                />
                                                {stockHasNetbayConfig(currentStock) && selectedCompanyHasNetbay && !selectedCompanyUsesNetbayLiveStock && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        NetBay manual stock mode — set units here or via company Stocks dialog.
                                                        Enable live API stock in /admin/companies → Netbay when NetBay fixes their stock endpoint.
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <Label>Available:</Label>
                                                <select
                                                    className='flex h-10 w-full items-center justify-between rounded-md border dark:border-none border dark:border-none-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1'
                                                    value={currentStock.available.toString()}
                                                    onChange={(e) => handleAvailableChange(e.target.value)}
                                                >
                                                    <option value="true">Yes</option>
                                                    <option value="false">No</option>
                                                </select>
                                                {(/^⚡|^🌊/.test(currentStock.name)) && (
                                                  <label className="flex items-center gap-2 mt-2 text-sm text-muted-foreground cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      checked={!currentStock.availabilityManual}
                                                      onChange={(e) => setCurrentStock({
                                                        ...currentStock,
                                                        availabilityManual: !e.target.checked,
                                                      })}
                                                    />
                                                    Auto-sync availability from provider API (ADVPS/SmartVPS)
                                                  </label>
                                                )}
                                                {currentStock.availabilityManual && (
                                                  <p className="text-xs text-amber-600 mt-1">
                                                    Manual lock on — user page refresh will not change Available.
                                                  </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <Label>Description:</Label>
                                    <textarea
                                        className="flex min-h-[80px] w-full rounded-md border dark:border-none border dark:border-none-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        value={currentStock.description || ''}
                                        onChange={(e) => setCurrentStock({ ...currentStock, description: e.target.value })}
                                        placeholder="Server description..."
                                    />
                                </div>

                                <div className="flex items-center justify-between rounded-lg border dark:border-none p-4">
                                    <div className="space-y-1 pr-4">
                                        <Label>Hide from customer store</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Hidden plans won&apos;t appear on the user dashboard or store. Existing orders still work.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={!!currentStock.hiddenFromStore}
                                        onCheckedChange={(checked) =>
                                            setCurrentStock({ ...currentStock, hiddenFromStore: checked })
                                        }
                                    />
                                </div>

                                <div>
                                    <Label>Server Type:</Label>
                                    <Select value={currentStock.serverType} onValueChange={(value) => setCurrentStock({ ...currentStock, serverType: value })}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Linux">Linux</SelectItem>
                                            <SelectItem value="VPS">VPS</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label>Company (optional):</Label>
                                    <Select
                                        value={currentStock.company || 'none'}
                                        onValueChange={(value) => {
                                            const company = value === 'none' ? null : value;
                                            setCurrentStock({
                                                ...currentStock,
                                                company,
                                                stockCount: company ? (currentStock.stockCount ?? 0) : currentStock.stockCount,
                                                available: company ? (currentStock.stockCount ?? 0) > 0 : currentStock.available,
                                            });
                                            setPanelZones([]);
                                            if (company) {
                                                const c = companies.find((co) => co._id === company);
                                                if (c?.resellerApi?.enabled) {
                                                    void fetchPanelZones(company, true);
                                                }
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="No company" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No company</SelectItem>
                                            {companies.map(c => (
                                                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        PrimeVPS: company select → Sync regions → zone pick. Netbay: plan IDs neeche.
                                    </p>
                                </div>

                                {selectedCompanyUsesResellerLiveStock && stockHasResellerPanelConfig(currentStock) && (
                                    <div className="rounded-md border border-emerald-200/80 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                                        <strong>Live stock ON</strong> — manual stock count ki zaroorat nahi. Availability panel zone se auto sync hogi.
                                    </div>
                                )}

                                {/* Memory Options and Hostycare Mapping */}
                                <div>
                                    <Label className="text-base font-semibold">Memory Configuration & Hostycare Mapping:</Label>
                                    <div className="bg--50 p-4 rounded-lg border dark:border-none space-y-4">
                                        {Object.keys(currentStock.memoryOptions).map((size) => (
                                            <div key={size} className="border dark:border-none-b pb-3 last:border dark:border-none-b-0 last:pb-0">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-medium">{size} Configuration</h4>
                                                    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => removeMemoryOption(size)}>
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <Label className="text-sm">{size} Price (₹):</Label>
                                                        <Input
                                                            type="number"
                                                            value={currentStock.memoryOptions[size].price}
                                                            onChange={(e) => handlePriceChange(size, e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-sm">Hostycare Product ID:</Label>
                                                        <Input
                                                            type="text"
                                                            placeholder="e.g., 1, 2, 3"
                                                            value={currentStock.memoryOptions[size].hostycareProductId || ''}
                                                            onChange={(e) => handleHostycareProductIdChange(size, e.target.value)}
                                                        />
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            Leave empty to disable auto-provisioning for this size
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Add new memory option */}
                                        <div className="border-t pt-3">
                                            <h4 className="font-medium mb-2 text-sm">Add Memory Option</h4>
                                            <div className="flex gap-2 items-end">
                                                <div className="flex-1">
                                                    <Label className="text-xs">Size</Label>
                                                    <Select value={newMemorySize} onValueChange={setNewMemorySize}>
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue placeholder="Select RAM" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {['1GB', '2GB', '4GB', '6GB', '8GB', '12GB', '16GB', '32GB'].filter(s => !currentStock.memoryOptions[s]).map(s => (
                                                                <SelectItem key={s} value={s}>{s}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex-1">
                                                    <Label className="text-xs">Price (₹)</Label>
                                                    <Input type="number" placeholder="e.g. 699" value={newMemoryPrice} onChange={(e) => setNewMemoryPrice(e.target.value)} className="h-9" />
                                                </div>
                                                <Button type="button" size="sm" className="h-9" onClick={addMemoryOption} disabled={!newMemorySize}>
                                                    Add
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Netbay Configuration — only meaningful when the IP stock is
                                    linked to a company that has Netbay enabled. The block stores
                                    its settings in defaultConfigurations.netbay, where the auto
                                    provisioner reads them from. */}
                                {selectedCompanyHasNetbay && (
                                    <div className="border rounded-lg p-4 bg-amber-50/40 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-900/40 space-y-3">
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div>
                                                <Label className="text-base font-semibold flex items-center gap-2">
                                                    <Zap className="h-4 w-4 text-amber-600" />
                                                    Netbay Configuration
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Auto-provisioning settings used when ordering from this stock.
                                                    Look up Plan IDs and OS template names in the company&apos;s Netbay catalog.
                                                </p>
                                            </div>
                                            {currentStock?.company && (
                                                <Button asChild variant="outline" size="sm" className="gap-1.5 h-8">
                                                    <Link href={`/admin/companies/${currentStock.company}/netbay-catalog`} target="_blank">
                                                        <BookOpen className="h-3.5 w-3.5" />
                                                        Browse Catalog
                                                    </Link>
                                                </Button>
                                            )}
                                        </div>

                                        <div>
                                            <Label className="text-sm">Group Tag (location filter, optional):</Label>
                                            <Input
                                                type="text"
                                                placeholder="e.g. 103.157"
                                                value={readNetbayConfig(currentStock).groupTag}
                                                onChange={(e) => updateNetbayConfig({ groupTag: e.target.value })}
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Sent as <code>groupTag</code> in the purchase request. Leave blank to
                                                let Netbay pick any available IP.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-sm">Per-RAM Plan IDs:</Label>
                                            {Object.keys(currentStock.memoryOptions).length === 0 ? (
                                                <p className="text-xs text-muted-foreground">Add memory options above first.</p>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {Object.keys(currentStock.memoryOptions).map(size => (
                                                        <div key={size}>
                                                            <Label className="text-xs">{size} → Netbay Plan ID</Label>
                                                            <Input
                                                                type="text"
                                                                placeholder="e.g. 60d5f…"
                                                                className="mt-1 font-mono text-xs"
                                                                value={readNetbayConfig(currentStock).planByMemory[size] || ''}
                                                                onChange={(e) => handleNetbayPlanIdChange(size, e.target.value)}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-xs text-gray-500 mt-1">
                                                Each RAM tier maps to one Netbay Plan ID. Leave a row blank to disable
                                                Netbay auto-provisioning for that size.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <Label className="text-xs">Default Linux OS (optional):</Label>
                                                <Input
                                                    type="text"
                                                    placeholder="Auto from catalog"
                                                    value={readNetbayConfig(currentStock).defaultOs.Linux || ''}
                                                    onChange={(e) => {
                                                        const cfg = readNetbayConfig(currentStock);
                                                        updateNetbayConfig({
                                                            defaultOs: { ...cfg.defaultOs, Linux: e.target.value },
                                                        });
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Default Windows OS (optional):</Label>
                                                <Input
                                                    type="text"
                                                    placeholder="Windows Server 2022"
                                                    value={readNetbayConfig(currentStock).defaultOs.Windows || ''}
                                                    onChange={(e) => {
                                                        const cfg = readNetbayConfig(currentStock);
                                                        updateNetbayConfig({
                                                            defaultOs: { ...cfg.defaultOs, Windows: e.target.value },
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            OS values must match the names exactly as they appear in Netbay&apos;s
                                            Leave blank to auto-pick from catalog. You can paste the template{' '}
                                            <strong>Name</strong> or <strong>OS ID</strong> — purchase sends the name; ID is resolved from catalog.
                                            <code> Windows Server 2022</code> when blank.
                                        </p>
                                    </div>
                                )}

                                {selectedCompanyHasResellerApi && (
                                    <div className="border rounded-lg p-4 bg-sky-50/40 dark:bg-sky-950/10 border-sky-200/60 dark:border-sky-900/40 space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <Label className="text-base font-semibold flex items-center gap-2">
                                                    <Cloud className="h-4 w-4 text-sky-600" />
                                                    PrimeVPS / Panel API
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Sync regions → 1, 2, 3… jitne zones chaho select karo (order = buy priority).
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5 shrink-0"
                                                disabled={panelZonesLoading || !currentStock.company}
                                                onClick={() => currentStock.company && void fetchPanelZones(currentStock.company, false)}
                                            >
                                                {panelZonesLoading ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="h-3.5 w-3.5" />
                                                )}
                                                Sync regions
                                            </Button>
                                        </div>
                                        <ResellerZonePicker
                                            zones={panelZones}
                                            zoneIds={selectedResellerZoneIds}
                                            onChange={handleResellerZoneIdsChange}
                                            loading={panelZonesLoading}
                                            disabled={panelZonesLoading || panelZones.length === 0}
                                        />
                                        {selectedCompanyUsesResellerLiveStock && (
                                            <p className="text-[11px] text-muted-foreground">
                                                Live stock ON — manual stock count hidden. Zone band on panel → Out of stock here automatically.
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <Label className="text-base font-semibold">Tags:</Label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            type="text"
                                            placeholder="Add tag"
                                            value={newTag}
                                            onChange={(e) => setNewTag(e.target.value)}
                                            className="flex-1"
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                        />
                                        <Button type="button" onClick={addTag}>Add</Button>
                                    </div>

                                    {currentStock.tags && currentStock.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {currentStock.tags.map((tag, index) => (
                                                <Badge
                                                    key={index}
                                                    variant="secondary"
                                                    className="flex items-center gap-1"
                                                >
                                                    {tag}
                                                    <X
                                                        className="h-3 w-3 cursor-pointer"
                                                        onClick={() => removeTag(tag)}
                                                    />
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Promo Codes Management */}
                                <div>
                                    <Label className="text-base font-semibold">Promo Codes:</Label>
                                    <div className="grid grid-cols-12 gap-2 mb-2">
                                        <Input
                                            type="text"
                                            placeholder="Promo Code"
                                            value={newPromoCode}
                                            onChange={(e) => setNewPromoCode(e.target.value)}
                                            className="col-span-4"
                                        />
                                        <Select value={newPromoDiscountType} onValueChange={(value: 'percentage' | 'fixed') => setNewPromoDiscountType(value)}>
                                            <SelectTrigger className="col-span-3">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="fixed">₹ Fixed Amount</SelectItem>
                                                <SelectItem value="percentage">% Percentage</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number"
                                            placeholder={newPromoDiscountType === 'fixed' ? "Amount in ₹" : "Percentage"}
                                            min="0"
                                            max={newPromoDiscountType === 'percentage' ? "100" : undefined}
                                            value={newPromoDiscount}
                                            onChange={(e) => setNewPromoDiscount(e.target.value)}
                                            className="col-span-3"
                                        />
                                        <Button type="button" onClick={addPromoCode} className="col-span-2">Add</Button>
                                    </div>

                                    {currentStock.promoCodes && currentStock.promoCodes.length > 0 && (
                                        <div className="border dark:border-none rounded p-2 max-h-32 overflow-y-auto">
                                            {currentStock.promoCodes.map((promo, index) => (
                                                <div key={index} className="flex justify-between items-center mb-1 p-2 bg--50 rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span className={promo.isActive ? '' : 'line-through text-gray-500'}>
                                                            {promo.code} - {promo.discountType === 'fixed' ? `₹${promo.discount} off` : `${promo.discount}% off`}
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => togglePromoCodeActive(index)}
                                                        >
                                                            {promo.isActive ? 'Deactivate' : 'Activate'}
                                                        </Button>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => removePromoCode(index)}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleUpdate}>Update</Button>
                                <DialogClose asChild>
                                    <Button>Close</Button>
                                </DialogClose>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                <Dialog open={isCloneDialogOpen} onOpenChange={setIsCloneDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Clone IP Stock</DialogTitle>
                            <DialogDescription>
                                Copies memory prices, promo codes, Netbay config, company link, and tags.
                                Change the name (and group tag for a new location) after cloning.
                            </DialogDescription>
                        </DialogHeader>
                        {cloneSource && (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Cloning: <span className="font-medium text-foreground">{cloneSource.name}</span>
                                </p>
                                <div>
                                    <Label htmlFor="clone-name">New plan name</Label>
                                    <Input
                                        id="clone-name"
                                        value={cloneName}
                                        onChange={(e) => setCloneName(e.target.value)}
                                        placeholder="e.g. 🐧 103.157.xx Linux IP – Xeon Gold | 4GB / 2vCPU NVMe"
                                    />
                                </div>
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsCloneDialogOpen(false)} disabled={cloning}>
                                Cancel
                            </Button>
                            <Button onClick={handleClone} disabled={cloning || !cloneName.trim()} className="gap-1.5">
                                <Copy className="h-3.5 w-3.5" />
                                {cloning ? 'Cloning…' : 'Create clone'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={hideOutDialogOpen} onOpenChange={setHideOutDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Hide out-of-stock plans</DialogTitle>
                            <DialogDescription>
                                {outOfStockVisibleCount === 0
                                    ? 'No visible out-of-stock plans right now.'
                                    : `Hide ${outOfStockVisibleCount} out-of-stock plan(s) from the customer store at once? They will still appear here in admin. When PrimeVPS/Netbay API shows stock again, they auto go live on the store.`}
                            </DialogDescription>
                        </DialogHeader>
                        {outOfStockVisibleCount > 0 && (
                            <ul className="text-xs text-muted-foreground max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                                {ipStocks
                                    .filter((stock) => !stock.hiddenFromStore && isStockOutOfStock(stock, companies))
                                    .map((stock) => (
                                        <li key={stock._id} className="truncate">{stock.name}</li>
                                    ))}
                            </ul>
                        )}
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setHideOutDialogOpen(false)} disabled={hidingOutOfStock}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => void hideAllOutOfStock()}
                                disabled={hidingOutOfStock || outOfStockVisibleCount === 0}
                                className="gap-1.5"
                            >
                                {hidingOutOfStock ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <EyeOff className="h-4 w-4" />
                                )}
                                Hide {outOfStockVisibleCount} from store
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={unhideOutDialogOpen} onOpenChange={setUnhideOutDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Show out-of-stock plans on store</DialogTitle>
                            <DialogDescription>
                                {outOfStockHiddenCount === 0
                                    ? 'No hidden out-of-stock plans right now.'
                                    : `Show ${outOfStockHiddenCount} hidden out-of-stock plan(s) on the customer store? Customers will see them but cannot buy until stock is back.`}
                            </DialogDescription>
                        </DialogHeader>
                        {outOfStockHiddenCount > 0 && (
                            <ul className="text-xs text-muted-foreground max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                                {ipStocks
                                    .filter((stock) => !!stock.hiddenFromStore && isStockOutOfStock(stock, companies))
                                    .map((stock) => (
                                        <li key={stock._id} className="truncate">{stock.name}</li>
                                    ))}
                            </ul>
                        )}
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setUnhideOutDialogOpen(false)} disabled={unhidingOutOfStock}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => void unhideAllOutOfStock()}
                                disabled={unhidingOutOfStock || outOfStockHiddenCount === 0}
                                className="gap-1.5"
                            >
                                {unhidingOutOfStock ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                                Show {outOfStockHiddenCount} on store
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default ManageIpStock;
