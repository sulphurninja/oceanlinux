import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Globe,
  Activity,
  Calendar,
  Server,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import PublicPageHero from "@/components/landing/PublicPageHero";
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader";

const serviceStatus = [
  { name: "Web Hosting Services", status: "operational", uptime: "99.98%", responseTime: "245ms", lastChecked: "2 minutes ago" },
  { name: "Linux VPS Servers", status: "operational", uptime: "99.99%", responseTime: "189ms", lastChecked: "1 minute ago" },
  { name: "DNS Services", status: "operational", uptime: "100%", responseTime: "12ms", lastChecked: "30 seconds ago" },
  { name: "Control Panel", status: "operational", uptime: "99.97%", responseTime: "432ms", lastChecked: "1 minute ago" },
  { name: "Email Services", status: "operational", uptime: "99.95%", responseTime: "156ms", lastChecked: "3 minutes ago" },
  { name: "Backup Systems", status: "maintenance", uptime: "99.92%", responseTime: "678ms", lastChecked: "5 minutes ago" },
];

const datacenters = [
  { name: "Mumbai, India", region: "AS-South", status: "operational", uptime: "99.99%", load: "23%" },
  { name: "Bangalore, India", region: "AS-South", status: "operational", uptime: "99.98%", load: "31%" },
  { name: "Delhi, India", region: "AS-North", status: "operational", uptime: "99.97%", load: "28%" },
];

const recentIncidents = [
  {
    date: "2024-12-20",
    title: "Scheduled Maintenance — Backup Systems",
    status: "ongoing",
    severity: "maintenance",
    description: "Routine maintenance on backup infrastructure. No impact on live services expected.",
    duration: "2 hours (estimated)",
  },
  {
    date: "2024-12-18",
    title: "Network Latency Issues Resolved",
    status: "resolved",
    severity: "minor",
    description: "Brief network latency increase in Mumbai region. Issue was resolved within 15 minutes.",
    duration: "15 minutes",
  },
  {
    date: "2024-12-15",
    title: "DNS Propagation Delays",
    status: "resolved",
    severity: "minor",
    description: "Some users experienced DNS propagation delays. Root cause identified and fixed.",
    duration: "45 minutes",
  },
];

type StatusKey = "operational" | "maintenance" | "degraded" | "outage" | "ongoing" | "resolved";

function StatusIcon({ status }: { status: string }) {
  const cls = "w-5 h-5 shrink-0";
  switch (status) {
    case "operational":
    case "resolved":
      return <CheckCircle className={`${cls} text-emerald-400`} />;
    case "maintenance":
    case "ongoing":
      return <Clock className={`${cls} text-amber-400`} />;
    case "degraded":
      return <AlertTriangle className={`${cls} text-amber-400`} />;
    case "outage":
      return <XCircle className={`${cls} text-red-400`} />;
    default:
      return <CheckCircle className={`${cls} text-emerald-400`} />;
  }
}

function StatusBadge({ status }: { status: StatusKey | string }) {
  const styles: Record<string, string> = {
    operational: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20",
    maintenance: "text-amber-300 bg-amber-500/10 border-amber-400/20",
    degraded: "text-amber-300 bg-amber-500/10 border-amber-400/20",
    outage: "text-red-300 bg-red-500/10 border-red-400/20",
    ongoing: "text-sky-300 bg-sky-500/10 border-sky-400/20",
    resolved: "text-white/50 bg-white/5 border-white/10",
  };
  const labels: Record<string, string> = {
    operational: "Operational",
    maintenance: "Maintenance",
    degraded: "Degraded",
    outage: "Outage",
    ongoing: "Ongoing",
    resolved: "Resolved",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium border ${styles[status] ?? styles.operational}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function ServerStatus() {
  const allOperational = serviceStatus.every((s) => s.status === "operational" || s.status === "maintenance");

  return (
    <>
      <PublicPageHero
        eyebrow="System Status"
        title="All Systems"
        titleAccent="Operational"
        description="Monitor the real-time status of OceanLinux services and infrastructure. Stay informed about incidents, maintenance, and performance updates."
        badge={
          <span className="premium-chip inline-flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Real-Time Status · 24/7 Monitoring · Transparent Updates
          </span>
        }
      >
        <div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">99.9% Uptime</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Real-Time Updates</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Global Monitoring</span>
          </div>
        </div>
      </PublicPageHero>

      <section className="premium-page-section">
        <div className="container mx-auto container-padding max-w-4xl">
          {/* Overall banner */}
          <div className="premium-highlight-box mb-10 text-center">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
              <div className="premium-icon-box w-12 h-12 rounded-full">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {allOperational ? "All Systems Operational" : "Partial Service Impact"}
                </h2>
                <p className="text-sm text-white/50">
                  {allOperational ? "No known issues affecting live services" : "Some services may be affected — see details below"}
                </p>
              </div>
            </div>
            <div className="premium-hero-stats--compact">
              <div className="premium-stat-card py-3">
                <div className="premium-stat-value text-xl">99.98%</div>
                <div className="text-xs text-white/45 mt-1">Overall Uptime</div>
              </div>
              <div className="premium-stat-card py-3">
                <div className="premium-stat-value text-xl">245ms</div>
                <div className="text-xs text-white/45 mt-1">Avg Response</div>
              </div>
              <div className="premium-stat-card py-3">
                <div className="premium-stat-value text-xl">24/7</div>
                <div className="text-xs text-white/45 mt-1">Monitoring</div>
              </div>
            </div>
          </div>

          <PremiumSectionHeader
            eyebrow="Services"
            title="Service"
            titleAccent="Status"
            description="Live status of all OceanLinux platform services."
            align="left"
          />

          <div className="space-y-3 mb-14">
            {serviceStatus.map((service) => (
              <div
                key={service.name}
                className="premium-glass-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusIcon status={service.status} />
                  <div>
                    <h3 className="font-semibold text-white text-sm">{service.name}</h3>
                    <p className="text-xs text-white/40">Last checked: {service.lastChecked}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <StatusBadge status={service.status} />
                  <span className="text-xs text-white/45">{service.uptime} uptime</span>
                  <span className="text-xs text-white/45">{service.responseTime} response</span>
                </div>
              </div>
            ))}
          </div>

          <PremiumSectionHeader
            eyebrow="Infrastructure"
            title="Provider"
            titleAccent="Regions"
            description="Status across upstream provider regions serving OceanLinux customers."
            align="left"
          />

          <div className="grid md:grid-cols-3 gap-4 mb-14">
            {datacenters.map((dc) => (
              <div key={dc.name} className="premium-glass-card p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="premium-icon-box w-9 h-9 shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">{dc.name}</h3>
                      <p className="text-xs text-white/40">{dc.region}</p>
                    </div>
                  </div>
                  <StatusIcon status={dc.status} />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-white/45">
                    <span>Uptime</span>
                    <span className="text-white/80 font-medium">{dc.uptime}</span>
                  </div>
                  <div className="flex justify-between text-white/45">
                    <span>Load</span>
                    <span className="text-white/80 font-medium">{dc.load}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <PremiumSectionHeader
            eyebrow="History"
            title="Recent"
            titleAccent="Incidents"
            description="Past and ongoing incidents with transparent updates."
            align="left"
          />

          <div className="space-y-4 mb-10">
            {recentIncidents.map((incident) => (
              <div key={incident.title} className="premium-glass-card p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-white text-sm mb-1">{incident.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{incident.date}</span>
                      <span>·</span>
                      <span>Duration: {incident.duration}</span>
                    </div>
                  </div>
                  <StatusBadge status={incident.status} />
                </div>
                <p className="text-sm text-white/50 leading-relaxed">{incident.description}</p>
              </div>
            ))}
          </div>

          <div className="premium-cta-box">
            <div className="premium-icon-box w-12 h-12 mx-auto mb-4 rounded-full">
              <Server className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Experiencing an Issue?</h2>
            <p className="text-sm text-white/50 mb-5 max-w-md mx-auto">
              If you&apos;re affected by a service disruption, contact our support team for assistance.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/live-chat">
                <Button className="premium-btn-primary w-full sm:w-auto px-6 h-11">
                  Start Live Chat
                </Button>
              </Link>
              <Link href="/contact-us">
                <Button variant="outline" className="premium-btn-outline w-full sm:w-auto px-6 h-11">
                  Contact Support
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
