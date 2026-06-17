"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

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

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
    </div>
  );
}
