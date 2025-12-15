'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Terminal,
    Server,
    CheckCircle,
    AlertCircle,
    Info,
    Loader2,
    Shield,
    Globe,
    Eye,
    EyeOff,
    Copy,
    Play,
    RefreshCw,
    Wifi,
    WifiOff,
    Settings,
    User,
    Key,
    ArrowRight,
    Sparkles,
    Zap,
    Video,
    BookOpen,
    ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type Step = 'credentials' | 'connecting' | 'proxy-setup' | 'complete';
type LogType = 'info' | 'success' | 'error' | 'command' | 'output';

interface LogEntry {
    type: LogType;
    message: string;
    timestamp: Date;
}

const ProxySetupTerminal = () => {
    const router = useRouter();
    const terminalRef = useRef<HTMLDivElement>(null);

    // Connection state
    const [step, setStep] = useState<Step>('credentials');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [progress, setProgress] = useState(0);

    // Server credentials
    const [serverIp, setServerIp] = useState('');
    const [serverUsername, setServerUsername] = useState('root');
    const [serverPassword, setServerPassword] = useState('');
    const [showServerPassword, setShowServerPassword] = useState(false);

    // Detected info
    const [detectedOs, setDetectedOs] = useState<string | null>(null);
    const [isSquidInstalled, setIsSquidInstalled] = useState(false);

    // Proxy credentials dialog
    const [showProxyDialog, setShowProxyDialog] = useState(false);
    const [proxyUsername, setProxyUsername] = useState('');
    const [proxyPassword, setProxyPassword] = useState('');
    const [showProxyPassword, setShowProxyPassword] = useState(false);

    // Final result
    const [proxyResult, setProxyResult] = useState<{
        ip: string;
        port: number;
        username: string;
        password: string;
        format: string;
    } | null>(null);

    // Terminal logs
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // Auto-scroll terminal
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    const addLog = (type: LogType, message: string) => {
        setLogs(prev => [...prev, { type, message, timestamp: new Date() }]);
    };

    const clearLogs = () => {
        setLogs([]);
    };

    const copyToClipboard = (text: string, label?: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label || 'Text'} copied to clipboard!`);
    };

    // Parse IP:Username:Password format
    const parseCredentials = (input: string) => {
        const parts = input.split(':');
        if (parts.length >= 3) {
            setServerIp(parts[0]);
            setServerUsername(parts[1]);
            setServerPassword(parts.slice(2).join(':')); // Handle passwords with colons
            toast.success('Credentials parsed successfully!');
        }
    };

    // Connect and detect OS
    const handleConnect = async () => {
        if (!serverIp || !serverUsername || !serverPassword) {
            toast.error('Please fill in all server credentials');
            return;
        }

        setIsConnecting(true);
        setStep('connecting');
        clearLogs();
        addLog('info', `Connecting to ${serverIp}...`);
        addLog('command', `ssh ${serverUsername}@${serverIp}`);

        try {
            const response = await fetch('/api/terminal/proxy-setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: serverIp,
                    username: serverUsername,
                    password: serverPassword,
                    action: 'detect'
                })
            });

            const data = await response.json();

            if (data.success) {
                setDetectedOs(data.os);
                setIsSquidInstalled(data.isSquidInstalled);
                addLog('success', `✓ Connected successfully!`);
                addLog('output', `Detected OS: ${data.os}`);
                addLog('output', `Squid proxy: ${data.isSquidInstalled ? 'Installed' : 'Not installed'}`);
                setStep('proxy-setup');
                
                // Show dialog for proxy credentials
                setTimeout(() => setShowProxyDialog(true), 500);
            } else {
                addLog('error', `✗ ${data.message}`);
                toast.error(data.message);
                setStep('credentials');
            }
        } catch (error: any) {
            addLog('error', `✗ Connection failed: ${error.message}`);
            toast.error('Failed to connect to server');
            setStep('credentials');
        } finally {
            setIsConnecting(false);
        }
    };

    // Setup proxy
    const handleSetupProxy = async () => {
        if (!proxyUsername || !proxyPassword) {
            toast.error('Please enter proxy username and password');
            return;
        }

        setShowProxyDialog(false);
        setIsSettingUp(true);
        setProgress(0);

        addLog('info', 'Starting proxy setup...');
        addLog('command', 'apt-get update / yum update');
        setProgress(10);

        try {
            // Simulate progress updates
            const progressInterval = setInterval(() => {
                setProgress(prev => Math.min(prev + 10, 90));
            }, 2000);

            addLog('info', `Installing Squid proxy server...`);
            setProgress(20);

            const response = await fetch('/api/terminal/proxy-setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: serverIp,
                    username: serverUsername,
                    password: serverPassword,
                    proxyUsername: proxyUsername,
                    proxyPassword: proxyPassword,
                    action: 'full-setup'
                })
            });

            clearInterval(progressInterval);

            const data = await response.json();

            if (data.success) {
                setProgress(100);
                addLog('success', '✓ Squid proxy installed');
                addLog('success', '✓ Configuration applied');
                addLog('success', `✓ User "${proxyUsername}" created`);
                addLog('success', '✓ Firewall port 3128 opened');
                addLog('success', '✓ Proxy server is running!');
                
                setProxyResult(data.proxyDetails);
                setStep('complete');
                toast.success('Proxy setup completed successfully!');
            } else {
                addLog('error', `✗ ${data.message}`);
                toast.error(data.message);
                setStep('proxy-setup');
            }
        } catch (error: any) {
            addLog('error', `✗ Setup failed: ${error.message}`);
            toast.error('Proxy setup failed');
            setStep('proxy-setup');
        } finally {
            setIsSettingUp(false);
        }
    };

    // Reset everything
    const handleReset = () => {
        setStep('credentials');
        setServerIp('');
        setServerUsername('root');
        setServerPassword('');
        setDetectedOs(null);
        setIsSquidInstalled(false);
        setProxyUsername('');
        setProxyPassword('');
        setProxyResult(null);
        setProgress(0);
        clearLogs();
    };

    const getLogIcon = (type: LogType) => {
        switch (type) {
            case 'success': return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
            case 'error': return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
            case 'command': return <Terminal className="h-3.5 w-3.5 text-blue-500" />;
            case 'output': return <ArrowRight className="h-3.5 w-3.5 text-gray-500" />;
            default: return <Info className="h-3.5 w-3.5 text-blue-400" />;
        }
    };

    const getLogColor = (type: LogType) => {
        switch (type) {
            case 'success': return 'text-green-400';
            case 'error': return 'text-red-400';
            case 'command': return 'text-yellow-400';
            case 'output': return 'text-gray-400';
            default: return 'text-blue-400';
        }
    };

    return (
        <div className='min-h-screen bg-background'>
            {/* Mobile Header Spacer */}
            <div className="lg:hidden h-16" />

            {/* Header */}
            <div className='container mx-auto px-4 sm:px-6 lg:px-8 py-6 -mt-16 md:mt-0'>
                <div className='flex flex-col gap-6'>
                    <div className='flex items-start justify-between gap-4'>
                        <div className='flex-1'>
                            <div className='flex items-center gap-3 mb-3'>
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
                                    <Terminal className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h1 className='text-2xl sm:text-3xl font-bold'>Proxy Setup Terminal</h1>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        One-click proxy server installation on port 3128
                                    </p>
                                </div>
                            </div>
                        </div>
                        {step !== 'credentials' && (
                            <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                Start Over
                            </Button>
                        )}
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-2">
                        <Badge variant={step === 'credentials' ? 'default' : 'secondary'} className="gap-1.5">
                            <User className="h-3 w-3" />
                            1. Server Credentials
                        </Badge>
                        <Badge variant={step === 'connecting' || step === 'proxy-setup' ? 'default' : 'secondary'} className="gap-1.5">
                            <Wifi className="h-3 w-3" />
                            2. Connect
                        </Badge>
                        <Badge variant={step === 'proxy-setup' && isSettingUp ? 'default' : 'secondary'} className="gap-1.5">
                            <Settings className="h-3 w-3" />
                            3. Setup Proxy
                        </Badge>
                        <Badge variant={step === 'complete' ? 'default' : 'secondary'} className="gap-1.5">
                            <CheckCircle className="h-3 w-3" />
                            4. Complete
                        </Badge>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className='container mx-auto px-4 sm:px-6 lg:px-8 py-6'>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column - Credentials & Controls */}
                    <div className="space-y-6">
                        {/* Credentials Card */}
                        <Card className="border-border">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Server className="h-5 w-5 text-primary" />
                                    Server Credentials
                                </CardTitle>
                                <CardDescription>
                                    Enter your Linux server details or paste IP:Username:Password
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Quick Paste Input */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-yellow-500" />
                                        Quick Paste (IP:Username:Password)
                                    </Label>
                                    <Input
                                        placeholder="103.85.118.123:root:yourpassword"
                                        onChange={(e) => parseCredentials(e.target.value)}
                                        disabled={step !== 'credentials'}
                                        className="font-mono text-sm"
                                    />
                                </div>

                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-card px-2 text-muted-foreground">Or enter manually</span>
                                    </div>
                                </div>

                                {/* Manual Entry */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="ip" className="flex items-center gap-2">
                                            <Globe className="h-4 w-4 text-muted-foreground" />
                                            Server IP Address
                                        </Label>
                                        <Input
                                            id="ip"
                                            value={serverIp}
                                            onChange={(e) => setServerIp(e.target.value)}
                                            placeholder="103.85.118.123"
                                            disabled={step !== 'credentials'}
                                            className="font-mono"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="username" className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            SSH Username
                                        </Label>
                                        <Input
                                            id="username"
                                            value={serverUsername}
                                            onChange={(e) => setServerUsername(e.target.value)}
                                            placeholder="root"
                                            disabled={step !== 'credentials'}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="password" className="flex items-center gap-2">
                                            <Key className="h-4 w-4 text-muted-foreground" />
                                            SSH Password
                                        </Label>
                                        <div className="relative">
                                            <Input
                                                id="password"
                                                type={showServerPassword ? 'text' : 'password'}
                                                value={serverPassword}
                                                onChange={(e) => setServerPassword(e.target.value)}
                                                placeholder="••••••••"
                                                disabled={step !== 'credentials'}
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3"
                                                onClick={() => setShowServerPassword(!showServerPassword)}
                                            >
                                                {showServerPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleConnect}
                                    disabled={!serverIp || !serverUsername || !serverPassword || isConnecting || step !== 'credentials'}
                                    className="w-full gap-2"
                                    size="lg"
                                >
                                    {isConnecting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-4 w-4" />
                                            Connect & Setup Proxy
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Result Card */}
                        {proxyResult && (
                            <Card className="border-green-500/50 bg-green-500/5">
                                <CardHeader className="pb-4">
                                    <CardTitle className="text-lg flex items-center gap-2 text-green-600 dark:text-green-400">
                                        <CheckCircle className="h-5 w-5" />
                                        Proxy Ready!
                                    </CardTitle>
                                    <CardDescription>
                                        Your proxy server is configured and running
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">IP Address</Label>
                                            <p className="font-mono text-sm font-medium">{proxyResult.ip}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Port</Label>
                                            <p className="font-mono text-sm font-medium">{proxyResult.port}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Username</Label>
                                            <p className="font-mono text-sm font-medium">{proxyResult.username}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Password</Label>
                                            <p className="font-mono text-sm font-medium">{proxyResult.password}</p>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-slate-900 rounded-lg">
                                        <Label className="text-xs text-gray-400 mb-2 block">Full Proxy String</Label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-green-400 font-mono text-sm break-all">
                                                {proxyResult.format}
                                            </code>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 flex-shrink-0"
                                                onClick={() => copyToClipboard(proxyResult.format, 'Proxy string')}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 gap-2"
                                            onClick={() => copyToClipboard(`${proxyResult.ip}:${proxyResult.port}`, 'IP:Port')}
                                        >
                                            <Copy className="h-4 w-4" />
                                            Copy IP:Port
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 gap-2"
                                            onClick={() => copyToClipboard(`${proxyResult.username}:${proxyResult.password}`, 'Credentials')}
                                        >
                                            <Copy className="h-4 w-4" />
                                            Copy Auth
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Info Card */}
                        <Card className="border-border">
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <Shield className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="text-sm">
                                        <p className="font-semibold mb-1">Supported Operating Systems</p>
                                        <p className="text-muted-foreground">
                                            Ubuntu 20.04/22.04, Debian 10/11, CentOS 7/8, Rocky Linux, AlmaLinux
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column - Terminal */}
                    <div className="space-y-4">
                        <Card className="border-border overflow-hidden">
                            <div className="bg-slate-900 dark:bg-slate-950">
                                {/* Terminal Header */}
                                <div className="h-10 bg-slate-800 dark:bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                    <span className="ml-3 text-xs text-slate-400 font-mono flex items-center gap-2">
                                        <Terminal className="h-3.5 w-3.5" />
                                        OceanLinux Terminal
                                    </span>
                                    {detectedOs && (
                                        <Badge variant="outline" className="ml-auto text-xs bg-slate-700 border-slate-600 text-slate-300">
                                            {detectedOs}
                                        </Badge>
                                    )}
                                </div>

                                {/* Terminal Body */}
                                <div
                                    ref={terminalRef}
                                    className="h-[400px] overflow-y-auto p-4 font-mono text-sm"
                                >
                                    {logs.length === 0 ? (
                                        <div className="text-slate-500 flex flex-col items-center justify-center h-full gap-3">
                                            <Terminal className="h-12 w-12 text-slate-600" />
                                            <p>Enter server credentials to begin</p>
                                            <p className="text-xs text-slate-600">
                                                Proxy will be installed on port 3128
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {logs.map((log, index) => (
                                                <div key={index} className="flex items-start gap-2">
                                                    <span className="text-slate-600 text-xs flex-shrink-0 w-16">
                                                        {log.timestamp.toLocaleTimeString('en-US', { hour12: false })}
                                                    </span>
                                                    {getLogIcon(log.type)}
                                                    <span className={cn("flex-1", getLogColor(log.type))}>
                                                        {log.message}
                                                    </span>
                                                </div>
                                            ))}
                                            {(isConnecting || isSettingUp) && (
                                                <div className="flex items-center gap-2 text-blue-400">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    <span className="animate-pulse">Processing...</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                {isSettingUp && (
                                    <div className="px-4 pb-4">
                                        <Progress value={progress} className="h-2" />
                                        <p className="text-xs text-slate-400 mt-2 text-center">
                                            Installing and configuring proxy server... {progress}%
                                        </p>
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* Help Card */}
                        <Card className="border-border">
                            <CardContent className="p-4">
                                <div className="flex flex-col sm:flex-row items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <BookOpen className="h-6 w-6 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold mb-1">Need Help?</h3>
                                        <p className="text-sm text-muted-foreground mb-3">
                                            Having trouble? Our support team is ready to assist you.
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => router.push('/support/tickets')}
                                            className="gap-2"
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                            Contact Support
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            {/* Proxy Credentials Dialog */}
            <Dialog open={showProxyDialog} onOpenChange={setShowProxyDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Shield className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <span>Create Proxy Credentials</span>
                                <p className="text-sm font-normal text-muted-foreground mt-0.5">
                                    Set up authentication for your proxy server
                                </p>
                            </div>
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        {detectedOs && (
                            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                                <img 
                                    src={detectedOs.includes('ubuntu') ? '/ubuntu.png' : '/centos.png'} 
                                    className="w-6 h-6 rounded" 
                                    alt={detectedOs}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                                <span className="text-sm">
                                    Detected: <strong className="capitalize">{detectedOs}</strong>
                                </span>
                                <Badge variant="outline" className="ml-auto text-xs">
                                    Port 3128
                                </Badge>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="proxyUser" className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                Proxy Username
                            </Label>
                            <Input
                                id="proxyUser"
                                value={proxyUsername}
                                onChange={(e) => setProxyUsername(e.target.value)}
                                placeholder="myproxyuser"
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                Choose a username for proxy authentication
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="proxyPass" className="flex items-center gap-2">
                                <Key className="h-4 w-4 text-muted-foreground" />
                                Proxy Password
                            </Label>
                            <div className="relative">
                                <Input
                                    id="proxyPass"
                                    type={showProxyPassword ? 'text' : 'password'}
                                    value={proxyPassword}
                                    onChange={(e) => setProxyPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3"
                                    onClick={() => setShowProxyPassword(!showProxyPassword)}
                                >
                                    {showProxyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Choose a strong password for security
                            </p>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            onClick={() => {
                                const randomUser = `user${Math.random().toString(36).slice(2, 8)}`;
                                const randomPass = Math.random().toString(36).slice(2, 14);
                                setProxyUsername(randomUser);
                                setProxyPassword(randomPass);
                                toast.success('Random credentials generated!');
                            }}
                        >
                            <Sparkles className="h-4 w-4" />
                            Generate Random Credentials
                        </Button>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowProxyDialog(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSetupProxy}
                            disabled={!proxyUsername || !proxyPassword}
                            className="gap-2"
                        >
                            <Play className="h-4 w-4" />
                            Install Proxy
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ProxySetupTerminal;
