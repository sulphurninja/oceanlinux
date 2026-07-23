'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Card,
    CardHeader,
    CardContent,
    CardFooter,
    CardTitle,
} from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, Zap, BookOpen, RefreshCw, Loader2 } from 'lucide-react';
import Link from 'next/link';
import axios from 'axios';
import { toast } from 'sonner';
import { ResellerZonePicker, buildResellerZoneConfig } from '@/components/admin/ResellerZonePicker';

const ALL_RAM_OPTIONS = ['1GB', '2GB', '4GB', '6GB', '8GB', '12GB', '16GB', '32GB'] as const;
const DEFAULT_MEMORY_SIZES = ['2GB', '4GB', '8GB', '16GB'];

function memoryRecord(sizes: string[]): Record<string, string> {
    return Object.fromEntries(sizes.map((s) => [s, '']));
}

type PromoCode = {
    code: string;
    discount: number;
    discountType: 'percentage' | 'fixed';
    isActive: boolean;
};
type SmartVpsRow = { ip: string; vps: string | number; qty: number; pid: string | number }
type SmartVpsIPs = { '4GB': string; '8GB': string; '16GB': string }
type SmartVpsDefaultOS = { '4GB': string; '8GB': string; '16GB': string }
type SmartVpsPIDs = { '4GB': string; '8GB': string; '16GB': string }

type CompanyOption = {
    _id: string;
    name: string;
    netbayApi?: { enabled?: boolean } | null;
    resellerApi?: { enabled?: boolean; useLiveStockApi?: boolean } | null;
};

type PanelZone = {
    id: number;
    name: string;
    status: string;
    live: boolean;
};

const IPStockFormWithParams = () => {
    const searchParams = useSearchParams();
    const prefilledProductId = searchParams.get('hostycare_product_id');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [available, setAvailable] = useState('true');
    const [serverType, setServerType] = useState('Linux');
    const [companyId, setCompanyId] = useState('none');
    const [stockCount, setStockCount] = useState('50');
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [netbayGroupTag, setNetbayGroupTag] = useState('');
    const [netbayPlanIds, setNetbayPlanIds] = useState<Record<string, string>>(() =>
        memoryRecord(DEFAULT_MEMORY_SIZES)
    );
    const [netbayDefaultOsLinux, setNetbayDefaultOsLinux] = useState('');
    const [netbayDefaultOsWindows, setNetbayDefaultOsWindows] = useState('');
    const [resellerZoneIds, setResellerZoneIds] = useState<number[]>([]);
    const [resellerCoupon4gb, setResellerCoupon4gb] = useState('');
    const [resellerCoupon8gb, setResellerCoupon8gb] = useState('');
    const [panelZones, setPanelZones] = useState<PanelZone[]>([]);
    const [panelZonesLoading, setPanelZonesLoading] = useState(false);
    const [memorySizes, setMemorySizes] = useState<string[]>(DEFAULT_MEMORY_SIZES);
    const [newMemorySize, setNewMemorySize] = useState('');
    const [prices, setPrices] = useState<Record<string, string>>(() =>
        memoryRecord(DEFAULT_MEMORY_SIZES)
    );
    const [hostycareProductIds, setHostycareProductIds] = useState<Record<string, string>>(() =>
        memoryRecord(DEFAULT_MEMORY_SIZES)
    );

    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [newPromoCode, setNewPromoCode] = useState('');
    const [newPromoDiscount, setNewPromoDiscount] = useState('');
    const [newPromoDiscountType, setNewPromoDiscountType] = useState<'percentage' | 'fixed'>('fixed');

    const [tags, setTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');

    const router = useRouter();

    const [svRows, setSvRows] = useState<SmartVpsRow[]>([])
    const [svLoading, setSvLoading] = useState(false)
    const [smartvpsIPs, setSmartvpsIPs] = useState<SmartVpsIPs>({ '4GB': '', '8GB': '', '16GB': '' })
    const [smartvpsDefaultOS, setSmartvpsDefaultOS] = useState<SmartVpsDefaultOS>({
        '4GB': 'ubuntu',     // SmartVPS changeos values: ubuntu, centos, or 2012/2016/2019/2022/11
        '8GB': 'ubuntu',
        '16GB': 'ubuntu'
    })
    const [smartvpsPIDs, setSmartvpsPIDs] = useState<SmartVpsPIDs>({ '4GB': '', '8GB': '', '16GB': '' })


    const loadSmartVps = async () => {
        try {
            setSvLoading(true)
            const r = await fetch('/api/smartvps/ipstock')
            const j = await r.json()
            if (!j.success) throw new Error(j.error || 'Failed to fetch SmartVPS stock')
            setSvRows(j.rows)
            toast.success('Loaded SmartVPS IP stock')
        } catch (e: any) {
            toast.error(e.message || 'SmartVPS fetch failed')
        } finally {
            setSvLoading(false)
        }
    }
    const setSmartVpsIP = (mem: keyof SmartVpsIPs, val: string) =>
        setSmartvpsIPs(prev => ({ ...prev, [mem]: val }))
    const setSmartVpsOS = (mem: keyof SmartVpsDefaultOS, val: string) =>
        setSmartvpsDefaultOS(prev => ({ ...prev, [mem]: val }))

    useEffect(() => {
        fetch('/api/admin/companies')
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setCompanies(data); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (prefilledProductId) {
            setHostycareProductIds((prev) => {
                const next = { ...prev };
                for (const size of memorySizes) {
                    next[size] = prefilledProductId;
                }
                return next;
            });
            toast.info(`Pre-filled with Hostycare Product ID: ${prefilledProductId}`);
        }
    }, [prefilledProductId, memorySizes]);

    const handlePriceChange = (size: string, value: string) => {
        setPrices((prev) => ({ ...prev, [size]: value }));
    };

    const handleHostycareProductIdChange = (size: string, value: string) => {
        setHostycareProductIds((prev) => ({ ...prev, [size]: value }));
    };

    const addMemoryOption = () => {
        if (!newMemorySize.trim()) return;
        const size = newMemorySize.trim().toUpperCase();
        if (memorySizes.includes(size)) {
            toast.error(`${size} already exists`);
            return;
        }
        setMemorySizes((prev) => [...prev, size].sort((a, b) => {
            const na = parseInt(a, 10) || 0;
            const nb = parseInt(b, 10) || 0;
            return na - nb;
        }));
        setPrices((prev) => ({ ...prev, [size]: '' }));
        setHostycareProductIds((prev) => ({ ...prev, [size]: '' }));
        setNetbayPlanIds((prev) => ({ ...prev, [size]: '' }));
        setNewMemorySize('');
    };

    const removeMemoryOption = (size: string) => {
        if (memorySizes.length <= 1) {
            toast.error('At least one RAM size is required');
            return;
        }
        setMemorySizes((prev) => prev.filter((s) => s !== size));
        setPrices((prev) => {
            const next = { ...prev };
            delete next[size];
            return next;
        });
        setHostycareProductIds((prev) => {
            const next = { ...prev };
            delete next[size];
            return next;
        });
        setNetbayPlanIds((prev) => {
            const next = { ...prev };
            delete next[size];
            return next;
        });
    };
    // helper to encode/decode pid+ip in Select valuef
    const joinPidIp = (pid: string | number, ip: string) => `${pid}||${ip}`;
    const splitPidIp = (value: string) => {
        const [pid, ip] = value.split('||');
        return { pid, ip };
    };

    const addPromoCode = () => {
        if (newPromoCode && newPromoDiscount) {
            const discount = parseFloat(newPromoDiscount);
            if (discount >= 0) {
                if (newPromoDiscountType === 'percentage' && discount > 100) {
                    toast.error('Percentage discount cannot exceed 100%');
                    return;
                }

                setPromoCodes(prev => [...prev, {
                    code: newPromoCode.toUpperCase(),
                    discount,
                    discountType: newPromoDiscountType,
                    isActive: true
                }]);
                setNewPromoCode('');
                setNewPromoDiscount('');
            } else {
                toast.error('Discount must be a positive number');
            }
        }
    };

    const removePromoCode = (index: number) => {
        setPromoCodes(prev => prev.filter((_, i) => i !== index));
    };

    const addTag = () => {
        if (newTag.trim() && !tags.includes(newTag.trim().toLowerCase())) {
            setTags(prev => [...prev, newTag.trim().toLowerCase()]);
            setNewTag('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setTags(prev => prev.filter(tag => tag !== tagToRemove));
    };

    const selectedCompanyHasNetbay = (() => {
        if (!companyId || companyId === 'none') return false;
        const c = companies.find((co) => co._id === companyId);
        return !!(c?.netbayApi?.enabled);
    })();

    const selectedCompanyHasResellerApi = (() => {
        if (!companyId || companyId === 'none') return false;
        const c = companies.find((co) => co._id === companyId);
        return !!(c?.resellerApi?.enabled);
    })();

    const selectedCompanyUsesResellerLiveStock = (() => {
        if (!companyId || companyId === 'none') return false;
        const c = companies.find((co) => co._id === companyId);
        return !!(c?.resellerApi?.enabled && c?.resellerApi?.useLiveStockApi);
    })();

    const fetchPanelZones = async (silent = false) => {
        if (!companyId || companyId === 'none') {
            if (!silent) toast.error('Pehle company select karo');
            return;
        }
        if (!selectedCompanyHasResellerApi) {
            if (!silent) toast.error('Is company par Reseller API enabled nahi hai');
            return;
        }
        setPanelZonesLoading(true);
        try {
            const r = await fetch(
                `/api/reseller-panel/zones?companyId=${encodeURIComponent(companyId)}`,
                { credentials: 'include', cache: 'no-store' }
            );
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || 'Failed to fetch zones');
            const zones: PanelZone[] = Array.isArray(j.zones) ? j.zones : [];
            setPanelZones(zones);
            if (!silent) {
                toast.success(`${zones.length} region(s) loaded from panel`);
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Zone fetch failed';
            if (!silent) toast.error(msg);
            setPanelZones([]);
        } finally {
            setPanelZonesLoading(false);
        }
    };

    useEffect(() => {
        setPanelZones([]);
        setResellerZoneIds([]);
        if (companyId && companyId !== 'none' && selectedCompanyHasResellerApi) {
            void fetchPanelZones(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId, selectedCompanyHasResellerApi]);

    const handleResellerZoneIdsChange = (nextZoneIds: number[]) => {
        setResellerZoneIds(nextZoneIds);
        if (nextZoneIds.length === 1 && !name.trim()) {
            const zone = panelZones.find((z) => Number(z.id) === Number(nextZoneIds[0]));
            if (zone) {
                const suffix = serverType === 'VPS' ? 'Windows VPS' : 'Linux';
                setName(`${zone.name} ${suffix}`);
            }
        }
    };

    const handleNetbayPlanIdChange = (size: string, value: string) => {
        setNetbayPlanIds((prev) => {
            const next = { ...prev };
            if (value.trim()) next[size] = value.trim();
            else delete next[size];
            return next;
        });
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        // Build memory options from configured RAM sizes (2GB, 4GB, etc.)
        const memoryOptions: Record<string, { price: number; hostycareProductId: string | null; hostycareProductName: string | null }> = {};
        for (const size of memorySizes) {
            const price = parseFloat(prices[size] || '0');
            if (!price && !netbayPlanIds[size]?.trim()) continue;
            memoryOptions[size] = {
                price: Number.isFinite(price) ? price : 0,
                hostycareProductId: hostycareProductIds[size] || null,
                hostycareProductName: hostycareProductIds[size] ? `${name} ${size}` : null,
            };
        }

        if (Object.keys(memoryOptions).length === 0) {
            toast.error('Add at least one RAM size with a price (or Netbay Plan ID)');
            return;
        }

        if (selectedCompanyHasResellerApi && resellerZoneIds.length === 0) {
            toast.error('Sync regions karo aur kam se kam 1 zone select karo');
            return;
        }

        // 2) Build SmartVPS byMemory only if values exist (so other providers remain unaffected)
        const makeSmartVpsEntry = (mem: '4GB' | '8GB' | '16GB') => {
            const ip = smartvpsIPs[mem];
            const pid = (smartvpsPIDs as any)?.[mem];      // <-- you added smartvpsPIDs earlier
            const defaultOS = smartvpsDefaultOS[mem];
            if (!ip && !pid) return undefined;             // don’t include empty entries
            return { ip, pid, defaultOS };
        };

        const smartvpsByMemory: Record<'4GB' | '8GB' | '16GB', any> = {
            '4GB': makeSmartVpsEntry('4GB'),
            '8GB': makeSmartVpsEntry('8GB'),
            '16GB': makeSmartVpsEntry('16GB'),
        };

        // Remove undefined keys so your payload stays clean
        const cleanedSmartvpsByMemory = Object.fromEntries(
            Object.entries(smartvpsByMemory).filter(([, v]) => v !== undefined)
        );

        const defaultConfigurations: Record<string, unknown> = {};
        if (Object.keys(cleanedSmartvpsByMemory).length > 0) {
            defaultConfigurations.smartvps = { byMemory: cleanedSmartvpsByMemory };
        }

        const planByMemory = Object.fromEntries(
            Object.entries(netbayPlanIds).filter(([, id]) => id.trim())
        );
        const hasNetbayConfig =
            netbayGroupTag.trim() ||
            Object.keys(planByMemory).length > 0 ||
            netbayDefaultOsLinux.trim() ||
            netbayDefaultOsWindows.trim();

        if (hasNetbayConfig) {
            defaultConfigurations.netbay = {
                ...(netbayGroupTag.trim() ? { groupTag: netbayGroupTag.trim() } : {}),
                ...(Object.keys(planByMemory).length > 0 ? { planByMemory } : {}),
                defaultOs: {
                    ...(netbayDefaultOsLinux.trim() ? { Linux: netbayDefaultOsLinux.trim() } : {}),
                    ...(netbayDefaultOsWindows.trim() ? { Windows: netbayDefaultOsWindows.trim() } : {}),
                },
            };
        }

        const submitTags = [...tags];
        if (selectedCompanyHasResellerApi) {
            defaultConfigurations.resellerApi = {
                ...buildResellerZoneConfig(panelZones, resellerZoneIds),
                planType: 'SHARED',
                gateway: 'WALLET',
                ...(() => {
                    const couponByMemory: Record<string, string> = {};
                    if (resellerCoupon4gb.trim()) couponByMemory['4GB'] = resellerCoupon4gb.trim().toUpperCase();
                    if (resellerCoupon8gb.trim()) couponByMemory['8GB'] = resellerCoupon8gb.trim().toUpperCase();
                    return Object.keys(couponByMemory).length ? { couponByMemory } : {};
                })(),
            };
            if (!submitTags.includes('reseller-api')) submitTags.push('reseller-api');
        }

        const linkedCompany = companyId && companyId !== 'none' ? companyId : null;
        const liveResellerStock = selectedCompanyUsesResellerLiveStock;

        try {
            const response = await axios.post('/api/ipstock', {
                name,
                description,
                available: liveResellerStock
                    ? true
                    : linkedCompany
                    ? Number(stockCount) > 0
                    : available === 'true',
                stockCount: liveResellerStock
                    ? 1
                    : linkedCompany
                    ? Math.max(0, Math.floor(Number(stockCount) || 0))
                    : undefined,
                serverType,
                tags: submitTags,
                memoryOptions,
                promoCodes,
                defaultConfigurations,
                company: linkedCompany,
            });

            console.log('Submission Successful:', response.data);

            // Reset form
            setName('');
            setDescription('');
            setServerType('Linux');
            setTags([]);
            setMemorySizes(DEFAULT_MEMORY_SIZES);
            setPrices(memoryRecord(DEFAULT_MEMORY_SIZES));
            setHostycareProductIds(memoryRecord(DEFAULT_MEMORY_SIZES));
            setPromoCodes([]);
            setSmartvpsIPs({ '4GB': '', '8GB': '', '16GB': '' });
            setSmartvpsPIDs?.({ '4GB': '', '8GB': '', '16GB': '' });
            setSmartvpsDefaultOS({ '4GB': 'ubuntu', '8GB': 'ubuntu', '16GB': 'ubuntu' });
            setCompanyId('none');
            setStockCount('50');
            setNetbayGroupTag('');
            setNetbayPlanIds(memoryRecord(DEFAULT_MEMORY_SIZES));
            setNetbayDefaultOsLinux('');
            setNetbayDefaultOsWindows('');
            setResellerZoneIds([]);
            setResellerCoupon4gb('');
            setResellerCoupon8gb('');
            setPanelZones([]);

            toast.success('IP Stock created successfully!');
        } catch (error: any) {
            console.error('Failed to submit:', error.response?.data || error.message);
            toast.error('Failed to create IP Stock');
        }
    };


    return (
        <div>
            <div className='p-4 border dark:border-none-b'>
                <h1 className='text-lg '>Admin - Create IP Stock </h1>
            </div>
            <div className='p-4'>
                <Card className="m-4">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle>Add New IP Stock</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-1">Name:</Label>
                                <Input
                                    type="text"
                                    className="input input-border dark:border-noneed w-full"
                                    placeholder="IP Stock Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-1">Description:</Label>
                                <textarea
                                    className="flex min-h-[80px] w-full rounded-md border dark:border-none border dark:border-none-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    placeholder="Describe the server configuration, features, etc."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>

                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-1">Server Type:</Label>
                                <Select value={serverType} onValueChange={setServerType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Server Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Linux">Linux</SelectItem>
                                        <SelectItem value="VPS">VPS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-1">Company (optional):</Label>
                                <Select value={companyId} onValueChange={setCompanyId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="No company (managed by admin)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No company</SelectItem>
                                        {companies.map(c => (
                                            <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-gray-500 mt-1">
                                    PrimeVPS: company select karo → regions sync → zone pick → price daalo → create.
                                    Netbay: stock count + plan IDs neeche.
                                </p>
                            </div>

                            {selectedCompanyUsesResellerLiveStock && (
                                <div className="mb-4 rounded-md border border-emerald-200/80 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                                    <strong>Live stock ON</strong> — manual stock count ki zaroorat nahi. Availability panel zone se auto sync hogi.
                                </div>
                            )}

                            {companyId && companyId !== 'none' && !selectedCompanyUsesResellerLiveStock && (
                                <div className="mb-4">
                                    <Label className="block text-sm font-medium mb-1">Stock Count (orderable units):</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={stockCount}
                                        onChange={(e) => setStockCount(e.target.value)}
                                        placeholder="e.g. 50"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Manual mode — kitni baar sell kar sakte ho.
                                    </p>
                                </div>
                            )}

                            {selectedCompanyHasNetbay && (
                                <div className="mb-6 border rounded-lg p-4 bg-amber-50/40 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-900/40 space-y-3">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div>
                                            <Label className="text-base font-semibold flex items-center gap-2">
                                                <Zap className="h-4 w-4 text-amber-600" />
                                                Netbay Configuration
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Plan IDs + OS from the company Netbay catalog. Required for auto VM on payment.
                                            </p>
                                        </div>
                                        <Button asChild variant="outline" size="sm" className="gap-1.5 h-8">
                                            <Link href={`/admin/companies/${companyId}/netbay-catalog`} target="_blank">
                                                <BookOpen className="h-3.5 w-3.5" />
                                                Browse Catalog
                                            </Link>
                                        </Button>
                                    </div>

                                    <div>
                                        <Label className="text-sm">Group Tag (IP series, optional):</Label>
                                        <Input
                                            type="text"
                                            placeholder="e.g. 103.157"
                                            value={netbayGroupTag}
                                            onChange={(e) => setNetbayGroupTag(e.target.value)}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Customer ko is series ki IP milegi (e.g. 103.157.x.x). Blank = any available IP.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm">Per-RAM Plan IDs (catalog → Plans):</Label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            {memorySizes.map((size) => (
                                                <div key={size}>
                                                    <Label className="text-xs">{size} → Plan ID</Label>
                                                    <Input
                                                        type="text"
                                                        placeholder="e.g. 60d5f…"
                                                        className="mt-1 font-mono text-xs"
                                                        value={netbayPlanIds[size] || ''}
                                                        onChange={(e) => handleNetbayPlanIdChange(size, e.target.value)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs">Default Linux OS (catalog OS Name):</Label>
                                            <Input
                                                type="text"
                                                placeholder="Auto from catalog"
                                                value={netbayDefaultOsLinux}
                                                onChange={(e) => setNetbayDefaultOsLinux(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Default Windows OS (catalog OS Name):</Label>
                                            <Input
                                                type="text"
                                                placeholder="Auto from catalog"
                                                value={netbayDefaultOsWindows}
                                                onChange={(e) => setNetbayDefaultOsWindows(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        OS = template <strong>Name</strong> or <strong>OS ID</strong> from catalog (purchase API needs the name — ID is resolved automatically). Hostycare Product ID above chhod sakte ho Netbay stock ke liye.
                                    </p>
                                </div>
                            )}

                            {selectedCompanyHasResellerApi && (
                                <div className="mb-6 border rounded-lg p-4 bg-sky-50/40 dark:bg-sky-950/10 border-sky-200/60 dark:border-sky-900/40 space-y-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <Label className="text-base font-semibold">PrimeVPS / Panel API</Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Sync regions → 1, 2, 3… jitne zones chaho select karo (order = buy priority).
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 shrink-0"
                                            onClick={() => void fetchPanelZones(false)}
                                            disabled={panelZonesLoading}
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
                                        zoneIds={resellerZoneIds}
                                        onChange={handleResellerZoneIdsChange}
                                        loading={panelZonesLoading}
                                        disabled={panelZonesLoading || panelZones.length === 0}
                                    />
                                    <div className="space-y-2">
                                        <Label className="text-xs">Hostheaven panel coupon (auto-buy)</Label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-[11px] text-muted-foreground">4GB</Label>
                                                <Input
                                                    type="text"
                                                    placeholder="e.g. OCEAN199"
                                                    className="mt-1 font-mono text-sm uppercase"
                                                    value={resellerCoupon4gb}
                                                    onChange={(e) => setResellerCoupon4gb(e.target.value.toUpperCase())}
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[11px] text-muted-foreground">8GB</Label>
                                                <Input
                                                    type="text"
                                                    placeholder="e.g. OCEAN8GB"
                                                    className="mt-1 font-mono text-sm uppercase"
                                                    value={resellerCoupon8gb}
                                                    onChange={(e) => setResellerCoupon8gb(e.target.value.toUpperCase())}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            Optional — company default coupons apply if blank.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-2">Tags:</Label>
                                <div className="flex gap-2 mb-2">
                                    <Input
                                        type="text"
                                        placeholder="Add tag (e.g., premium, budget, ssd)"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        className="flex-1"
                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                    />
                                    <Button type="button" onClick={addTag}>Add Tag</Button>
                                </div>

                                {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map((tag, index) => (
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

                            <div className="mb-4">
                                {!selectedCompanyHasNetbay && (
                                    <>
                                        <label className="block text-sm font-medium mb-1">Available:</label>
                                        <Select value={available} onValueChange={setAvailable}>
                                            <SelectTrigger className="select-none">
                                                <SelectValue placeholder="Select Availability" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value='true'>Yes</SelectItem>
                                                <SelectItem value='false'>No</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </>
                                )}
                            </div>

                            {/* Memory Options with Price and Hostycare Product ID */}
                            <div className="mb-6">
                                <Label className="block text-sm font-medium mb-3 text-base">Memory Configuration</Label>
                                <div className="flex flex-wrap items-end gap-2 mb-3">
                                    <div className="flex-1 min-w-[140px]">
                                        <Label className="text-xs">Add RAM size</Label>
                                        <Select value={newMemorySize} onValueChange={setNewMemorySize}>
                                            <SelectTrigger className="h-9 mt-1">
                                                <SelectValue placeholder="Select RAM" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ALL_RAM_OPTIONS.filter((s) => !memorySizes.includes(s)).map((s) => (
                                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button type="button" size="sm" className="h-9" onClick={addMemoryOption} disabled={!newMemorySize}>
                                        Add size
                                    </Button>
                                </div>
                                <div className="bg-ay-50 p-4 rounded-lg border dark:border-none space-y-4">
                                    {memorySizes.map((size) => (
                                        <div key={size} className="border-b border-border/50 pb-4 last:border-0 last:pb-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="font-medium text-sm">{size}</h4>
                                                {memorySizes.length > 1 && (
                                                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => removeMemoryOption(size)}>
                                                        Remove
                                                    </Button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="block text-xs font-medium mb-1">Price (₹):</Label>
                                                    <Input
                                                        type="number"
                                                        placeholder={`Price for ${size}`}
                                                        value={prices[size] || ''}
                                                        onChange={(e) => handlePriceChange(size, e.target.value)}
                                                        className="text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="block text-xs font-medium mb-1">Hostycare Product ID (optional):</Label>
                                                    <Input
                                                        type="text"
                                                        placeholder="Netbay stock — leave blank"
                                                        value={hostycareProductIds[size] || ''}
                                                        onChange={(e) => handleHostycareProductIdChange(size, e.target.value)}
                                                        className="text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Default sizes include <strong>2GB</strong>. Use &quot;Add size&quot; for 1GB, 6GB, etc.
                                </p>
                            </div>

                            {/* Promo Codes Section */}
                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-2">Promo Codes:</Label>
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

                                {promoCodes.length > 0 && (
                                    <div className="border dark:border-none rounded p-2">
                                        <h4 className="text-sm font-medium mb-2">Added Promo Codes:</h4>
                                        {promoCodes.map((promo, index) => (
                                            <div key={index} className="flex justify-between items-center mb-1 p-2 bg-gray-50 rounded">
                                                <span>
                                                    {promo.code} - {promo.discountType === 'fixed' ? `₹${promo.discount} off` : `${promo.discount}% off`}
                                                </span>
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
                        </CardContent>
                        {/* SmartVPS Mapping (optional) */}
                        <div className="mb-6">
                            <Label className="block text-sm font-medium mb-3 text-base">
                                SmartVPS Mapping (optional)
                            </Label>

                            <div className="flex items-center gap-2 mb-3">
                                <Button type="button" onClick={loadSmartVps} disabled={svLoading}>
                                    {svLoading ? 'Loading…' : 'Fetch SmartVPS Stock'}
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                    Pick one SmartVPS IP for each memory size
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border dark:border-none rounded-lg p-4">
                                {(['4GB', '8GB', '16GB'] as const).map(mem => (
                                    <div key={mem} className="space-y-2">
                                        <Label className="text-sm font-medium">{mem} SmartVPS IP</Label>
                                        <Select
                                            value={smartvpsPIDs[mem] && smartvpsIPs[mem] ? joinPidIp(smartvpsPIDs[mem], smartvpsIPs[mem]) : ''}
                                            onValueChange={(val) => {
                                                const { pid, ip } = splitPidIp(val);
                                                setSmartVpsIP(mem, ip);
                                                setSmartvpsPIDs(prev => ({ ...prev, [mem]: pid }));
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={svRows.length ? 'Select IP' : 'Load SmartVPS stock first'} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {svRows.map(r => (
                                                    <SelectItem key={`${r.pid}-${r.ip}`} value={joinPidIp(r.pid, r.ip)}>
                                                        {r.ip} · pid:{String(r.pid)} · qty:{r.qty}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <Label className="text-xs">Default OS for {mem}</Label>
                                        <Select value={smartvpsDefaultOS[mem]} onValueChange={(v) => setSmartVpsOS(mem, v)}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ubuntu">Ubuntu</SelectItem>
                                                <SelectItem value="centos">CentOS</SelectItem>
                                                <SelectItem value="2012">Windows 2012</SelectItem>
                                                <SelectItem value="2016">Windows 2016</SelectItem>
                                                <SelectItem value="2019">Windows 2019</SelectItem>
                                                <SelectItem value="2022">Windows 2022</SelectItem>
                                                <SelectItem value="11">Windows 11</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}

                            </div>
                        </div>

                        <CardFooter>
                            <Button type="submit" className="btn btn-primary">Submit</Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
};

// Loading component for Suspense fallback
const IPStockFormLoading = () => (
    <div className='w-full'>
        <div className='h-[63px] flex gap-2 items-center border dark:border-none-b p-4'>
            <h1 className='text-xl'>Add IP Stock</h1>
        </div>
        <div className='mx-12 mt-6'>
            <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded mb-4"></div>
                <div className="h-32 bg-gray-200 rounded mb-4"></div>
                <div className="h-8 bg-gray-200 rounded mb-4"></div>
            </div>
        </div>
    </div>
);

// Main component with Suspense wrapper
const AddIPStockPage = () => {
    return (
        <Suspense fallback={<IPStockFormLoading />}>
            <IPStockFormWithParams />
        </Suspense>
    );
};

export default AddIPStockPage;
