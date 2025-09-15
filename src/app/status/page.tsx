import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    Clock,
    Server,
    Globe,
    Wifi,
    Database,
    Shield,
    Zap,
    Activity,
    Calendar
} from "lucide-react";

const serviceStatus = [
    {
        name: "Web Hosting Services",
        status: "operational",
        uptime: "99.98%",
        responseTime: "245ms",
        lastChecked: "2 minutes ago"
    },
    {
        name: "Linux VPS Servers",
        status: "operational",
        uptime: "99.99%",
        responseTime: "189ms",
        lastChecked: "1 minute ago"
    },
    {
        name: "DNS Services",
        status: "operational",
        uptime: "100%",
        responseTime: "12ms",
        lastChecked: "30 seconds ago"
    },
    {
        name: "Control Panel",
        status: "operational",
        uptime: "99.97%",
        responseTime: "432ms",
        lastChecked: "1 minute ago"
    },
    {
        name: "Email Services",
        status: "operational",
        uptime: "99.95%",
        responseTime: "156ms",
        lastChecked: "3 minutes ago"
    },
    {
        name: "Backup Systems",
        status: "maintenance",
        uptime: "99.92%",
        responseTime: "678ms",
        lastChecked: "5 minutes ago"
    }
];

const datacenters = [
    {
        name: "Mumbai, India",
        region: "AS-South",
        status: "operational",
        uptime: "99.99%",
        load: "23%"
    },
    {
        name: "Bangalore, India",
        region: "AS-South",
        status: "operational",
        uptime: "99.98%",
        load: "31%"
    },
    {
        name: "Delhi, India",
        region: "AS-North",
        status: "operational",
        uptime: "99.97%",
        load: "28%"
    }
];

const recentIncidents = [
    {
        date: "2024-12-20",
        title: "Scheduled Maintenance - Backup Systems",
        status: "ongoing",
        severity: "maintenance",
        description: "Routine maintenance on backup infrastructure. No impact on live services expected.",
        duration: "2 hours (estimated)"
    },
    {
        date: "2024-12-18",
        title: "Network Latency Issues Resolved",
        status: "resolved",
        severity: "minor",
        description: "Brief network latency increase in Mumbai datacenter. Issue was resolved within 15 minutes.",
        duration: "15 minutes"
    },
    {
        date: "2024-12-15",
        title: "DNS Propagation Delays",
        status: "resolved",
        severity: "minor",
        description: "Some users experienced DNS propagation delays. Root cause identified and fixed.",
        duration: "45 minutes"
    }
];

const getStatusIcon = (status: string) => {
    switch (status) {
        case 'operational':
            return <CheckCircle className="w-5 h-5 text-green-500" />;
        case 'maintenance':
            return <Clock className="w-5 h-5 text-orange-500" />;
        case 'degraded':
            return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
        case 'outage':
            return <XCircle className="w-5 h-5 text-red-500" />;
        default:
            return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
};

const getStatusBadge = (status: string) => {
    switch (status) {
        case 'operational':
            return <Badge className="bg-green-100 text-green-800 border dark:border-none-green-200">Operational</Badge>;
        case 'maintenance':
            return <Badge className="bg-orange-100 text-orange-800 border dark:border-none-orange-200">Maintenance</Badge>;
        case 'degraded':
            return <Badge className="bg-yellow-100 text-yellow-800 border dark:border-none-yellow-200">Degraded</Badge>;
        case 'outage':
            return <Badge className="bg-red-100 text-red-800 border dark:border-none-red-200">Outage</Badge>;
        case 'ongoing':
            return <Badge className="bg-blue-100 text-blue-800 border dark:border-none-blue-200">Ongoing</Badge>;
        case 'resolved':
            return <Badge className="bg-gray-100 text-gray-800 border dark:border-none-gray-200">Resolved</Badge>;
        default:
            return <Badge>Unknown</Badge>;
    }
};

const getSeverityColor = (severity: string) => {
    switch (severity) {
        case 'critical':
            return 'border dark:border-none-l-red-500';
        case 'major':
            return 'border dark:border-none-l-orange-500';
        case 'minor':
            return 'border dark:border-none-l-yellow-500';
        case 'maintenance':
            return 'border dark:border-none-l-blue-500';
        default:
            return 'border dark:border-none-l-gray-500';
    }
};

export default function ServerStatus() {
    return (
        <>
            <Header />

            {/* Hero Section */}
            <section className="section-padding bg-background - relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center"></div>
                </div>

                <div className="container mx-auto container-padding relative z-10 text-center">
                    <div className="max-w-4xl mx-auto animate-slide-up">
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border dark:border-none border dark:border-none-white/20 mb-6">
                            <Activity className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-sm font-medium text-white">Real-Time Status • 24/7 Monitoring • Transparent Updates</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            📋 System Status
                            <span className="text-gradient block">All Systems Operational</span>
                        </h1>

                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            Monitor the real-time status of all OceanLinux services and infrastructure.
                            Stay informed about any incidents, maintenance, or performance updates.
                        </p>

                        <div className="flex items-center justify-center gap-6 text-white/70">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-sm">99.9% Uptime</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span className="text-sm">Real-Time Updates</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                <span className="text-sm">Global Monitoring</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    {/* Overall Status */}
                    <div className="max-w-4xl mx-auto mb-12">
                        <Card className="mb-8 bg-green-50 border dark:border-none-green-200">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-center gap-3">
                                    <CheckCircle className="w-8 h-8 text-green-600" />
                                    <div className="text-center">
                                        <h2 className="text-2xl font-bold text-green-800">All Systems Operational</h2>
                                        <p className="text-green-600">No known issues at this time</p>
                                    </div>
                                </div>
                                <div className="flex justify-center gap-8 mt-6 text-sm">
                                    <div className="text-center">
                                        <div className="font-bold text-green-800">99.98%</div>
                                        <div className="text-green-600">Overall Uptime</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-bold text-green-800">245ms</div>
                                        <div className="text-green-600">Avg Response</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-bold text-green-800">24/7</div>
                                        <div className="text-green-600">Monitoring</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Service Status */}
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold mb-6">Service Status</h2>

                            <div className="grid gap-4">
                                {serviceStatus.map((service, index) => (
                                    <Card key={index}>
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    {getStatusIcon(service.status)}
                                                    <div>
                                                        <h3 className="font-semibold">{service.name}</h3>
                                                        <p className="text-sm text-muted-foreground">
                                                            Last checked: {service.lastChecked}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="flex items-center gap-4 mb-1">
                                                        {getStatusBadge(service.status)}
                                                        <span className="text-sm text-muted-foreground">
                                                            {service.uptime} uptime
                                                        </span>
                                                        <span className="text-sm text-muted-foreground">
                                                            {service.responseTime} response
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        {/* Datacenter Status */}
                        {/* <div className="mt-12">
                            <h2 className="text-2xl font-bold mb-6">Datacenter Status</h2>

                            <div className="grid md:grid-cols-3 gap-6">
                                {datacenters.map((dc, index) => (
                                    <Card key={index}>
                                        <CardContent className="p-6">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    <Globe className="w-5 h-5 text-primary" />
                                                    <div>
                                                        <h3 className="font-semibold">{dc.name}</h3>
                                                        <p className="text-sm text-muted-foreground">{dc.region}</p>
                                                    </div>
                                                </div>
                                                {getStatusIcon(dc.status)}
                                            </div>

                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span>Uptime:</span>
                                                    <span className="font-medium">{dc.uptime}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Load:</span>
                                                    <span className="font-medium">{dc.load}</span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div> */}

                        {/* Recent Incidents */}
                        {/* <div className="mt-12">
                            <h2 className="text-2xl font-bold mb-6">Recent Incidents</h2>

                            <div className="space-y-4">
                                {recentIncidents.map((incident, index) => (
                                    <Card key={index} className={`border dark:border-none-l-4 ${getSeverityColor(incident.severity)}`}>
                                        <CardContent className="p-6">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h3 className="font-semibold mb-1">{incident.title}</h3>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                                        <Calendar className="w-4 h-4" />
                                                        <span>{incident.date}</span>
                                                        <span>•</span>
                                                        <span>Duration: {incident.duration}</span>
                                                    </div>
                                                </div>
                                                {getStatusBadge(incident.status)}
                                            </div>
                                            <p className="text-sm text-muted-foreground">{incident.description}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div> */}
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}
