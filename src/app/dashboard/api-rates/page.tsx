'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tag, ArrowUpRight, BookOpen, Wallet, Loader2 } from 'lucide-react';
import { dashboardFetch } from '@/lib/dashboardFetch';
import DashboardSearchInput from '@/components/dashboard/DashboardSearchInput';
import { cn } from '@/lib/utils';

interface RatePlan {
    id: string;
    name: string;
    serverType: string;
    tags: string[];
    available: boolean;
    rates: { memory: string; price: number; listPrice: number | null }[];
}

interface RateSlot {
    id: string;
    name: string;
    pricePerIp: number;
    listPrice: number | null;
    available: boolean;
}

const softCard = 'premium-dashboard-card border-0';

function matchesQuery(haystack: string[], query: string) {
    const tokens = query
        .toLowerCase()
        .split(/[\s,/]+/)
        .map((t) => t.trim())
        .filter(Boolean);
    if (tokens.length === 0) return true;
    const blob = haystack.join(' ').toLowerCase();
    return tokens.every((token) => blob.includes(token));
}

export default function ResellerApiRatesPage() {
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [plans, setPlans] = useState<RatePlan[]>([]);
    const [slotIps, setSlotIps] = useState<RateSlot[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const formatINR = useMemo(
        () =>
            new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0,
            }).format,
        [],
    );

    useEffect(() => {
        let cancelled = false;
        dashboardFetch('/api/reseller/rates', { cache: 'no-store' })
            .then(async (r) => {
                if (r.status === 403 || r.status === 401) {
                    if (!cancelled) setForbidden(true);
                    return null;
                }
                return r.ok ? r.json() : null;
            })
            .then((body) => {
                if (cancelled || !body?.success) return;
                setPlans(body.plans || []);
                setSlotIps(body.slotIps || []);
            })
            .catch(() => { /* empty state renders */ })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const filteredPlans = useMemo(() => {
        const q = searchQuery.trim();
        if (!q) return plans;
        return plans.filter((plan) =>
            matchesQuery(
                [
                    plan.name,
                    plan.serverType,
                    ...(plan.tags || []),
                    ...plan.rates.map((rate) => rate.memory),
                ],
                q,
            ),
        );
    }, [plans, searchQuery]);

    const filteredSlots = useMemo(() => {
        const q = searchQuery.trim();
        if (!q) return slotIps;
        return slotIps.filter((slot) => matchesQuery([slot.name], q));
    }, [slotIps, searchQuery]);

    const hasCatalog = plans.length > 0 || slotIps.length > 0;
    const hasMatches = filteredPlans.length > 0 || filteredSlots.length > 0;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            </div>
        );
    }

    if (forbidden) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className={cn(softCard, 'max-w-md w-full')}>
                    <CardHeader className="text-center space-y-3">
                        <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
                            <Tag className="h-7 w-7 text-emerald-300" />
                        </div>
                        <CardTitle className="text-xl premium-dashboard-title">Reseller access required</CardTitle>
                        <CardDescription className="premium-dashboard-subtitle leading-relaxed">
                            API rates are only available on reseller accounts.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen px-3 py-4 sm:p-6 space-y-4 max-w-7xl mx-auto pb-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-lg sm:text-2xl font-bold premium-dashboard-title flex items-center gap-2">
                        <Tag className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                        Your API Rates
                    </h1>
                    <p className="text-xs sm:text-sm premium-dashboard-subtitle mt-1 leading-relaxed">
                        Your negotiated reseller rates — applied automatically on every Reseller API order. No promo
                        codes needed.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:shrink-0">
                    <Button variant="outline" size="sm" asChild className="premium-btn-outline w-full sm:w-auto justify-center">
                        <Link href="/dashboard/reseller-api-docs">
                            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                            API Docs
                        </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild className="premium-btn-outline w-full sm:w-auto justify-center">
                        <Link href="/dashboard/reseller-wallet">
                            <Wallet className="h-3.5 w-3.5 mr-1.5" />
                            Console
                        </Link>
                    </Button>
                </div>
            </div>

            {hasCatalog ? (
                <div className="sticky top-0 z-10 -mx-3 px-3 py-2 sm:static sm:mx-0 sm:px-0 sm:py-0 bg-[color:var(--background)]/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none">
                    <DashboardSearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search products, e.g. 103.109"
                    />
                    {searchQuery.trim() ? (
                        <p className="mt-2 text-[11px] sm:text-xs premium-dashboard-subtitle">
                            {hasMatches
                                ? `${filteredPlans.length + filteredSlots.length} product${filteredPlans.length + filteredSlots.length === 1 ? '' : 's'} matching “${searchQuery.trim()}”`
                                : `No products matching “${searchQuery.trim()}”`}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {!hasCatalog ? (
                <Card className={softCard}>
                    <CardContent className="py-12 text-center">
                        <p className="text-sm text-white/45">No rate plans available right now.</p>
                    </CardContent>
                </Card>
            ) : !hasMatches ? (
                <Card className={softCard}>
                    <CardContent className="py-10 text-center space-y-3">
                        <p className="text-sm text-white/55">No products match that search.</p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="premium-btn-outline"
                            onClick={() => setSearchQuery('')}
                        >
                            Clear search
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredPlans.map((plan) => (
                        <div
                            key={plan.id}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-3.5 space-y-2.5"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-white leading-snug break-words min-w-0">
                                    {plan.name}
                                </p>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'shrink-0 text-[10px] px-1.5 py-0 h-5',
                                        plan.available
                                            ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
                                            : 'border-red-400/35 bg-red-500/15 text-red-200'
                                    )}
                                >
                                    {plan.available ? 'In stock' : 'Out of stock'}
                                </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {plan.rates.map((rate) => (
                                    <span
                                        key={rate.memory}
                                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px]"
                                    >
                                        <span className="text-white/50">{rate.memory}</span>
                                        <span className="font-semibold text-emerald-300">
                                            {formatINR(rate.price)}
                                        </span>
                                        {rate.listPrice != null && rate.listPrice > rate.price && (
                                            <span className="text-white/35 line-through text-[10px]">
                                                {formatINR(rate.listPrice)}
                                            </span>
                                        )}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                    {filteredSlots.map((slot) => (
                        <div
                            key={slot.id}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-3.5 space-y-2.5"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-white leading-snug break-words min-w-0">
                                    {slot.name}
                                </p>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'shrink-0 text-[10px] px-1.5 py-0 h-5',
                                        slot.available
                                            ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
                                            : 'border-red-400/35 bg-red-500/15 text-red-200'
                                    )}
                                >
                                    {slot.available ? 'In stock' : 'Out of stock'}
                                </Badge>
                            </div>
                            <div className="flex flex-wrap items-baseline gap-1.5">
                                <span className="font-semibold text-emerald-300 text-sm">
                                    {formatINR(slot.pricePerIp)}
                                </span>
                                <span className="text-white/45 text-[11px]">per IP</span>
                                {slot.listPrice != null && slot.listPrice > slot.pricePerIp && (
                                    <span className="text-white/35 line-through text-[10px]">
                                        {formatINR(slot.listPrice)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-100 max-w-3xl">
                <ArrowUpRight className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-300" />
                <p>
                    Ordering is disabled in the panel for reseller accounts. Place orders via the Reseller API using
                    your API credentials from the Reseller Console — the same rates shown here are billed to your
                    reseller wallet.
                </p>
            </div>
        </div>
    );
}
