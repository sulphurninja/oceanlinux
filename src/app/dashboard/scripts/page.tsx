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
        color: "bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800",
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
        color: "bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800",
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

            {/* Responsive Header */}
            <div className='sticky md:hidden lg:top-0 z-40 bg-background/95 backdrop-blur-sm shadow-sm border-b border-border'>
                <div className='container mx-auto -mt-14 md:mt-0 px-3 sm:px-4 md:px-6 lg:px-8'>
                    <div className='flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4'>
                        <div className='flex items-center gap-2 sm:gap-3 min-w-0 flex-1'>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.back()}
                                className="hover:bg-muted rounded-full flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
                            >
                                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                            <div className='flex items-center gap-2 sm:gap-3 min-w-0 flex-1'>
                                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Code className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h1 className='text-base sm:text-lg lg:text-xl font-bold'>Proxy Setup Scripts</h1>
                                    <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">Installation guides and tools</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowTerminal(!showTerminal)}
                                className={cn(
                                    "gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3 flex-shrink-0",
                                    showTerminal && "bg-primary text-primary-foreground"
                                )}
                            >
                                <Terminal className="h-3 w-3 sm:h-4 sm:w-4" />
                                <span className="hidden sm:inline text-xs sm:text-sm">Terminal</span>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowTutorial(!showTutorial)}
                                className={cn(
                                    "gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3 flex-shrink-0",
                                    showTutorial && "bg-primary text-primary-foreground"
                                )}
                            >
                                <Video className="h-3 w-3 sm:h-4 sm:w-4" />
                                <span className="hidden sm:inline text-xs sm:text-sm">Tutorial</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className='container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6'>
                {/* Terminal Section */}
                {showTerminal && (
                    <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                                        <Terminal className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Web Terminal</CardTitle>
                                        <CardDescription>Access your server directly from the browser</CardDescription>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowTerminal(false)}
                                    className="text-blue-600"
                                >
                                    ×
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-96 sm:h-[500px] rounded-lg overflow-hidden border border-blue-200 dark:border-blue-800">
                                <iframe
                                    src="https://sshterminal.advps.store/"
                                    className="w-full h-full"
                                    title="SSH Terminal"
                                />
                            </div>
                            <div className="mt-4 flex items-start gap-3 p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                                <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-700 dark:text-blue-300">
                                    <p className="font-semibold mb-1">How to connect:</p>
                                    <ol className="list-decimal list-inside space-y-1 text-xs">
                                        <li>Enter your server's IP address</li>
                                        <li>Use username: <code className="bg-blue-200 dark:bg-blue-800 px-1 rounded">root</code></li>
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
                    <Card className="mb-6 border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center">
                                        <Video className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Video Tutorial</CardTitle>
                                        <CardDescription>Step-by-step guide for proxy setup</CardDescription>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowTutorial(false)}
                                    className="text-green-600"
                                >
                                    ×
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Tutorial Steps */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div className="flex items-center gap-3 p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                                    <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
                                    <div>
                                        <p className="font-semibold text-sm">Download PuTTY</p>
                                        <p className="text-xs text-muted-foreground">Install SSH client</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                                    <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
                                    <div>
                                        <p className="font-semibold text-sm">Connect to Server</p>
                                        <p className="text-xs text-muted-foreground">Use root credentials</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                                    <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
                                    <div>
                                        <p className="font-semibold text-sm">Run Scripts</p>
                                        <p className="text-xs text-muted-foreground">Execute proxy setup</p>
                                    </div>
                                </div>
                            </div>

                            {/* Video Player */}
                            <div className="h-64 sm:h-96 rounded-lg overflow-hidden border border-green-200 dark:border-green-800">
                                <video
                                    src='/tutorial.mp4'
                                    controls
                                    autoPlay
                                    className='w-full h-full object-cover'
                                    poster="/video-thumbnail.jpg"
                                />
                            </div>

                            {/* Tutorial Text */}
                            <div className="p-4 bg-green-100 dark:bg-green-900/50 rounded-lg">
                                <h4 className="font-semibold mb-2 text-green-800 dark:text-green-200">Setup Instructions:</h4>
                                <div className="text-sm text-green-700 dark:text-green-300 space-y-2">
                                    <p>Follow these simple steps to set up your proxy server:</p>
                                    <ol className="list-decimal list-inside space-y-1 ml-4">
                                        <li>Download and install PuTTY SSH client software</li>
                                        <li>Open PuTTY and enter your server's IP address</li>
                                        <li>Click "Open" to connect</li>
                                        <li>Login with username: <code className="bg-green-200 dark:bg-green-800 px-1 rounded font-mono">root</code></li>
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

                {/* Scripts Overview */}


                {/* Script Categories */}
                <div className="space-y-8">
                    {Object.entries(scriptCategories).map(([categoryKey, category]) => (
                        <div key={categoryKey}>
                            {/* Category Header */}
                            <div className="flex items-center gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                    {category.icon}
                                    <div>
                                        <h3 className="text-xl font-bold">{category.title}</h3>
                                        <p className="text-sm text-muted-foreground">{category.description}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Scripts Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {category.scripts.map((script) => (
                                    <Card
                                        key={script.id}
                                        className={cn(
                                            "hover:shadow-lg transition-all duration-200 cursor-pointer",
                                            selectedScript === script.id ? "ring-2 ring-primary scale-[1.02]" : "hover:scale-[1.01]",
                                            category.color
                                        )}
                                        onClick={() => setSelectedScript(selectedScript === script.id ? null : script.id)}
                                    >
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <CardTitle className="text-lg flex items-center gap-2">
                                                        {script.title}
                                                        <Badge variant="outline" className="text-xs">
                                                            Port {script.port}
                                                        </Badge>
                                                    </CardTitle>
                                                    <CardDescription className="text-sm mt-1">
                                                        {script.description}
                                                    </CardDescription>
                                                </div>
                                                <ChevronRight
                                                    className={cn(
                                                        "h-5 w-5 transition-transform",
                                                        selectedScript === script.id && "rotate-90"
                                                    )}
                                                />
                                            </div>

                                            <div className="flex items-center gap-2 mt-3">
                                                <Badge className={getDifficultyColor(script.difficulty)}>
                                                    {script.difficulty}
                                                </Badge>
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {script.estimatedTime}
                                                </div>
                                            </div>
                                        </CardHeader>

                                        {selectedScript === script.id && (
                                            <CardContent className="pt-0">
                                                {/* Steps */}
                                                <div className="mb-4">
                                                    <h4 className="font-semibold mb-2 text-sm">What this script does:</h4>
                                                    <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                                                        {script.steps.map((step, index) => (
                                                            <li key={index}>{step}</li>
                                                        ))}
                                                    </ol>
                                                </div>

                                                {/* Code Block */}
                                                <div className="relative">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <Label className="text-sm font-semibold">Installation Script:</Label>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyToClipboard(script.code, script.title);
                                                            }}
                                                            className="gap-2 h-8"
                                                        >
                                                            <Copy className="h-3 w-3" />
                                                            Copy
                                                        </Button>
                                                    </div>
                                                    <pre className="bg-gray-900 dark:bg-gray-950 text-green-400 p-4 rounded-lg overflow-x-auto text-sm border">
                                                        <code className="whitespace-pre-wrap font-mono">
                                                            {script.code}
                                                        </code>
                                                    </pre>
                                                </div>

                                                {/* Usage Instructions */}
                                                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
                                                    <div className="flex items-start gap-2">
                                                        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                                        <div className="text-sm">
                                                            <p className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
                                                                How to use:
                                                            </p>
                                                            <p className="text-blue-700 dark:text-blue-300">
                                                                Connect to your server via SSH and paste this script.
                                                                After installation, you can use your server's IP and port {script.port} as a proxy.
                                                            </p>
                                                        </div>
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
                <Card className="mt-8 border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/50 rounded-lg flex items-center justify-center flex-shrink-0">
                                <BookOpen className="h-6 w-6 text-amber-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                                    Need Help?
                                </h3>
                                <p className="text-amber-700 dark:text-amber-300 mb-4 text-sm">
                                    If you're having trouble with the installation or need assistance setting up your proxy server,
                                    we're here to help! Watch the tutorial video above or contact our support team.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowTutorial(true)}
                                        className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300"
                                    >
                                        <Video className="h-4 w-4" />
                                        Watch Tutorial
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => router.push('/support/tickets')}
                                        className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300"
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
