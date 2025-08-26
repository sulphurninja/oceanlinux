'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  RefreshCw,
  Rocket,
  Crown,
  Eye,
  EyeOff
} from 'lucide-react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import Link from 'next/link';

const features = [
  {
    icon: DollarSign,
    title: "Most Affordable Pricing",
    description: "Premium Linux VPS starting at just ₹599/month - 40% cheaper than competitors"
  },
  {
    icon: Server,
    title: "Enterprise Hardware",
    description: "Latest Intel Xeon CPUs, NVMe SSD storage, and DDR4 ECC memory"
  },
  {
    icon: Shield,
    title: "Advanced Security",
    description: "DDoS protection, enterprise-grade firewalls, and 24/7 monitoring"
  },
  {
    icon: Zap,
    title: "Instant Deployment",
    description: "Your Linux VPS is ready in under 5 minutes with automated setup"
  },
  {
    icon: Globe,
    title: "Global Network",
    description: "Premium IP ranges and global data centers for optimal performance"
  },
  {
    icon: CheckCircle,
    title: "99.9% Uptime SLA",
    description: "Reliable infrastructure with industry-leading uptime guarantee"
  }
];

const plans = [
  { name: "🔄 Gold Series", price: "₹599", popular: false, color: "amber" },
  { name: "🚀 Nova Linux", price: "₹799", popular: true, color: "blue" },
  { name: "🔋 Power Linux", price: "₹899", popular: false, color: "yellow" },
  { name: "🔰 Titan Series", price: "₹1299", popular: false, color: "purple" }
];

function GetStartedPage({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Get plan from URL params
    const plan = searchParams.get('plan');
    if (plan) {
      setSelectedPlan(plan);
    }

    // Check if user is already logged in
    const checkUser = async () => {
      const response = await fetch('/api/users/me');
      if (response.ok) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, [searchParams]);

  const handleSubmit = async (event: any) => {
    event.preventDefault();
    const response = await fetch('/api/signup', {
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
      setError(data.message || 'An error occurred during signup.');
    }
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

      <div className={cn("relative z-10 min-h-screen flex", className)} {...props}>
        {/* Left Content */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center p-12 xl:p-16">
          <div className="max-w-2xl">
            {/* Brand */}
            <div className="flex items-center space-x-3 mb-8">
              <div className="relative">
                <img src="/oceanlinux.png" className="h-16" alt="OceanLinux" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  OceanLinux
                </h1>
                <p className="text-sm text-muted-foreground">The Ocean of Linux</p>
              </div>
            </div>

            {/* Main Content */}
            <div className="space-y-6">
              <div className="space-y-4">
                <Badge className="inline-flex items-center gap-2 px-4 py-2">
                  <Star className="w-4 h-4" />
                  Most Affordable Premium Linux VPS
                </Badge>
                
                <h2 className="text-4xl xl:text-5xl font-bold leading-tight">
                  Start Your
                  <span className="text-gradient block">Linux Journey Today</span>
                </h2>
                
                <p className="text-xl text-muted-foreground leading-relaxed">
                  Join thousands of developers and businesses who chose OceanLinux for 
                  reliable, affordable, and high-performance Linux VPS hosting.
                </p>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-primary">5000+</div>
                  <p className="text-sm text-muted-foreground">Happy Customers</p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-green-500">99.9%</div>
                  <p className="text-sm text-muted-foreground">Uptime SLA</p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-blue-500">40%</div>
                  <p className="text-sm text-muted-foreground">Cost Savings</p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-purple-500">24/7</div>
                  <p className="text-sm text-muted-foreground">Expert Support</p>
                </div>
              </div>

              {/* Popular Plans Preview */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">🔥 Popular Linux VPS Plans</h3>
                <div className="grid grid-cols-2 gap-3">
                  {plans.map((plan, index) => (
                    <div 
                      key={index}
                      className={`p-3 rounded-lg border ${plan.popular ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{plan.name}</span>
                        <span className="text-sm font-bold text-primary">{plan.price}/mo</span>
                      </div>
                      {plan.popular && (
                        <Badge className="mt-1" size="sm">Most Popular</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Features */}
              <div className="grid grid-cols-2 gap-4">
                {features.slice(0, 6).map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <feature.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">{feature.title}</h4>
                      <p className="text-xs text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Trust Indicators */}
              <div className="flex items-center gap-6 pt-4 border-t border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="w-4 h-4 text-green-500" />
                  <span>SSL Secured</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span>5-Min Setup</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-purple-500" />
                  <span>30-Day Guarantee</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Signup Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            <Card className="shadow-2xl border-2">
              {/* Logo for mobile */}
              <div className='flex justify-center items-center pt-6 lg:hidden'>
                <div className='text-center'>
                  <DotLottieReact
                    src="/linux.lottie"
                    loop
                    autoplay
                    className='h-16'
                  />
                  <h1 className='text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent'>
                    OceanLinux
                  </h1>
                  <p className="text-xs text-muted-foreground">The Ocean of Linux</p>
                </div>
              </div>

              <CardHeader className="space-y-4">
                <div className="space-y-2">
                  <CardTitle className="text-2xl xl:text-3xl">Create Account</CardTitle>
                  <CardDescription className="text-base">
                    Start your Linux VPS journey in minutes
                  </CardDescription>
                </div>

                {selectedPlan && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Selected Plan: {selectedPlan.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                    </div>
                  </div>
                )}

                {/* Benefits */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>7-day money-back guarantee</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>Instant VPS deployment</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>24/7 expert support included</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-600 text-sm">{error}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        type="text"
                        required
                        placeholder="Enter your full name"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="h-12"
                      />
                    </div>

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
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="Create a strong password"
                          value={formData.password}
                          onChange={e => setFormData({ ...formData, password: e.target.value })}
                          className="h-12 pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-12 px-3"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Must be at least 8 characters long
                      </p>
                    </div>

                    <Button type="submit" className="w-full h-12 text-base font-semibold">
                      <Zap className="w-4 h-4 mr-2" />
                      Create Account & Deploy VPS
                    </Button>
                  </div>
                </form>

                <div className="mt-6 space-y-4">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border/50" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-background px-2 text-muted-foreground">
                        Already have an account?
                      </span>
                    </div>
                  </div>

                  <Link href="/login">
                    <Button variant="outline" className="w-full h-12">
                      Sign In to Your Account
                    </Button>
                  </Link>
                </div>

                <div className="mt-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    By creating an account, you agree to our{" "}
                    <Link href="/terms-and-conditions" className="text-primary hover:underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy-policy" className="text-primary hover:underline">
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Mobile Features */}
            <div className="lg:hidden mt-8 space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-4">Why Choose OceanLinux?</h3>
                <div className="grid grid-cols-2 gap-3">
                  {features.slice(0, 4).map((feature, index) => (
                    <div key={index} className="p-3 bg-muted/30 rounded-lg">
                      <feature.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                      <h4 className="text-xs font-semibold">{feature.title}</h4>
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

export default GetStartedPage;