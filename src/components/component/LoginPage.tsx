'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Star,
  Shield,
  Zap,
  Globe,
  Clock,
  Server,
  DollarSign,
  Eye,
  EyeOff,
  LogIn,
  Activity,
  Users,
  Gauge
} from 'lucide-react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import Link from 'next/link';

const benefits = [
  {
    icon: Server,
    title: "Access Your VPS",
    description: "Manage your Linux servers with our intuitive dashboard"
  },
  {
    icon: Activity,
    title: "Real-Time Monitoring",
    description: "Track performance, uptime, and resource usage instantly"
  },
  {
    icon: Shield,
    title: "Security Controls",
    description: "Manage firewall rules, SSH keys, and security settings"
  },
  {
    icon: Zap,
    title: "One-Click Actions",
    description: "Start, stop, reboot, and manage your servers effortlessly"
  },
  {
    icon: Gauge,
    title: "Performance Analytics",
    description: "Detailed insights into your server's performance metrics"
  },
  {
    icon: Users,
    title: "Team Management",
    description: "Collaborate with your team on server management tasks"
  }
];

const recentUpdates = [
  { title: "New Control Panel Features", status: "New" },
  { title: "Enhanced Security Monitoring", status: "Updated" },
  { title: "Improved Performance Metrics", status: "Enhanced" },
  { title: "Mobile Dashboard Support", status: "Beta" }
];

function LoginPage({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const response = await fetch('/api/users/me');
      if (response.ok) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, []);

  const handleSubmit = async (event: any) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (response.ok) {
      router.push('/dashboard');
    } else {
      setError(data.message || 'Invalid email or password.');
    }
    setIsLoading(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src='/bg.gif'
          className='absolute inset-0 w-full h-full object-cover opacity-20'
          alt="Background"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/90 to-background/95"></div>
      </div>

      <div className={cn("relative z-10 min-h-screen grid md:grid-cols-2", className)} {...props}>
        {/* Left Content */}
        <div className="hidden lg:flex flex-col justify-center p-12 ">
          <div className="max-w-2xl">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-8">
              <img 
                src="/ol.png" 
                className="h-16 w-auto transition-all duration-200 hover:scale-105" 
                alt="OceanLinux"
              />
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-l from-primary to-foreground bg-clip-text text-transparent">
                  OceanLinux
                </h1>
                <p className="text-sm text-muted-foreground">The Ocean of Linux</p>
              </div>
            </div>

            {/* Main Content */}
            <div className="space-y-6">
              <div className="space-y-4">
                <Badge className="inline-flex items-center gap-2 px-4 py-2">
                  <Activity className="w-4 h-4" />
                  Welcome Back to Your Dashboard
                </Badge>

                <h2 className="text-4xl xl:text-5xl font-bold leading-tight">
                  Manage Your
                  <span className="text-gradient block">Linux Empire</span>
                </h2>

                <p className="text-xl text-muted-foreground leading-relaxed">
                  Access your powerful dashboard to monitor, manage, and optimize your
                  Linux VPS servers with enterprise-grade tools and insights.
                </p>
              </div>

              {/* Dashboard Preview Stats */}
              <div className="grid grid-cols-2 gap-6 p-6 bg-muted/30 rounded-xl border dark:border-none">
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-green-500">Online</div>
                  <p className="text-sm text-muted-foreground">All Systems</p>
                </div>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-blue-500">24/7</div>
                  <p className="text-sm text-muted-foreground">Monitoring</p>
                </div>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-purple-500">99.9%</div>
                  <p className="text-sm text-muted-foreground">Uptime</p>
                </div>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-orange-500">Instant</div>
                  <p className="text-sm text-muted-foreground">Actions</p>
                </div>
              </div>

              {/* What You Can Do */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">🚀 What You Can Do</h3>
                <div className="grid grid-cols-1 gap-3">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <benefit.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">{benefit.title}</h4>
                        <p className="text-xs text-muted-foreground">{benefit.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Updates */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">✨ Recent Updates</h3>
                <div className="space-y-2">
                  {recentUpdates.map((update, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg">
                      <span className="text-sm">{update.title}</span>
                      <Badge size="sm" variant="secondary">{update.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trust Indicators */}
              <div className="flex items-center gap-6 pt-4 border dark:border-none-t border dark:border-none ">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="w-4 h-4 text-green-500" />
                  <span>Secure Login</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span>Always Available</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-purple-500" />
                  <span>Trusted Platform</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Login Form */}
        <div className="w-full  flex items-center md:-mt-[80%] justify-center p-6 ">
          <div className="w-full max-w-md">
            <Card className="shadow-2xl border dark:border-none-2">
              {/* Logo for mobile */}
              <div className='flex justify-center items-center pt-6 lg:hidden'>
                <div className='flex items-center gap-3'>
                  <img
                    src="/ol.png"
                    className='h-12 w-auto'
                    alt="OceanLinux"
                  />
                  <div>
                    <h1 className='text-2xl font-bold bg-gradient-to-l from-primary to-foreground bg-clip-text text-transparent'>
                      OceanLinux
                    </h1>
                    <p className="text-xs text-muted-foreground -mt-1">The Ocean of Linux</p>
                  </div>
                </div>
              </div>

              <CardHeader className="space-y-4">
                <div className="space-y-2">
                  <CardTitle className="text-2xl xl:text-3xl">Welcome Back</CardTitle>
                  <CardDescription className="text-base">
                    Sign in to access your Linux VPS dashboard
                  </CardDescription>
                </div>

                {/* Quick Access Benefits */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>Instant access to your servers</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>Real-time monitoring dashboard</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>Advanced management tools</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-red-50 border dark:border-none border dark:border-none-red-200 rounded-lg">
                      <p className="text-red-600 text-sm">{error}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        placeholder="email@example.com"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="h-12"
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="Enter your password"
                          value={formData.password}
                          onChange={e => setFormData({ ...formData, password: e.target.value })}
                          className="h-12 pr-10"
                          disabled={isLoading}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-12 px-3"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-semibold"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <div className="w-4 h-4 mr-2  dark:border-none-2  dark:border-none-current border dark:border-none-t-transparent rounded-full animate-spin" />
                          Signing In...
                        </>
                      ) : (
                        <>
                          <LogIn className="w-4 h-4 mr-2" />
                          Login to Dashboard
                        </>
                      )}
                    </Button>
                  </div>
                </form>

                <div className="mt-6 space-y-4">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border dark:border-none-t  dark:border-none -border " />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg- mb-2 px-2 text-muted-foreground">
                        Don't have an account?
                      </span>
                    </div>
                  </div>

                  <Link href="/get-started">
                    <Button variant="outline" className="w-full h-12">
                      <Star className="w-4 h-4 mr-2" />
                      Create New Account
                    </Button>
                  </Link>
                </div>

                <div className="mt-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    Secure login protected by enterprise-grade encryption
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Mobile Benefits */}
            <div className="lg:hidden mt-8 space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-4">Your Dashboard Awaits</h3>
                <div className="grid grid-cols-2 gap-3">
                  {benefits.slice(0, 4).map((benefit, index) => (
                    <div key={index} className="p-3 bg-muted/30 rounded-lg">
                      <benefit.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                      <h4 className="text-xs font-semibold">{benefit.title}</h4>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
