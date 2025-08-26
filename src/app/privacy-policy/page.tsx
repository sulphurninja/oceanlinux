import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import { 
    Shield, 
    Lock, 
    Eye, 
    Server, 
    Mail, 
    CreditCard,
    Users,
    FileText,
    AlertTriangle,
    CheckCircle,
    Globe,
    Database
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
    return (
        <>
            <Header />
            
            {/* Hero Section */}
            <section className="section-padding gradient- relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center"></div>
                </div>
                
                <div className="container mx-auto container-padding relative z-10 text-center">
                    <div className="max-w-4xl mx-auto animate-slide-up">
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
                            <Shield className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-sm font-medium text-white">Your Privacy • Our Priority</span>
                        </div>
                        
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            Privacy Policy
                            <span className="text-gradient block">Transparency & Trust</span>
                        </h1>
                        
                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            At OceanLinux, your privacy is critically important to us. This policy explains how we collect, 
                            use, and protect your personal information when you use our affordable Linux hosting services.
                        </p>

                        <div className="flex items-center justify-center gap-6 text-white/70">
                            <div className="flex items-center gap-2">
                                <Lock className="w-4 h-4" />
                                <span className="text-sm">Secure Data</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                <span className="text-sm">Full Transparency</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span className="text-sm">GDPR Compliant</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Privacy Content */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto space-y-12">
                        
                        {/* Information We Collect */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Database className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">1. Information We Collect</h2>
                                        <p className="text-muted-foreground mb-4">
                                            To provide our affordable Linux hosting services, we collect the following information:
                                        </p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-lg">Personal Information</h3>
                                        <ul className="space-y-2 text-muted-foreground">
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Name and contact details
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Email address
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Billing information
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Account preferences
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-lg">Service Information</h3>
                                        <ul className="space-y-2 text-muted-foreground">
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Server usage logs
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Performance metrics
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Support interactions
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Security monitoring data
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* How We Use Your Information */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Server className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">2. How We Use Your Information</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Your information helps us deliver the best affordable Linux hosting experience:
                                        </p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-3 gap-6">
                                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                                        <Users className="w-8 h-8 text-primary mx-auto mb-2" />
                                        <h3 className="font-semibold mb-2">Account Management</h3>
                                        <p className="text-sm text-muted-foreground">Create and manage your hosting accounts</p>
                                    </div>
                                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                                        <CreditCard className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                        <h3 className="font-semibold mb-2">Payment Processing</h3>
                                        <p className="text-sm text-muted-foreground">Process transactions securely</p>
                                    </div>
                                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                                        <Shield className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                                        <h3 className="font-semibold mb-2">Security Enhancement</h3>
                                        <p className="text-sm text-muted-foreground">Protect your servers and data</p>
                                    </div>
                                </div>

                                <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                                        <div>
                                            <p className="font-semibold text-green-800 dark:text-green-300">Our Commitment</p>
                                            <p className="text-sm text-green-700 dark:text-green-400">
                                                We do not sell, rent, or share your personal data with third parties for marketing purposes.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Payment Information */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <CreditCard className="w-6 h-6 text-green-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">3. Payment Information & Processing</h2>
                                        <p className="text-muted-foreground mb-4">
                                            We use trusted payment gateways to ensure your financial data is secure:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-4 border rounded-lg">
                                            <h3 className="font-semibold mb-3">Secure Payment Gateways</h3>
                                            <ul className="space-y-2 text-sm text-muted-foreground">
                                                <li>• <strong>Razorpay:</strong> PCI DSS compliant payment processing</li>
                                                <li>• <strong>Cashfree:</strong> Bank-grade security for transactions</li>
                                                <li>• <strong>UPI Gateway:</strong> Secure UPI and digital wallet payments</li>
                                            </ul>
                                        </div>
                                        <div className="p-4 border rounded-lg">
                                            <h3 className="font-semibold mb-3">Data Protection</h3>
                                            <ul className="space-y-2 text-sm text-muted-foreground">
                                                <li>• Your payment data is encrypted and tokenized</li>
                                                <li>• We do not store your full card details</li>
                                                <li>• All transactions are monitored for fraud</li>
                                                <li>• Compliance with RBI guidelines</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <Shield className="w-5 h-5 text-blue-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-blue-800 dark:text-blue-300">Payment Gateway Privacy</p>
                                                <p className="text-sm text-blue-700 dark:text-blue-400">
                                                    When you make payments, our payment gateway partners (Razorpay, Cashfree, UPI Gateway) 
                                                    collect and process payment information according to their respective privacy policies 
                                                    and PCI DSS compliance standards.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Security Measures */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Lock className="w-6 h-6 text-purple-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">4. Security Measures</h2>
                                        <p className="text-muted-foreground mb-4">
                                            We implement industry-leading security measures to protect your data:
                                        </p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-green-500/10 rounded-full flex items-center justify-center">
                                                <Lock className="w-4 h-4 text-green-500" />
                                            </div>
                                            <div>
                                                <p className="font-semibold">Advanced Encryption</p>
                                                <p className="text-sm text-muted-foreground">SSL/TLS encryption for all data transmission</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center">
                                                <Server className="w-4 h-4 text-blue-500" />
                                            </div>
                                            <div>
                                                <p className="font-semibold">Secure Infrastructure</p>
                                                <p className="text-sm text-muted-foreground">Data centers with physical security controls</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-purple-500/10 rounded-full flex items-center justify-center">
                                                <Shield className="w-4 h-4 text-purple-500" />
                                            </div>
                                            <div>
                                                <p className="font-semibold">Access Controls</p>
                                                <p className="text-sm text-muted-foreground">Restricted access to authorized personnel only</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-orange-500/10 rounded-full flex items-center justify-center">
                                                <Eye className="w-4 h-4 text-orange-500" />
                                            </div>
                                            <div>
                                                <p className="font-semibold">Monitoring</p>
                                                <p className="text-sm text-muted-foreground">24/7 security monitoring and threat detection</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Data Sharing & Third Parties */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Globe className="w-6 h-6 text-orange-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">5. Third-Party Services & Data Sharing</h2>
                                        <p className="text-muted-foreground mb-4">
                                            We work with trusted partners to deliver our services:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-4 border-l-4 border-green-500 bg-green-500/5">
                                        <h3 className="font-semibold text-green-800 dark:text-green-300">Limited Data Sharing</h3>
                                        <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                                            We only share your data when necessary for service delivery, legal compliance, or with your consent.
                                        </p>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="p-4 bg-muted/30 rounded-lg">
                                            <h4 className="font-semibold mb-2">Payment Processing</h4>
                                            <p className="text-sm text-muted-foreground">
                                                Payment gateways process transactions according to their privacy policies and security standards.
                                            </p>
                                        </div>
                                        <div className="p-4 bg-muted/30 rounded-lg">
                                            <h4 className="font-semibold mb-2">Infrastructure Partners</h4>
                                            <p className="text-sm text-muted-foreground">
                                                Cloud and hosting infrastructure providers help us deliver reliable services.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Your Rights */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-6 h-6 text-indigo-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">6. Your Privacy Rights</h2>
                                        <p className="text-muted-foreground mb-4">
                                            You have control over your personal information:
                                        </p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-3">
                                            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">Access Your Data</p>
                                                <p className="text-sm text-muted-foreground">Request a copy of your personal information</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">Update Information</p>
                                                <p className="text-sm text-muted-foreground">Correct or update your personal details</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">Data Portability</p>
                                                <p className="text-sm text-muted-foreground">Export your data in a common format</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">Delete Data</p>
                                                <p className="text-sm text-muted-foreground">Request deletion of your personal information</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <Eye className="w-5 h-5 text-blue-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">Restrict Processing</p>
                                                <p className="text-sm text-muted-foreground">Limit how we use your data</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <Mail className="w-5 h-5 text-purple-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">Communication Preferences</p>
                                                <p className="text-sm text-muted-foreground">Control marketing communications</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Contact Information */}
                        <Card className="bg-primary/5 border-primary/20">
                            <CardContent className="p-8 text-center">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Mail className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-2xl font-bold mb-4">Questions About Your Privacy?</h2>
                                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                                    If you have any questions about this privacy policy, need to exercise your privacy rights, 
                                    or have concerns about how we handle your data, please don't hesitate to contact us.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <Link href="mailto:hello@oceanlinux.com">
                                        <Button size="lg" className="px-8">
                                            <Mail className="w-4 h-4 mr-2" />
                                            hello@oceanlinux.com
                                        </Button>
                                    </Link>
                                    <Link href="/contact-us">
                                        <Button size="lg" variant="outline" className="px-8">
                                            Visit Contact Page
                                        </Button>
                                    </Link>
                                </div>
                                <p className="text-sm text-muted-foreground mt-4">
                                    We typically respond to privacy inquiries within 48 hours
                                </p>
                            </CardContent>
                        </Card>

                        {/* Last Updated */}
                        <div className="text-center pt-8 border-t">
                            <p className="text-sm text-muted-foreground">
                                <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                })}
                            </p>
                            <p className="text-sm text-muted-foreground mt-2">
                                We may update this privacy policy from time to time. We'll notify you of any significant changes.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}