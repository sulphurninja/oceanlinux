'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RenewalLogsPage() {
    const router = useRouter();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState(null);

    // Filters
    const [orderIdFilter, setOrderIdFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [providerFilter, setProviderFilter] = useState('all');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    const fetchLogs = async () => {
        try {
            const params = new URLSearchParams();
            if (orderIdFilter) params.append('orderId', orderIdFilter);
            if (statusFilter !== 'all') params.append('success', statusFilter === 'success');
            if (providerFilter !== 'all') params.append('provider', providerFilter);

            const response = await fetch(`/api/admin/renewal-logs?${params}`);
            const data = await response.json();

            if (data.success) {
                setLogs(data.logs);
                setSummary(data.summary);
                setError(null);
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError('Failed to fetch renewal logs');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [orderIdFilter, statusFilter, providerFilter]);

    useEffect(() => {
        if (autoRefresh) {
            const interval = setInterval(fetchLogs, 10000);
            return () => clearInterval(interval);
        }
    }, [autoRefresh, orderIdFilter, statusFilter, providerFilter]);

    const formatTimestamp = (date) => {
        return new Date(date).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const formatDuration = (ms) => {
        if (!ms) return 'N/A';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    const getStatusColor = (success) => {
        return success ? 'text-green-400' : 'text-red-400';
    };

    const getLevelColor = (level) => {
        switch (level) {
            case 'success': return 'text-green-400';
            case 'error': return 'text-red-400';
            case 'warning': return 'text-yellow-400';
            case 'info': return 'text-blue-400';
            case 'debug': return 'text-gray-400';
            default: return 'text-gray-300';
        }
    };

    const downloadLogs = () => {
        const dataStr = JSON.stringify(logs, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `renewal-logs-${new Date().toISOString()}.json`;
        link.click();
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
            {/* Header */}
            <div className="max-w-7xl mx-auto mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-3xl font-bold text-white">🔍 Renewal Debug Logs</h1>
                    <button
                        onClick={() => router.push('/admin')}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                    >
                        ← Back to Admin
                    </button>
                </div>

                {/* Summary Stats */}
                {summary && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                            <div className="text-sm text-gray-400">Total Attempts</div>
                            <div className="text-2xl font-bold">{summary.totalAttempts}</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-4 border border-green-900/30">
                            <div className="text-sm text-gray-400">Successful</div>
                            <div className="text-2xl font-bold text-green-400">{summary.successCount}</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-4 border border-red-900/30">
                            <div className="text-sm text-gray-400">Failed</div>
                            <div className="text-2xl font-bold text-red-400">{summary.failureCount}</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                            <div className="text-sm text-gray-400">Avg Duration</div>
                            <div className="text-2xl font-bold">{formatDuration(summary.avgDuration)}</div>
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Order ID</label>
                            <input
                                type="text"
                                value={orderIdFilter}
                                onChange={(e) => setOrderIdFilter(e.target.value)}
                                placeholder="Filter by order ID..."
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="all">All</option>
                                <option value="success">Success</option>
                                <option value="failure">Failure</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Provider</label>
                            <select
                                value={providerFilter}
                                onChange={(e) => setProviderFilter(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="all">All</option>
                                <option value="hostycare">Hostycare</option>
                                <option value="smartvps">SmartVPS</option>
                                <option value="oceanlinux">OceanLinux</option>
                            </select>
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                className={`flex-1 px-4 py-2 rounded-lg transition ${autoRefresh
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : 'bg-gray-700 hover:bg-gray-600'
                                    }`}
                            >
                                {autoRefresh ? '✓ Auto-Refresh' : 'Auto-Refresh'}
                            </button>
                            <button
                                onClick={downloadLogs}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                                title="Download logs as JSON"
                            >
                                ⬇
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Terminal Logs */}
            <div className="max-w-7xl mx-auto">
                {loading ? (
                    <div className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                        <p className="mt-4 text-gray-400">Loading renewal logs...</p>
                    </div>
                ) : error ? (
                    <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 text-red-400">
                        Error: {error}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
                        <p className="text-gray-400">No renewal logs found</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {logs.map((log) => (
                            <div
                                key={log._id}
                                className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-gray-600 transition cursor-pointer"
                                onClick={() => setSelectedLog(selectedLog?._id === log._id ? null : log)}
                            >
                                {/* Log Header */}
                                <div className="p-4 font-mono text-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <span className={`font-bold ${getStatusColor(log.success)}`}>
                                                {log.success ? '✓ SUCCESS' : '✗ FAILED'}
                                            </span>
                                            <span className="text-gray-400">|</span>
                                            <span className="text-blue-400">{log.processedVia}</span>
                                            <span className="text-gray-400">|</span>
                                            <span className="text-purple-400">{log.orderContext?.provider || 'N/A'}</span>
                                        </div>
                                        <div className="text-gray-500 text-xs">
                                            {formatTimestamp(log.startTime)}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                        <div>
                                            <span className="text-gray-500">Order:</span>{' '}
                                            <span className="text-cyan-400">{log.orderId.toString().slice(-8)}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Product:</span>{' '}
                                            <span className="text-gray-300">{log.orderContext?.productName || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">IP:</span>{' '}
                                            <span className="text-gray-300">{log.orderContext?.ipAddress || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Duration:</span>{' '}
                                            <span className="text-yellow-400">{formatDuration(log.duration)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Log Details */}
                                {selectedLog?._id === log._id && (
                                    <div className="border-t border-gray-700 bg-black/30 p-4 font-mono text-xs">
                                        <div className="mb-4">
                                            <div className="text-gray-400 mb-2 text-sm font-bold">📋 LOG ENTRIES:</div>
                                            <div className="bg-black rounded p-3 max-h-96 overflow-y-auto space-y-1">
                                                {log.logs && log.logs.length > 0 ? (
                                                    log.logs.map((entry, idx) => (
                                                        <div key={idx} className="flex gap-3">
                                                            <span className="text-gray-600">{formatTimestamp(entry.timestamp)}</span>
                                                            <span className={`font-bold ${getLevelColor(entry.level)}`}>
                                                                [{entry.level.toUpperCase()}]
                                                            </span>
                                                            <span className="text-gray-300">{entry.message}</span>
                                                            {entry.data && (
                                                                <span className="text-gray-500">
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
                                            <div className="mb-4">
                                                <div className="text-gray-400 mb-2 text-sm font-bold">
                                                    🔌 PROVIDER API ({log.providerApiResult.provider}):
                                                </div>
                                                <div className="bg-black rounded p-3">
                                                    <div className="mb-2">
                                                        <span className={getStatusColor(log.providerApiResult.success)}>
                                                            {log.providerApiResult.success ? '✓ Success' : '✗ Failed'}
                                                        </span>
                                                        {log.providerApiResult.apiDuration && (
                                                            <span className="text-gray-500 ml-3">
                                                                ({formatDuration(log.providerApiResult.apiDuration)})
                                                            </span>
                                                        )}
                                                    </div>
                                                    {log.providerApiResult.error && (
                                                        <div className="text-red-400 mt-2">
                                                            Error: {log.providerApiResult.error.message}
                                                        </div>
                                                    )}
                                                    {log.providerApiResult.result && (
                                                        <pre className="text-gray-400 mt-2 text-xs overflow-x-auto">
                                                            {JSON.stringify(log.providerApiResult.result, null, 2)}
                                                        </pre>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {log.errorMessage && (
                                            <div className="mb-4">
                                                <div className="text-red-400 mb-2 text-sm font-bold">❌ ERROR:</div>
                                                <div className="bg-red-900/20 rounded p-3 border border-red-900">
                                                    <div className="text-red-300">{log.errorMessage}</div>
                                                    {log.errorStack && (
                                                        <pre className="text-red-400/60 mt-2 text-xs overflow-x-auto">
                                                            {log.errorStack}
                                                        </pre>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
