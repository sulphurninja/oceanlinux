'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, Loader2, Search, X } from 'lucide-react';

type RenewalLog = Record<string, any>;
type RenewalSummary = Record<string, any>;

type ApiStatus =
    | 'api_success'
    | 'api_failed'
    | 'manual_confirmed'
    | 'payment_success'
    | 'failed'
    | 'unknown';

function getStatusMeta(status: ApiStatus) {
    switch (status) {
        case 'api_success':
            return { label: '✓ API SUCCESS', className: 'text-green-400' };
        case 'api_failed':
            return { label: '✗ API FAILED', className: 'text-red-400' };
        case 'manual_confirmed':
            return { label: '✓ MANUAL CONFIRMED', className: 'text-sky-400' };
        case 'payment_success':
            return { label: '✓ PAYMENT OK', className: 'text-emerald-300' };
        case 'failed':
            return { label: '✗ FAILED', className: 'text-red-400' };
        default:
            return { label: '? UNKNOWN', className: 'text-gray-400' };
    }
}

export default function RenewalLogsPage() {
    const router = useRouter();
    const [logs, setLogs] = useState<RenewalLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<RenewalSummary | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    const [orderIdFilter, setOrderIdFilter] = useState('');
    const [ipFilter, setIpFilter] = useState('');
    const [renewalTxnFilter, setRenewalTxnFilter] = useState('');
    const [gatewayOrderFilter, setGatewayOrderFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [providerFilter, setProviderFilter] = useState('all');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [selectedLog, setSelectedLog] = useState<RenewalLog | null>(null);

    const fetchLogs = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);

            const params = new URLSearchParams();
            if (orderIdFilter.trim()) params.append('orderId', orderIdFilter.trim());
            if (ipFilter.trim()) params.append('ip', ipFilter.trim());
            if (renewalTxnFilter.trim()) params.append('renewalTxnId', renewalTxnFilter.trim());
            if (gatewayOrderFilter.trim()) params.append('gatewayOrderId', gatewayOrderFilter.trim());
            if (statusFilter !== 'all') params.append('apiStatus', statusFilter);
            if (providerFilter !== 'all') params.append('provider', providerFilter);

            const response = await fetch(`/api/admin/renewal-logs?${params.toString()}`, {
                credentials: 'include',
            });
            const data = await response.json();

            if (data.success) {
                setLogs(data.logs || []);
                setSummary(data.summary || null);
                setError(null);
                setSelectedLog((prev) => {
                    if (!prev) return null;
                    return (data.logs || []).find((log: RenewalLog) => log._id === prev._id) || null;
                });
            } else {
                setError(data.message || 'Failed to fetch renewal logs');
            }
        } catch (err) {
            setError('Failed to fetch renewal logs');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [orderIdFilter, ipFilter, renewalTxnFilter, gatewayOrderFilter, statusFilter, providerFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => fetchLogs(true), 10000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchLogs]);

    const formatTimestamp = (date: string | Date | null | undefined) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    const formatDuration = (ms: number | null | undefined) => {
        if (ms == null || Number.isNaN(ms)) return 'N/A';
        if (ms < 1000) return `${Math.round(ms)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    const getLevelColor = (level: string | undefined) => {
        switch (level) {
            case 'success':
                return 'text-green-400';
            case 'error':
                return 'text-red-400';
            case 'warning':
                return 'text-yellow-400';
            case 'info':
                return 'text-blue-400';
            case 'debug':
                return 'text-gray-400';
            default:
                return 'text-gray-300';
        }
    };

    const getProviderErrorMessage = (providerError: any) => {
        if (!providerError) return null;
        if (typeof providerError === 'string') return providerError;
        return providerError.message || JSON.stringify(providerError);
    };

    const clearFilters = () => {
        setOrderIdFilter('');
        setIpFilter('');
        setRenewalTxnFilter('');
        setGatewayOrderFilter('');
        setStatusFilter('all');
        setProviderFilter('all');
    };

    const downloadLogs = () => {
        const dataStr = JSON.stringify(logs, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `renewal-logs-${new Date().toISOString()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleManualConfirm = async (log: RenewalLog, e: React.MouseEvent) => {
        e.stopPropagation();
        const note = window.prompt(
            'Confirm manual renewal on panel?',
            'Renewed manually on upstream panel',
        );
        if (note === null) return;

        setConfirmingId(log._id);
        try {
            const res = await fetch(`/api/admin/renewal-logs/${log._id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manualConfirm: true, note }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                await fetchLogs(true);
            } else {
                alert(data.message || 'Failed to confirm');
            }
        } catch {
            alert('Failed to confirm manual renewal');
        } finally {
            setConfirmingId(null);
        }
    };

    const handleUndoManualConfirm = async (log: RenewalLog, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Remove manual confirmation from this log?')) return;

        setConfirmingId(log._id);
        try {
            const res = await fetch(`/api/admin/renewal-logs/${log._id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manualConfirm: false }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                await fetchLogs(true);
            } else {
                alert(data.message || 'Failed to update');
            }
        } catch {
            alert('Failed to update');
        } finally {
            setConfirmingId(null);
        }
    };

    const hasActiveFilters =
        orderIdFilter ||
        ipFilter ||
        renewalTxnFilter ||
        gatewayOrderFilter ||
        statusFilter !== 'all' ||
        providerFilter !== 'all';

    return (
        <div className="glass-admin-page renewal-logs-page min-h-screen p-4 sm:p-6 min-w-0 overflow-x-hidden">
            <div className="max-w-7xl mx-auto mb-6 min-w-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <h1 className="text-xl sm:text-3xl font-bold text-white break-words">
                        Renewal Debug Logs
                    </h1>
                    <button
                        onClick={() => router.push('/admin/dashboard')}
                        className="w-full sm:w-auto shrink-0 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                    >
                        ← Back to Admin
                    </button>
                </div>

                {summary && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-6">
                        <div className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-gray-700 min-w-0">
                            <div className="text-xs sm:text-sm text-gray-400">Total</div>
                            <div className="text-xl sm:text-2xl font-bold truncate">{summary.totalAttempts}</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-green-900/30 min-w-0">
                            <div className="text-xs sm:text-sm text-gray-400">API Success</div>
                            <div className="text-xl sm:text-2xl font-bold text-green-400 truncate">
                                {summary.apiSuccessCount ?? 0}
                            </div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-red-900/30 min-w-0">
                            <div className="text-xs sm:text-sm text-gray-400">API Failed</div>
                            <div className="text-xl sm:text-2xl font-bold text-red-400 truncate">
                                {summary.apiFailedCount ?? 0}
                            </div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-sky-900/30 min-w-0">
                            <div className="text-xs sm:text-sm text-gray-400">Manual OK</div>
                            <div className="text-xl sm:text-2xl font-bold text-sky-400 truncate">
                                {summary.manualConfirmedCount ?? 0}
                            </div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-gray-700 min-w-0 col-span-2 md:col-span-1">
                            <div className="text-xs sm:text-sm text-gray-400">Avg Duration</div>
                            <div className="text-xl sm:text-2xl font-bold truncate">
                                {formatDuration(summary.avgDuration)}
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-gray-700 mb-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        <div className="min-w-0">
                            <label className="block text-sm text-gray-400 mb-2">IP Address</label>
                            <input
                                type="text"
                                value={ipFilter}
                                onChange={(e) => setIpFilter(e.target.value)}
                                placeholder="e.g. 192.232.56.22"
                                className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="min-w-0">
                            <label className="block text-sm text-gray-400 mb-2">Renewal Txn ID</label>
                            <input
                                type="text"
                                value={renewalTxnFilter}
                                onChange={(e) => setRenewalTxnFilter(e.target.value)}
                                placeholder="RENEWAL_... or partial"
                                className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="min-w-0">
                            <label className="block text-sm text-gray-400 mb-2">Gateway Order ID</label>
                            <input
                                type="text"
                                value={gatewayOrderFilter}
                                onChange={(e) => setGatewayOrderFilter(e.target.value)}
                                placeholder="Razorpay / Cashfree order id"
                                className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="min-w-0">
                            <label className="block text-sm text-gray-400 mb-2">Order ID</label>
                            <input
                                type="text"
                                value={orderIdFilter}
                                onChange={(e) => setOrderIdFilter(e.target.value)}
                                placeholder="Mongo order _id"
                                className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="min-w-0">
                            <label className="block text-sm text-gray-400 mb-2">API Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="all">All</option>
                                <option value="api_success">API Success</option>
                                <option value="api_failed">API Failed (needs manual)</option>
                                <option value="manual_confirmed">Manual Confirmed</option>
                                <option value="failed">Payment Failed</option>
                            </select>
                        </div>
                        <div className="min-w-0">
                            <label className="block text-sm text-gray-400 mb-2">Provider</label>
                            <select
                                value={providerFilter}
                                onChange={(e) => setProviderFilter(e.target.value)}
                                className="w-full min-w-0 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="all">All</option>
                                <option value="advps">advps</option>
                                <option value="smartvps">smartvps</option>
                                <option value="netbay">netbay</option>
                                <option value="trialvps">trial</option>
                                <option value="slotip">slot</option>
                                <option value="reseller-api">reseller-api</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => fetchLogs()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition inline-flex items-center gap-2"
                        >
                            <Search className="h-4 w-4" />
                            Search
                        </button>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition inline-flex items-center gap-2"
                            >
                                <X className="h-4 w-4" />
                                Clear
                            </button>
                        )}
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`px-4 py-2 rounded-lg transition ${
                                autoRefresh ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                        >
                            {autoRefresh ? '✓ Auto-Refresh' : 'Auto-Refresh'}
                        </button>
                        <button
                            onClick={downloadLogs}
                            disabled={!logs.length}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition"
                        >
                            Download JSON
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto min-w-0">
                {loading ? (
                    <div className="text-center py-12">
                        <Loader2 className="inline-block h-8 w-8 animate-spin text-blue-500" />
                        <p className="mt-4 text-gray-400">Loading renewal logs...</p>
                    </div>
                ) : error ? (
                    <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 text-red-400 break-words">
                        Error: {error}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
                        <p className="text-gray-400">No renewal logs found</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {logs.map((log) => {
                            const apiStatus = (log.apiStatus || 'unknown') as ApiStatus;
                            const statusMeta = getStatusMeta(apiStatus);
                            const isApiFailed = apiStatus === 'api_failed';
                            const isManual = apiStatus === 'manual_confirmed';

                            return (
                                <div
                                    key={log._id}
                                    className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-gray-600 transition min-w-0"
                                >
                                    <div
                                        className="p-3 sm:p-4 font-mono text-xs sm:text-sm min-w-0 cursor-pointer"
                                        onClick={() =>
                                            setSelectedLog(selectedLog?._id === log._id ? null : log)
                                        }
                                    >
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 flex-1">
                                                <span className={`font-bold shrink-0 ${statusMeta.className}`}>
                                                    {statusMeta.label}
                                                </span>
                                                {log.success === false && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">
                                                        payment failed
                                                    </span>
                                                )}
                                                {log.providerApiResult?.apiCalled && (
                                                    <span
                                                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                            log.providerApiResult.success
                                                                ? 'bg-green-900/30 text-green-300'
                                                                : 'bg-red-900/30 text-red-300'
                                                        }`}
                                                    >
                                                        upstream:{' '}
                                                        {log.providerApiResult.success ? 'ok' : 'failed'}
                                                    </span>
                                                )}
                                                <span className="text-gray-400 hidden sm:inline">|</span>
                                                <span className="text-blue-400 break-all">{log.processedVia}</span>
                                                <span className="text-gray-400 hidden sm:inline">|</span>
                                                <span className="text-purple-400 break-all">
                                                    {log.orderContext?.provider || 'N/A'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {isApiFailed && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleManualConfirm(log, e)}
                                                        disabled={confirmingId === log._id}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-sans disabled:opacity-50"
                                                        title="Mark as manually renewed on panel"
                                                    >
                                                        {confirmingId === log._id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Check className="h-3.5 w-3.5" />
                                                        )}
                                                        Manual OK
                                                    </button>
                                                )}
                                                {isManual && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleUndoManualConfirm(log, e)}
                                                        disabled={confirmingId === log._id}
                                                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-sans"
                                                        title="Undo manual confirmation"
                                                    >
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
                                                    </button>
                                                )}
                                                <div className="text-gray-500 text-xs">
                                                    {formatTimestamp(log.startTime)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 text-xs">
                                            <div className="min-w-0 break-words">
                                                <span className="text-gray-500">Order:</span>{' '}
                                                <span className="text-cyan-400">
                                                    {String(log.orderId || '').slice(-8) || 'N/A'}
                                                </span>
                                            </div>
                                            <div className="min-w-0 break-words">
                                                <span className="text-gray-500">IP:</span>{' '}
                                                <span className="text-yellow-300 font-semibold">
                                                    {log.orderContext?.ipAddress || 'N/A'}
                                                </span>
                                            </div>
                                            <div className="min-w-0 break-words">
                                                <span className="text-gray-500">Txn:</span>{' '}
                                                <span className="text-gray-300">{log.renewalTxnId || 'N/A'}</span>
                                            </div>
                                            <div className="min-w-0 break-words sm:col-span-2 lg:col-span-1">
                                                <span className="text-gray-500">Gateway:</span>{' '}
                                                <span className="text-gray-300">
                                                    {log.paymentInfo?.gatewayOrderId ||
                                                        log.paymentInfo?.paymentId ||
                                                        'N/A'}
                                                </span>
                                            </div>
                                            <div className="min-w-0 break-words sm:col-span-2">
                                                <span className="text-gray-500">Product:</span>{' '}
                                                <span className="text-gray-300">
                                                    {log.orderContext?.productName || 'N/A'}
                                                </span>
                                            </div>
                                            {log.orderContext?.resellerEmail ? (
                                                <div className="min-w-0 break-words">
                                                    <span className="text-gray-500">Reseller:</span>{' '}
                                                    <span className="text-orange-300">
                                                        {log.orderContext.resellerEmail}
                                                    </span>
                                                </div>
                                            ) : null}
                                            <div className="min-w-0">
                                                <span className="text-gray-500">Duration:</span>{' '}
                                                <span className="text-yellow-400">
                                                    {formatDuration(log.duration)}
                                                </span>
                                            </div>
                                        </div>

                                        {log.manualConfirmNote && (
                                            <div className="mt-2 text-xs text-sky-300 font-sans">
                                                Manual note: {log.manualConfirmNote}
                                                {log.manualConfirmedAt && (
                                                    <span className="text-gray-500 ml-2">
                                                        ({formatTimestamp(log.manualConfirmedAt)})
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {selectedLog?._id === log._id && (
                                        <div className="border-t border-gray-700 bg-black/30 p-3 sm:p-4 font-mono text-xs min-w-0">
                                            <div className="mb-4 min-w-0">
                                                <div className="text-gray-400 mb-2 text-sm font-bold">
                                                    LOG ENTRIES:
                                                </div>
                                                <div className="bg-black rounded p-3 max-h-64 sm:max-h-96 overflow-y-auto overflow-x-auto space-y-1">
                                                    {log.logs && log.logs.length > 0 ? (
                                                        log.logs.map((entry: RenewalLog, idx: number) => (
                                                            <div
                                                                key={idx}
                                                                className="flex flex-col sm:flex-row sm:gap-3 gap-0.5 min-w-0"
                                                            >
                                                                <span className="text-gray-600 shrink-0">
                                                                    {formatTimestamp(entry.timestamp)}
                                                                </span>
                                                                <span
                                                                    className={`font-bold shrink-0 ${getLevelColor(entry.level)}`}
                                                                >
                                                                    [{(entry.level || 'info').toUpperCase()}]
                                                                </span>
                                                                <span className="text-gray-300 break-words min-w-0">
                                                                    {entry.message}
                                                                </span>
                                                                {entry.data != null && (
                                                                    <span className="text-gray-500 break-all min-w-0">
                                                                        {JSON.stringify(entry.data)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-gray-500">No log entries</div>
                                                    )}
                                                </div>
                                            </div>

                                            {log.providerApiResult?.apiCalled && (
                                                <div className="mb-4 min-w-0">
                                                    <div className="text-gray-400 mb-2 text-sm font-bold">
                                                        PROVIDER API ({log.providerApiResult.provider}):
                                                    </div>
                                                    <div className="bg-black rounded p-3 min-w-0 overflow-x-auto">
                                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                                            <span
                                                                className={
                                                                    log.providerApiResult.success
                                                                        ? 'text-green-400'
                                                                        : 'text-red-400'
                                                                }
                                                            >
                                                                {log.providerApiResult.success
                                                                    ? '✓ Success'
                                                                    : '✗ Failed'}
                                                            </span>
                                                            {log.providerApiResult.apiDuration != null && (
                                                                <span className="text-gray-500">
                                                                    ({formatDuration(log.providerApiResult.apiDuration)})
                                                                </span>
                                                            )}
                                                        </div>
                                                        {getProviderErrorMessage(log.providerApiResult.error) && (
                                                            <div className="text-red-400 mt-2 break-words">
                                                                Error:{' '}
                                                                {getProviderErrorMessage(log.providerApiResult.error)}
                                                            </div>
                                                        )}
                                                        {log.providerApiResult.result != null && (
                                                            <pre className="text-gray-400 mt-2 text-xs overflow-x-auto max-w-full whitespace-pre-wrap break-words">
                                                                {JSON.stringify(
                                                                    log.providerApiResult.result,
                                                                    null,
                                                                    2,
                                                                )}
                                                            </pre>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {log.errorMessage && (
                                                <div className="mb-4 min-w-0">
                                                    <div className="text-red-400 mb-2 text-sm font-bold">ERROR:</div>
                                                    <div className="bg-red-900/20 rounded p-3 border border-red-900 min-w-0 overflow-x-auto">
                                                        <div className="text-red-300 break-words">
                                                            {log.errorMessage}
                                                        </div>
                                                        {log.errorStack && (
                                                            <pre className="text-red-400/60 mt-2 text-xs overflow-x-auto max-w-full whitespace-pre-wrap break-words">
                                                                {log.errorStack}
                                                            </pre>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
