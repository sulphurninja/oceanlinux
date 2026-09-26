"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity,
  Server,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Package,
  Zap,
  Shield,
  Terminal,
  Download,
  Search,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

interface AdminStats {
  systemHealth: {
    uptime: string;
    responseTime: string;
    status: string;
    cronSecretConfigured?: boolean;
  };
  orders?: {
    total: number;
    pending: number;
    confirmed: number;
    active: number;
    provisioningNow: number;
    provisionFailed: number;
    paidNotProvisioned: number;
    advpsPending: number;
  };
  users: { total: number };
  tickets: { total: number; open: number };
}

interface PaymentLogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: unknown;
}

interface PaymentOrderLog {
  _id: string;
  orderId?: string;
  clientTxnId?: string;
  source: string;
  success: boolean;
  anomaly: boolean;
  flowType?: string;
  orderContext?: {
    productName?: string;
    memory?: string;
    price?: number;
    status?: string;
  };
  paymentInfo?: {
    method?: string;
    gatewayStatus?: string;
    transactionId?: string;
    amount?: number;
  };
  errorMessage?: string;
  duration?: number;
  logs: PaymentLogEntry[];
  createdAt: string;
}

interface DeliveredDoubt {
  orderId: string;
  ip: string;
  email: string;
  name: string;
  product: string;
  price: number;
  method: string;
  status: string;
  day?: string;
  reason: string;
  source: string;
}

interface DeliveredAudit {
  date: string;
  from?: string;
  to?: string;
  checked: number;
  okCount: number;
  doubtCount: number;
  unverifiedCount: number;
  doubtInr: number;
  bySource: Record<string, number>;
  doubt: DeliveredDoubt[];
  unverified: DeliveredDoubt[];
}

const statusBadge = (status: string) => {
  switch (status) {
    case "operational":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
          Operational
        </Badge>
      );
    case "degraded":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
          Degraded
        </Badge>
      );
    case "outage":
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
          Outage
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function AdminStatusPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [paymentLogs, setPaymentLogs] = useState<PaymentOrderLog[]>([]);
  const [logSummary, setLogSummary] = useState<PaymentLogSummary | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [auditFrom, setAuditFrom] = useState(todayIst);
  const [auditTo, setAuditTo] = useState(todayIst);
  const [audit, setAudit] = useState<DeliveredAudit | null>(null);
  const [logFilter, setLogFilter] = useState<"all" | "anomaly" | "success" | "failed">("anomaly");
  const [txnFilter, setTxnFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<PaymentOrderLog | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/stats", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPaymentLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const params = new URLSearchParams({ limit: "80" });
      if (logFilter === "anomaly") params.set("anomaly", "true");
      if (logFilter === "success") params.set("success", "true");
      if (logFilter === "failed") params.set("success", "false");
      if (logFilter === "all") params.set("includeScanNoise", "true");
      if (txnFilter.trim()) params.set("clientTxnId", txnFilter.trim());

      const res = await fetch(`/api/admin/payment-order-logs?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPaymentLogs(data.logs);
        setLogSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to fetch payment logs:", err);
    } finally {
      setLogsLoading(false);
    }
  }, [logFilter, txnFilter]);

  const scanPendingOrders = async () => {
    try {
      setScanLoading(true);
      const res = await fetch("/api/admin/payment-order-logs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: 72, limit: 40 }),
      });
      const data = await res.json().catch(() => null);
      if (!data) {
        toast.error(
          res.status === 504 || res.status === 502
            ? "Scan timed out — server took too long. Try again in a minute."
            : "Scan failed — invalid server response"
        );
        return;
      }
      if (data.success) {
        const recovered = data.recoveredCount ?? 0;
        const carts = data.cartsRecovered?.length ?? 0;
        const recharges = data.rechargesRecovered?.length ?? 0;
        const orders = data.recovered?.length ?? 0;
        const anomalies = data.orderAnomalyCount ?? data.anomalyCount ?? 0;
        if (recovered > 0) {
          const parts = [];
          if (orders > 0) parts.push(`${orders} order(s)`);
          if (carts > 0) parts.push(`${carts} cart(s)`);
          if (recharges > 0) parts.push(`${recharges} wallet top-up(s)`);
          toast.success(
            `Recovered ${parts.join(', ')}${anomalies > 0 ? ` — ${anomalies} paid-but-pending need manual check` : ''}`
          );
        } else if (anomalies > 0) {
          toast.warning(
            `Found ${anomalies} paid-but-pending — gateway shows payment but order not confirmed. Check ⚠ Anomalies filter.`
          );
        } else {
          toast.success(
            `Scanned ${data.scanned ?? 0} orders, ${data.scannedCarts ?? 0} carts, ${data.scannedRecharges ?? 0} wallet top-ups — all clear (unpaid/abandoned checkouts ignored)`
          );
        }
        await fetchPaymentLogs();
      } else {
        toast.error(data.message || data.error || "Scan failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanLoading(false);
    }
  };

  const scanDeliveredPayments = async () => {
    const from = auditFrom <= auditTo ? auditFrom : auditTo;
    const to = auditFrom <= auditTo ? auditTo : auditFrom;
    const span =
      Math.round((new Date(`${to}T00:00:00+05:30`).getTime() - new Date(`${from}T00:00:00+05:30`).getTime()) / 86400000) +
      1;
    if (!from || !to || span > 31) {
      toast.error("Pick a From and To date, at most 31 days apart");
      return;
    }
    try {
      setAuditLoading(true);
      const res = await fetch("/api/admin/delivered-payment-audit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.message || "Delivered payment scan failed");
        return;
      }
      setAudit(data);
      if ((data.doubtCount || 0) > 0) {
        toast.warning(
          `${data.doubtCount} delivered order(s) have no traced Razorpay or wallet payment`
        );
      } else {
        toast.success(
          `Checked ${data.checked} delivered orders on ${data.date} — payment source looks clean`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delivered payment scan failed");
    } finally {
      setAuditLoading(false);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([JSON.stringify(paymentLogs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payment-order-logs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyLogForSupport = (log: PaymentOrderLog) => {
    const text = JSON.stringify(log, null, 2);
    navigator.clipboard.writeText(text);
    toast.success("Log copied — paste this when reporting the issue");
  };

  const formatTs = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const levelColor = (level: string) => {
    switch (level) {
      case "success":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "warning":
        return "text-yellow-400";
      case "debug":
        return "text-gray-500";
      default:
        return "text-blue-300";
    }
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchPaymentLogs();
  }, [fetchPaymentLogs]);

  useEffect(() => {
    if (selectedLog && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [selectedLog]);

  if (loading && !stats) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground mb-4">Failed to load server status.</p>
        <Button onClick={fetchStats}>Retry</Button>
      </div>
    );
  }

  const orders = stats.orders;
  const hasIssues =
    (orders?.provisionFailed ?? 0) > 0 ||
    (orders?.paidNotProvisioned ?? 0) > 0 ||
    (orders?.advpsPending ?? 0) > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Server Status</h1>
          <p className="text-muted-foreground">
            Live platform health, orders, and provisioning queue
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Overall */}
      <Card className={hasIssues ? "border-yellow-300" : "border-green-300"}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            {hasIssues ? (
              <AlertTriangle className="w-10 h-10 text-yellow-500" />
            ) : (
              <CheckCircle className="w-10 h-10 text-green-500" />
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {hasIssues ? "Some items need attention" : "All systems operational"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {lastUpdated
                  ? `Last updated ${lastUpdated.toLocaleTimeString()}`
                  : "—"}
              </p>
            </div>
            <div className="ml-auto">{statusBadge(stats.systemHealth.status)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" /> Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.systemHealth.uptime}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" /> API Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.systemHealth.responseTime}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="w-4 h-4" /> Active Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{orders?.active ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {orders?.confirmed ?? 0} confirmed pending delivery
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4" /> Cron Secret
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.systemHealth.cronSecretConfigured ? (
              <Badge className="bg-green-100 text-green-800">Configured</Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800">Missing — set CRON_SECRET</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Provisioning queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Provisioning Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/40">
              <p className="text-sm text-muted-foreground">Total orders</p>
              <p className="text-2xl font-bold">{orders?.total ?? 0}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <p className="text-sm text-muted-foreground">Provisioning now</p>
              <p className="text-2xl font-bold text-blue-600">
                {orders?.provisioningNow ?? 0}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <p className="text-sm text-muted-foreground">Paid, not delivered</p>
              <p className="text-2xl font-bold text-orange-600">
                {orders?.paidNotProvisioned ?? 0}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <p className="text-sm text-muted-foreground">Provision failed</p>
              <p className="text-2xl font-bold text-red-600">
                {orders?.provisionFailed ?? 0}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <p className="text-sm text-muted-foreground">ADVPS pending</p>
              <p className="text-2xl font-bold text-purple-600">
                {orders?.advpsPending ?? 0}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <p className="text-sm text-muted-foreground">Pending payment</p>
              <p className="text-2xl font-bold">{orders?.pending ?? 0}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <p className="text-sm text-muted-foreground">Open tickets</p>
              <p className="text-2xl font-bold">{stats.tickets.open}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <p className="text-sm text-muted-foreground">Total users</p>
              <p className="text-2xl font-bold">{stats.users.total}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "OceanLinux API", status: "operational" },
            { name: "Payment gateways", status: "operational" },
            { name: "Auto-provision cron", status: stats.systemHealth.cronSecretConfigured ? "operational" : "degraded" },
            { name: "Provisioning pipeline", status: (orders?.provisionFailed ?? 0) > 3 ? "degraded" : "operational" },
          ].map((svc) => (
            <div
              key={svc.name}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
            >
              <div className="flex items-center gap-3">
                {svc.status === "operational" ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Clock className="w-4 h-4 text-yellow-500" />
                )}
                <span className="font-medium">{svc.name}</span>
              </div>
              {statusBadge(svc.status)}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-red-900/40 overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              Delivered payment check
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Pick a From and To date, for example the 1st through the 10th. Razorpay or a wallet debit
              backed by a real credit is OK. Fake spends stay on the right, including cancelled orders whose IP was removed.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              From
              <Input
                type="date"
                value={auditFrom}
                onChange={(e) => setAuditFrom(e.target.value)}
                className="mt-1 w-[150px]"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              To
              <Input
                type="date"
                value={auditTo}
                onChange={(e) => setAuditTo(e.target.value)}
                className="mt-1 w-[150px]"
              />
            </label>
            <Button onClick={scanDeliveredPayments} disabled={auditLoading} variant="destructive" size="sm">
              {auditLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
              Scan range
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!audit ? (
            <p className="text-sm text-muted-foreground">
              Set From and To, then scan. One day is fine; 1st to 10th is one scan.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Checked · {audit.date}</p>
                  <p className="text-2xl font-bold tabular-nums">{audit.checked}</p>
                </div>
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                  <p className="text-xs text-muted-foreground">Payment traced</p>
                  <p className="text-2xl font-bold tabular-nums text-green-600">{audit.okCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Object.entries(audit.bySource || {})
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <p className="text-xs text-muted-foreground">Doubt / possible loss</p>
                  <p className="text-2xl font-bold tabular-nums text-red-600">{audit.doubtCount}</p>
                  <p className="text-xs text-muted-foreground">
                    ₹{Math.round(audit.doubtInr || 0).toLocaleString("en-IN")}
                  </p>
                </div>
                {audit.unverifiedCount > 0 ? (
                  <p className="text-xs text-amber-600">
                    {audit.unverifiedCount} could not be checked (Razorpay API). Run the scan again.
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border min-h-[220px] max-h-[420px] overflow-y-auto">
                <div className="sticky top-0 border-b bg-background px-3 py-2 text-sm font-medium">
                  Doubtful IPs
                </div>
                {audit.doubt.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No untraced payments in this range.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {audit.doubt.map((row) => (
                      <li key={row.orderId} className="px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold">
                            {row.ip || (row.status === "cancelled" ? "cancelled · no IP" : "no IP")}
                          </span>
                          <span className="tabular-nums text-red-600">
                            ₹{row.price.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.email || row.name || "—"} · {row.product}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.day ? `${row.day} · ` : ""}
                          {row.method || "no method"}
                          {row.status === "cancelled" ? " · cancelled" : ""} · {row.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment / order debug terminal */}
      <Card className="border-gray-800 overflow-hidden">
        <CardHeader className="bg-gray-950 text-gray-100 border-b border-gray-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-gray-100">
              <Terminal className="w-5 h-5 text-green-400" />
              Payment &amp; Order Logs
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={scanPendingOrders}
                disabled={scanLoading}
                className="border-yellow-600 text-yellow-400 hover:bg-yellow-950"
              >
                {scanLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-1" />
                )}
                Scan paid-but-pending
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={scanDeliveredPayments}
                disabled={auditLoading}
                className="border-red-700 text-red-300 hover:bg-red-950"
              >
                {auditLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4 mr-1" />
                )}
                Scan delivered payments
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPaymentLogs}
                disabled={logsLoading}
                className="border-gray-600 text-gray-300"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${logsLoading ? "animate-spin" : ""}`} />
                Refresh logs
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadLogs}
                disabled={!paymentLogs.length}
                className="border-gray-600 text-gray-300"
              >
                <Download className="w-4 h-4 mr-1" />
                Export JSON
              </Button>
            </div>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Tracks when customer paid successfully but order stayed pending.{" "}
            <strong className="text-green-400">Auto-scan every 15 min</strong> (same as this button) when{" "}
            <code className="text-xs">CRON_SECRET</code> + cron are configured. Manual scan still works anytime.{" "}
            Recovers buy-now orders, cart checkouts, and wallet top-ups.
          </p>
        </CardHeader>
        <CardContent className="p-0 bg-gray-950">
          {logSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-800 border-b border-gray-800">
              {[
                { label: "Total events", value: logSummary.total, cls: "text-gray-200" },
                { label: "Confirmed OK", value: logSummary.successCount, cls: "text-green-400" },
                { label: "Paid but pending", value: logSummary.anomalyCount, cls: "text-yellow-400" },
                { label: "Other failures", value: logSummary.failedCount, cls: "text-red-400" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-950 px-4 py-3">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-xl font-bold font-mono ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="p-4 border-b border-gray-800 flex flex-wrap gap-3">
            <div className="flex gap-1">
              {(["all", "anomaly", "success", "failed"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={logFilter === f ? "default" : "outline"}
                  onClick={() => setLogFilter(f)}
                  className={
                    logFilter === f
                      ? f === "anomaly"
                        ? "bg-yellow-600 hover:bg-yellow-700"
                        : ""
                      : "border-gray-700 text-gray-400"
                  }
                >
                  {f === "all" ? "All (incl. noise)" : f === "anomaly" ? "⚠ Anomalies" : f}
                </Button>
              ))}
            </div>
            <Input
              placeholder="Filter by clientTxnId..."
              value={txnFilter}
              onChange={(e) => setTxnFilter(e.target.value)}
              className="max-w-xs bg-gray-900 border-gray-700 text-gray-200 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 w-full">
              Default view hides old scan noise (unpaid PENDING/ATTEMPTED). Real issues → ⚠ Anomalies.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[420px]">
            {/* Event list */}
            <div className="border-r border-gray-800 max-h-[480px] overflow-y-auto">
              {logsLoading && !paymentLogs.length ? (
                <div className="flex items-center justify-center h-40 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading logs...
                </div>
              ) : paymentLogs.length === 0 ? (
                <div className="p-6 text-gray-500 text-sm font-mono">
                  <p>No payment logs yet.</p>
                  <p className="mt-2 text-gray-600">
                    Logs appear when webhooks, payment status checks, or scans run.
                    Click &quot;Scan paid-but-pending&quot; to check recent pending orders against gateways.
                  </p>
                </div>
              ) : (
                paymentLogs.map((log) => (
                  <button
                    key={log._id}
                    type="button"
                    onClick={() => setSelectedLog(log)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-800/60 hover:bg-gray-900 transition font-mono text-xs ${
                      selectedLog?._id === log._id ? "bg-gray-900 border-l-2 border-l-green-500" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-500">{formatTs(log.createdAt)}</span>
                      {log.anomaly && (
                        <Badge className="bg-yellow-900/60 text-yellow-400 text-[10px] px-1 py-0">
                          ANOMALY
                        </Badge>
                      )}
                      {log.success && (
                        <Badge className="bg-green-900/60 text-green-400 text-[10px] px-1 py-0">
                          OK
                        </Badge>
                      )}
                      <span className="text-gray-600">{log.source}</span>
                    </div>
                    <p className="text-gray-300 truncate">
                      {log.clientTxnId || log.orderId || "—"}{" "}
                      {log.orderContext?.productName ? `· ${log.orderContext.productName}` : ""}
                    </p>
                    {log.errorMessage && (
                      <p className="text-red-400 truncate mt-0.5">{log.errorMessage}</p>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Terminal detail */}
            <div className="flex flex-col max-h-[480px]">
              {selectedLog ? (
                <>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
                    <span className="text-xs text-gray-400 font-mono">
                      {selectedLog.clientTxnId} · {selectedLog.source}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyLogForSupport(selectedLog)}
                      className="text-green-400 hover:text-green-300 h-7 text-xs"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy log
                    </Button>
                  </div>
                  <div
                    ref={terminalRef}
                    className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
                  >
                    <p className="text-green-400 mb-2">
                      $ payment-debug --order {selectedLog.clientTxnId || selectedLog.orderId}
                    </p>
                    <p className="text-gray-500 mb-3">
                      flow={selectedLog.flowType || "new_order"} source={selectedLog.source}{" "}
                      success={String(selectedLog.success)} anomaly={String(selectedLog.anomaly)}
                      {selectedLog.duration != null && ` duration=${selectedLog.duration}ms`}
                    </p>
                    {selectedLog.paymentInfo && (
                      <p className="text-cyan-400 mb-3">
                        gateway: {selectedLog.paymentInfo.method || "?"} /{" "}
                        {selectedLog.paymentInfo.gatewayStatus || "?"}{" "}
                        {selectedLog.paymentInfo.transactionId &&
                          `txn=${selectedLog.paymentInfo.transactionId}`}
                      </p>
                    )}
                    {selectedLog.errorMessage && (
                      <p className="text-red-400 mb-3">ERROR: {selectedLog.errorMessage}</p>
                    )}
                    {selectedLog.logs.map((entry, i) => (
                      <div key={i} className="mb-1.5">
                        <span className="text-gray-600">{formatTs(entry.timestamp)} </span>
                        <span className={levelColor(entry.level)}>[{entry.level.toUpperCase()}]</span>{" "}
                        <span className="text-gray-200">{entry.message}</span>
                        {entry.data != null && (
                          <pre className="text-gray-500 mt-0.5 ml-4 whitespace-pre-wrap break-all">
                            {JSON.stringify(entry.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                    {selectedLog.orderId && (
                      <p className="text-gray-600 mt-4">
                        → /admin/orders (search orderId: {selectedLog.orderId})
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-sm p-6 text-center">
                  Select a log entry to view full trace
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
