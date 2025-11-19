'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Copy,
    Terminal,
    Code,
    PlayCircle,
    Monitor,
    Server,
    FileText,
    ChevronRight,
    ExternalLink,
    Download,
    Zap,
    Shield,
    Globe,
    Settings,
    BookOpen,
    Video,
    CheckCircle,
    AlertCircle,
    Info,
    Loader2,
    Command,
    Clock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Script data structure
const scriptCategories = {
    ubuntu: {
        title: "Ubuntu 22.04 LTS",
        description: "Proxy setup scripts for Ubuntu servers",
        icon: <img src="/ubuntu.png" className="w-8 h-8 rounded-lg" alt="Ubuntu" />,
        scripts: [
            {
                id: "ubuntu-3128",
                title: "Standard Proxy Setup",
                description: "Install Squid proxy server on default port 3128",
                port: "3128",
                difficulty: "Beginner",
                estimatedTime: "2-3 minutes",
                code: `wget https://raw.githubusercontent.com/serverok/squid-proxy-installer/master/squid3-install.sh
sudo bash squid3-install.sh
squid-add-user`,
                steps: [
                    "Downloads the Squid installer script",
                    "Installs and configures Squid proxy",
                    "Creates proxy user credentials"
                ]
            },
            {
                id: "ubuntu-5515",
                title: "Custom Port 5515",
                description: "Setup proxy server on port 5515 for enhanced security",
                port: "5515",
                difficulty: "Intermediate",
                estimatedTime: "3-4 minutes",
                code: `wget -O squid5515-install.sh https://raw.githubusercontent.com/serverok/squid-proxy-installer/master/squid3-install.sh
sudo bash squid5515-install.sh
sudo sed -i 's/http_port 3128/http_port 5515/g' /etc/squid/squid.conf
sudo systemctl restart squid
squid-add-user`,
                steps: [
                    "Downloads and renames the installer",
                    "Installs Squid proxy server",
                    "Changes port from 3128 to 5515",
                    "Restarts the service",
                    "Creates user credentials"
                ]
            },
            {
                id: "ubuntu-8000",
                title: "Alternative Port 8000",
                description: "Configure proxy on port 8000 for web development",
                port: "8000",
                difficulty: "Intermediate",
                estimatedTime: "3-4 minutes",
                code: `wget -O squid8000-install.sh https://raw.githubusercontent.com/serverok/squid-proxy-installer/master/squid3-install.sh
sudo bash squid8000-install.sh
sudo sed -i 's/http_port 3128/http_port 8000/g' /etc/squid/squid.conf
sudo systemctl restart squid
squid-add-user`,
                steps: [
                    "Downloads and renames the installer",
                    "Installs Squid proxy server",
                    "Changes port from 3128 to 8000",
                    "Restarts the service",
                    "Creates user credentials"
                ]
            }
        ]
    },
    centos: {
        title: "CentOS 7",
        description: "Proxy setup scripts for CentOS/RHEL servers",
        icon: <img src="/centos.png" className="w-8 h-8 rounded-lg" alt="CentOS" />,
        scripts: [
            {
                id: "centos-3128",
                title: "CentOS Proxy Setup",
                description: "Install Squid proxy server on CentOS 7",
                port: "3128",
                difficulty: "Intermediate",
                estimatedTime: "4-5 minutes",
                code: `sudo curl -o /etc/yum.repos.d/CentOS-Base.repo https://raw.githubusercontent.com/XSUP4EME/cents/main/CentOS-Base.repo
sudo yum install wget
wget https://raw.githubusercontent.com/icharisofcc/proxy/master/spi
chmod +x spi
sudo ./spi -rhel7`,
                steps: [
                    "Updates YUM repositories",
                    "Installs wget package",
                    "Downloads the SPI installer",
                    "Makes the installer executable",
                    "Runs installation for RHEL7"
                ]
            }
        ]
    }
};

// Copy-to-clipboard function
const copyToClipboard = (text: string, title?: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${title || 'Script'} copied to clipboard!`);
};

const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
        case 'Beginner':
            return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
        case 'Intermediate':
            return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
        case 'Advanced':
            return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
        default:
            return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-800';
    }
};

const ScriptsPage = () => {
    const [selectedScript, setSelectedScript] = useState<string | null>(null);
    const [showTerminal, setShowTerminal] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const router = useRouter();

    return (
        <div className='min-h-screen bg-background'>
            {/* Mobile Header */}
            <div className="lg:hidden h-16" />

            {/* Modern Header */}
            <div className='container mx-auto px-4 sm:px-6 lg:px-8 py-6 -mt-16 md:mt-0'>
                <div className='flex flex-col gap-6'>
                    {/* Header Content */}
                    <div className='flex items-start justify-between gap-4'>
                        <div className='flex-1'>
                            <div className='flex items-center gap-3 mb-3'>
                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Terminal className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h1 className='text-2xl sm:text-3xl font-bold'>Setup Scripts</h1>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        One-click installation scripts for your proxy server
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant={showTerminal ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowTerminal(!showTerminal)}
                            className="gap-2"
                        >
                            <Terminal className="h-4 w-4" />
                            Web Terminal
                        </Button>
                        <Button
                            variant={showTutorial ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowTutorial(!showTutorial)}
                            className="gap-2"
                        >
                            <Video className="h-4 w-4" />
                            Video Guide
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push('/support/tickets')}
                            className="gap-2"
                        >
                            <BookOpen className="h-4 w-4" />
                            Get Help
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className='container mx-auto px-4 sm:px-6 lg:px-8 py-6'>
                {/* Terminal Section */}
                {showTerminal && (
                    <Card className="mb-6 border-border">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Terminal className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-semibold">Web Terminal</CardTitle>
                                        <CardDescription>Access your server directly from the browser</CardDescription>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowTerminal(false)}
                                    className="h-8 w-8 rounded-lg"
                                >
                                    <span className="text-xl">×</span>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-lg overflow-hidden border border-border shadow-sm" style={{ height: '500px' }}>
                                <iframe
                                    src="https://sshterminal.advps.store/"
                                    className="w-full h-full"
                                    title="SSH Terminal"
                                />
                            </div>
                            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border border-border">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <Info className="h-4 w-4 text-primary" />
                                </div>
                                <div className="text-sm">
                                    <p className="font-semibold mb-2 text-foreground">Quick Start Guide:</p>
                                    <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                                        <li>Enter your server's IP address</li>
                                        <li>Use username: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-xs">root</code></li>
                                        <li>Enter your server password</li>
                                        <li>Copy and paste the scripts below</li>
                                    </ol>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Tutorial Section */}
                {showTutorial && (
                    <Card className="mb-6 border-border">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Video className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-semibold">Video Tutorial</CardTitle>
                                        <CardDescription>Step-by-step guide for proxy setup</CardDescription>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowTutorial(false)}
                                    className="h-8 w-8 rounded-lg"
                                >
                                    <span className="text-xl">×</span>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Tutorial Steps */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border border-border">
                                    <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">1</div>
                                    <div>
                                        <p className="font-semibold text-sm">Download PuTTY</p>
                                        <p className="text-xs text-muted-foreground">Install SSH client</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border border-border">
                                    <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">2</div>
                                    <div>
                                        <p className="font-semibold text-sm">Connect to Server</p>
                                        <p className="text-xs text-muted-foreground">Use root credentials</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border border-border">
                                    <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">3</div>
                                    <div>
                                        <p className="font-semibold text-sm">Run Scripts</p>
                                        <p className="text-xs text-muted-foreground">Execute proxy setup</p>
                                    </div>
                                </div>
                            </div>

                            {/* Video Player */}
                            <div className="rounded-lg overflow-hidden border border-border shadow-sm" style={{ height: '400px' }}>
                                <video
                                    src='/tutorial.mp4'
                                    controls
                                    autoPlay
                                    className='w-full h-full object-cover'
                                    poster="/video-thumbnail.jpg"
                                />
                            </div>

                            {/* Tutorial Text */}
                            <div className="p-4 bg-muted/50 rounded-lg border border-border">
                                <h4 className="font-semibold mb-3 text-foreground">Detailed Setup Instructions:</h4>
                                <div className="text-sm space-y-2">
                                    <p className="text-muted-foreground">Follow these simple steps to set up your proxy server:</p>
                                    <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                                        <li>Download and install PuTTY SSH client software</li>
                                        <li>Open PuTTY and enter your server's IP address</li>
                                        <li>Click "Open" to connect</li>
                                        <li>Login with username: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-xs">root</code></li>
                                        <li>Enter the password provided with your Linux server</li>
                                        <li>Copy and paste the setup script from below</li>
                                        <li>Wait for the installation to complete</li>
                                        <li>Your proxy server will be ready to use!</li>
                                    </ol>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Script Categories */}
                <div className="space-y-10">
                    {Object.entries(scriptCategories).map(([categoryKey, category]) => (
                        <div key={categoryKey}>
                            {/* Category Header */}
                            <div className="flex items-center gap-4 mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center border border-border">
                                        {category.icon}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">{category.title}</h2>
                                        <p className="text-sm text-muted-foreground mt-0.5">{category.description}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Scripts Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {category.scripts.map((script) => (
                                    <Card
                                        key={script.id}
                                        className={cn(
                                            "border-border hover:shadow-md transition-all duration-200 cursor-pointer",
                                            selectedScript === script.id && "ring-2 ring-primary"
                                        )}
                                        onClick={() => setSelectedScript(selectedScript === script.id ? null : script.id)}
                                    >
                                        <CardHeader className="pb-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 space-y-3">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <h3 className="text-lg font-semibold">{script.title}</h3>
                                                            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                                                                Port {script.port}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground">
                                                            {script.description}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-xs bg-muted">
                                                            {script.difficulty}
                                                        </Badge>
                                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <Clock className="h-3.5 w-3.5" />
                                                            {script.estimatedTime}
                                                        </div>
                                                    </div>
                                                </div>
                                                <ChevronRight
                                                    className={cn(
                                                        "h-5 w-5 text-muted-foreground transition-transform flex-shrink-0 mt-1",
                                                        selectedScript === script.id && "rotate-90"
                                                    )}
                                                />
                                            </div>
                                        </CardHeader>

                                        {selectedScript === script.id && (
                                            <CardContent className="pt-0 space-y-5">
                                                {/* Steps */}
                                                <div className="p-4 bg-muted/50 rounded-lg border border-border">
                                                    <h4 className="font-semibold mb-3 text-sm flex items-center gap-2">
                                                        <CheckCircle className="h-4 w-4 text-primary" />
                                                        What this script does:
                                                    </h4>
                                                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                                                        {script.steps.map((step, index) => (
                                                            <li key={index}>{step}</li>
                                                        ))}
                                                    </ol>
                                                </div>

                                                {/* Code Block */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-sm font-semibold flex items-center gap-2">
                                                            <Command className="h-4 w-4 text-primary" />
                                                            Installation Script
                                                        </Label>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyToClipboard(script.code, script.title);
                                                            }}
                                                            className="gap-2 h-9"
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                            Copy Script
                                                        </Button>
                                                    </div>
                                                    <div className="relative rounded-lg overflow-hidden border border-border bg-slate-950 dark:bg-slate-950">
                                                        <div className="absolute top-0 left-0 right-0 h-8 bg-slate-900 dark:bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-2">
                                                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                            <span className="ml-2 text-xs text-slate-400 font-mono">terminal</span>
                                                        </div>
                                                        <pre className="p-4 pt-12 overflow-x-auto text-sm font-mono text-green-400">
                                                            <code className="whitespace-pre-wrap">
                                                                {script.code}
                                                            </code>
                                                        </pre>
                                                    </div>
                                                </div>

                                                {/* Usage Instructions */}
                                                <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                        <Info className="h-4 w-4 text-primary" />
                                                    </div>
                                                    <div className="text-sm">
                                                        <p className="font-semibold text-foreground mb-1.5">
                                                            How to use:
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Connect to your server via SSH and paste this script.
                                                            After installation, you can use your server's IP and port {script.port} as a proxy.
                                                        </p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Need Help Section */}
                <Card className="mt-10 border-border">
                    <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row items-start gap-6">
                            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <BookOpen className="h-7 w-7 text-primary" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-semibold mb-2">
                                    Need Assistance?
                                </h3>
                                <p className="text-muted-foreground mb-5">
                                    If you're having trouble with the installation or need help setting up your proxy server,
                                    our support team is ready to assist you. Watch the tutorial video or open a support ticket.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowTutorial(true)}
                                        className="gap-2"
                                    >
                                        <Video className="h-4 w-4" />
                                        Watch Tutorial
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => router.push('/support/tickets')}
                                        className="gap-2"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Contact Support
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ScriptsPage;
