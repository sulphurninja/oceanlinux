import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import {
    FileText,
    Users,
    Shield,
    CreditCard,
    Server,
    AlertTriangle,
    CheckCircle,
    Mail,
    Scale,
    Clock,
    Ban,
    Zap
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TermsConditions() {
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
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border dark:border-none border dark:border-none-white/20 mb-6">
                            <Scale className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-sm font-medium text-white">Legal Framework • Fair Usage</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            Terms & Conditions
                            <span className="text-gradient block">Clear Rules, Fair Service</span>
                        </h1>

                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            By using OceanLinux's affordable Linux hosting services, you agree to these terms.
                            We've made them clear and straightforward - because transparency matters.
                        </p>

                        <div className="flex items-center justify-center gap-6 text-white/70">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-sm">Fair Terms</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span className="text-sm">User Protection</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                <span className="text-sm">Clear Guidelines</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Terms Content */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto space-y-12">

                        {/* Account Registration */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Users className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">1. Account Registration & Eligibility</h2>
                                        <p className="text-muted-foreground mb-4">
                                            To access our affordable Linux hosting services, you must create an account with accurate information.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-lg">Registration Requirements</h3>
                                            <ul className="space-y-2 text-muted-foreground">
                                                <li className="flex items-center gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                                    Provide accurate and complete information
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                                    Must be 18+ years old or have guardian consent
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                                    Valid email address for account verification
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                                    Keep account credentials secure
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-lg">Account Responsibility</h3>
                                            <ul className="space-y-2 text-muted-foreground">
                                                <li className="flex items-center gap-2">
                                                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                                                    You're responsible for all account activity
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                                                    Notify us immediately of unauthorized access
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                                                    One account per person/organization
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                                                    Update information when it changes
                                                </li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-red-500/10 border dark:border-none border dark:border-none-red-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <Ban className="w-5 h-5 text-red-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-red-800 dark:text-red-300">Account Termination</p>
                                                <p className="text-sm text-red-700 dark:text-red-400">
                                                    Accounts with fraudulent information or involved in illegal activities
                                                    will be terminated immediately without prior notice.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Service Usage */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Server className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">2. Acceptable Service Usage</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Our Linux hosting services are designed for legitimate business and personal use.
                                            Here's what's allowed and what's not:
                                        </p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-green-500/10 border dark:border-none border dark:border-none-green-500/20 rounded-lg">
                                            <h3 className="font-semibold text-green-800 dark:text-green-300 mb-3">✅ Allowed Uses</h3>
                                            <ul className="space-y-2 text-sm text-green-700 dark:text-green-400">
                                                <li>• Web hosting and applications</li>
                                                <li>• Development and testing environments</li>
                                                <li>• Database hosting</li>
                                                <li>• File storage and backup</li>
                                                <li>• API and microservices</li>
                                                <li>• E-commerce platforms</li>
                                                <li>• Educational and research projects</li>
                                            </ul>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-red-500/10 border dark:border-none border dark:border-none-red-500/20 rounded-lg">
                                            <h3 className="font-semibold text-red-800 dark:text-red-300 mb-3">❌ Prohibited Uses</h3>
                                            <ul className="space-y-2 text-sm text-red-700 dark:text-red-400">
                                                <li>• Illegal activities or content</li>
                                                <li>• Hacking, phishing, or malware</li>
                                                <li>• Spam or unsolicited emails</li>
                                                <li>• Copyright infringement</li>
                                                <li>• Cryptocurrency mining</li>
                                                <li>• Resource-intensive attacks</li>
                                                <li>• Proxy or VPN services (unless approved)</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 p-4 bg-orange-500/10 border dark:border-none border dark:border-none-orange-500/20 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <Shield className="w-5 h-5 text-orange-500 mt-0.5" />
                                        <div>
                                            <p className="font-semibold text-orange-800 dark:text-orange-300">Fair Usage Policy</p>
                                            <p className="text-sm text-orange-700 dark:text-orange-400">
                                                While we offer generous resources, excessive usage that affects other users may result in
                                                account review and potential limitations.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Payments & Billing */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <CreditCard className="w-6 h-6 text-green-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">3. Payments, Billing & Refunds</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Clear payment terms for our affordable Linux hosting services:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-3 gap-6">
                                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                                            <Clock className="w-8 h-8 text-primary mx-auto mb-2" />
                                            <h3 className="font-semibold mb-2">Payment Schedule</h3>
                                            <p className="text-sm text-muted-foreground">All payments must be made in advance</p>
                                        </div>
                                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                                            <Shield className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                            <h3 className="font-semibold mb-2">Secure Processing</h3>
                                            <p className="text-sm text-muted-foreground">Multiple secure payment gateways</p>
                                        </div>
                                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                                            <Zap className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                                            <h3 className="font-semibold mb-2">Instant Activation</h3>
                                            <p className="text-sm text-muted-foreground">Services activated upon payment</p>
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-4 border dark:border-none rounded-lg">
                                            <h3 className="font-semibold mb-3">Payment Methods</h3>
                                            <ul className="space-y-2 text-sm text-muted-foreground">
                                                <li>• <strong>Razorpay:</strong> Credit/Debit cards, Net Banking, UPI</li>
                                                <li>• <strong>Cashfree:</strong> All major Indian payment methods</li>
                                                <li>• <strong>UPI Gateway:</strong> UPI and digital wallets</li>
                                                <li>• All transactions are secure and encrypted</li>
                                            </ul>
                                        </div>
                                        <div className="p-4 border dark:border-none rounded-lg">
                                            <h3 className="font-semibold mb-3">Billing & Renewals</h3>
                                            <ul className="space-y-2 text-sm text-muted-foreground">
                                                <li>• Monthly/Annual billing cycles available</li>
                                                <li>• Auto-renewal can be enabled/disabled</li>
                                                <li>• No Grace period for renewals</li>
                                                <li>• Notifications sent before expiry</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-blue-500/10 border dark:border-none border dark:border-none-blue-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <CreditCard className="w-5 h-5 text-blue-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-blue-800 dark:text-blue-300">Refund Policy</p>
                                                <p className="text-sm text-blue-700 dark:text-blue-400">
                                                    7-day money-back guarantee for new customers. Refunds processed through original payment method.
                                                    Pro-rated refunds available for annual plans upon justified cancellation.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Service Availability */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Server className="w-6 h-6 text-purple-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">4. Service Availability & Support</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Our commitment to reliable, affordable Linux hosting:
                                        </p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-lg">Service Level Agreement</h3>
                                        <ul className="space-y-2 text-muted-foreground">
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                99.9% uptime guarantee
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                24/7 monitoring and support
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Regular maintenance windows
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                Automatic backups included
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-lg">Support Services</h3>
                                        <ul className="space-y-2 text-muted-foreground">
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-blue-500" />
                                                Technical support via email & chat
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-blue-500" />
                                                Knowledge base and documentation
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-blue-500" />
                                                Server management assistance
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-blue-500" />
                                                Migration support for new customers
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Suspension & Termination */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Ban className="w-6 h-6 text-red-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">5. Account Suspension & Termination</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Circumstances under which services may be suspended or terminated:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-4 bg-orange-500/10 border dark:border-none border dark:border-none-orange-500/20 rounded-lg">
                                            <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-3">Suspension Reasons</h3>
                                            <ul className="space-y-2 text-sm text-orange-700 dark:text-orange-400">
                                                <li>• Non-payment of invoices</li>
                                                <li>• Violation of acceptable use policy</li>
                                                <li>• Excessive resource usage</li>
                                                <li>• Suspected fraudulent activity</li>
                                                <li>• Legal compliance requirements</li>
                                            </ul>
                                        </div>
                                        <div className="p-4 bg-red-500/10 border dark:border-none border dark:border-none-red-500/20 rounded-lg">
                                            <h3 className="font-semibold text-red-800 dark:text-red-300 mb-3">Termination Reasons</h3>
                                            <ul className="space-y-2 text-sm text-red-700 dark:text-red-400">
                                                <li>• Repeated violations of terms</li>
                                                <li>• Illegal activities or content</li>
                                                <li>• Extended non-payment (30+ days)</li>
                                                <li>• Security threats to infrastructure</li>
                                                <li>• Customer request for cancellation</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-blue-500/10 border dark:border-none border dark:border-none-blue-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <Shield className="w-5 h-5 text-blue-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-blue-800 dark:text-blue-300">Fair Process</p>
                                                <p className="text-sm text-blue-700 dark:text-blue-400">
                                                    We'll attempt to notify you before suspension when possible. You can contact us to resolve issues.
                                                    Data backup grace period of 7 days after termination for most cases.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Limitation of Liability */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Scale className="w-6 h-6 text-indigo-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">6. Limitation of Liability</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Understanding responsibilities and limitations:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-4 bg-muted/30 rounded-lg">
                                        <h3 className="font-semibold mb-2">Service Disclaimer</h3>
                                        <p className="text-sm text-muted-foreground">
                                            While we strive for 99.9% uptime and reliable service, we cannot guarantee uninterrupted service.
                                            We are not liable for indirect damages, data loss, or business interruption beyond our service credits.
                                        </p>
                                    </div>
                                    <div className="p-4 bg-muted/30 rounded-lg">
                                        <h3 className="font-semibold mb-2">Data Responsibility</h3>
                                        <p className="text-sm text-muted-foreground">
                                            You are responsible for maintaining backups of your data. While we provide backup services,
                                            you should maintain independent backups of critical data.
                                        </p>
                                    </div>
                                    <div className="p-4 bg-muted/30 rounded-lg">
                                        <h3 className="font-semibold mb-2">Maximum Liability</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Our maximum liability is limited to the amount paid for services in the affected billing period,
                                            typically provided as service credits or refunds.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Contact & Updates */}
                        <Card className="bg-primary/5 border dark:border-none-primary/20">
                            <CardContent className="p-8 text-center">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Mail className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-2xl font-bold mb-4">Questions About These Terms?</h2>
                                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                                    If you have any questions about these terms and conditions, need clarification on any policies,
                                    or want to discuss your specific use case, please contact us.
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
                                            Contact Support
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Last Updated */}
                        <div className="text-center pt-8 border dark:border-none-t">
                            <p className="text-sm text-muted-foreground">
                                <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </p>
                            <p className="text-sm text-muted-foreground mt-2">
                                These terms may be updated periodically. Continued use of our services constitutes acceptance of any changes.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}
