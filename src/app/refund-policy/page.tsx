import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import {
    RefreshCw,
    Clock,
    Shield,
    CheckCircle,
    XCircle,
    AlertTriangle,
    CreditCard,
    Mail,
    Phone,
    Calendar,
    DollarSign,
    FileText,
    Zap
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RefundPolicy() {
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
                            <RefreshCw className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-sm font-medium text-white">7-Day Guarantee • Fair Refunds</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            Refund Policy
                            <span className="text-gradient block">Your Satisfaction, Our Priority</span>
                        </h1>

                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            We offer a 7-day money-back guarantee on all our affordable Linux hosting services.
                            Clear terms, fair process, and hassle-free refunds when you qualify.
                        </p>

                        <div className="flex items-center justify-center gap-6 text-white/70">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span className="text-sm">7-Day Window</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span className="text-sm">Fair Process</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-sm">Quick Processing</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Refund Policy Content */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto space-y-12">

                        {/* 7-Day Money Back Guarantee */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Clock className="w-6 h-6 text-green-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">1. 7-Day Money-Back Guarantee</h2>
                                        <p className="text-muted-foreground mb-4">
                                            We're confident in our affordable Linux hosting services. That's why we offer a
                                            comprehensive 7-day money-back guarantee for new customers.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-3 gap-6">
                                        <div className="text-center p-4 bg-green-500/10 rounded-lg border dark:border-none border dark:border-none-green-500/20">
                                            <Calendar className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                            <h3 className="font-semibold mb-2">7-Day Window</h3>
                                            <p className="text-sm text-muted-foreground">Full refund available within 7 days of purchase</p>
                                        </div>
                                        <div className="text-center p-4 bg-blue-500/10 rounded-lg border dark:border-none border dark:border-none-blue-500/20">
                                            <Zap className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                                            <h3 className="font-semibold mb-2">Quick Process</h3>
                                            <p className="text-sm text-muted-foreground">Refunds processed within 5-7 business days</p>
                                        </div>
                                        <div className="text-center p-4 bg-purple-500/10 rounded-lg border dark:border-none border dark:border-none-purple-500/20">
                                            <CreditCard className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                                            <h3 className="font-semibold mb-2">Original Method</h3>
                                            <p className="text-sm text-muted-foreground">Refunded to your original payment method</p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-green-500/10 border dark:border-none border dark:border-none-green-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <Shield className="w-5 h-5 text-green-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-green-800 dark:text-green-300">Our Commitment</p>
                                                <p className="text-sm text-green-700 dark:text-green-400">
                                                    We believe in our service quality. If you're not satisfied within the first 7 days,
                                                    we'll process your refund with no questions asked for valid reasons.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Refund Eligibility */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">2. Refund Eligibility & Qualifying Reasons</h2>
                                        <p className="text-muted-foreground mb-4">
                                            To ensure fair usage of our refund policy, here are the qualifying conditions and valid reasons:
                                        </p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-green-500/10 border dark:border-none border dark:border-none-green-500/20 rounded-lg">
                                            <h3 className="font-semibold text-green-800 dark:text-green-300 mb-3">✅ Valid Refund Reasons</h3>
                                            <ul className="space-y-2 text-sm text-green-700 dark:text-green-400">
                                                <li>• Service not delivered within promised timeframe</li>
                                                <li>• Technical issues unresolvable by our support</li>
                                                <li>• Service specifications don't match purchased plan</li>
                                                <li>• Server hardware failures affecting performance</li>
                                                <li>• Network connectivity issues on our end</li>
                                                <li>• Billing errors or duplicate charges</li>
                                                <li>• Account setup failures due to our systems</li>
                                            </ul>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-orange-500/10 border dark:border-none border dark:border-none-orange-500/20 rounded-lg">
                                            <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-3">📋 Eligibility Requirements</h3>
                                            <ul className="space-y-2 text-sm text-orange-700 dark:text-orange-400">
                                                <li>• Request must be within 7 days of purchase</li>
                                                <li>• Service must not have been extensively used</li>
                                                <li>• Valid reason as outlined above</li>
                                                <li>• Request submitted through official channels</li>
                                                <li>• Account must be in good standing</li>
                                                <li>• No violations of Terms of Service</li>
                                                <li>• Proper documentation if required</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Non-Refundable Circumstances */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <XCircle className="w-6 h-6 text-red-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">3. Non-Refundable Circumstances</h2>
                                        <p className="text-muted-foreground mb-4">
                                            To maintain fairness for all users, certain situations do not qualify for refunds:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-4 bg-red-500/10 border dark:border-none border dark:border-none-red-500/20 rounded-lg">
                                            <h3 className="font-semibold text-red-800 dark:text-red-300 mb-3">❌ Non-Refundable Situations</h3>
                                            <ul className="space-y-2 text-sm text-red-700 dark:text-red-400">
                                                <li>• Change of mind or buyer's remorse</li>
                                                <li>• Accidental purchases (due to user error)</li>
                                                <li>• Requests made after the 7-day period</li>
                                                <li>• Services extensively used or modified</li>
                                                <li>• Violation of Terms of Service</li>
                                                <li>• Third-party software licensing issues</li>
                                                <li>• Data loss due to user error</li>
                                                <li>• Dissatisfaction with Linux OS choice</li>
                                            </ul>
                                        </div>
                                        <div className="p-4 bg-orange-500/10 border dark:border-none border dark:border-none-orange-500/20 rounded-lg">
                                            <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-3">⚠️ Partial Refund Cases</h3>
                                            <ul className="space-y-2 text-sm text-orange-700 dark:text-orange-400">
                                                <li>• Annual plans with justified early cancellation</li>
                                                <li>• Downgrade requests within 7 days</li>
                                                <li>• Service migration to different plan</li>
                                                <li>• Pro-rated refunds for billing errors</li>
                                                <li>• Credit adjustments for service outages</li>
                                                <li>• Account suspensions due to policy violations</li>
                                                <li>• Force majeure circumstances</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-amber-500/10 border dark:border-none border dark:border-none-amber-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-amber-800 dark:text-amber-300">Fair Usage Policy</p>
                                                <p className="text-sm text-amber-700 dark:text-amber-400">
                                                    Our refund policy is designed to protect genuine customers. Abuse of this policy,
                                                    such as repeated refund requests or fraudulent claims, may result in account restrictions.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Refund Process */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-6 h-6 text-purple-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">4. How to Request a Refund</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Simple, straightforward process to request your refund within the 7-day window:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-4 gap-4">
                                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                                            <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">1</div>
                                            <h3 className="font-semibold text-sm mb-1">Contact Support</h3>
                                            <p className="text-xs text-muted-foreground">Email us within 7 days</p>
                                        </div>
                                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                                            <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">2</div>
                                            <h3 className="font-semibold text-sm mb-1">Provide Details</h3>
                                            <p className="text-xs text-muted-foreground">Order number & reason</p>
                                        </div>
                                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                                            <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">3</div>
                                            <h3 className="font-semibold text-sm mb-1">Review Process</h3>
                                            <p className="text-xs text-muted-foreground">24-48 hours review</p>
                                        </div>
                                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                                            <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">4</div>
                                            <h3 className="font-semibold text-sm mb-1">Refund Issued</h3>
                                            <p className="text-xs text-muted-foreground">5-7 business days</p>
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-4 border dark:border-none rounded-lg">
                                            <h3 className="font-semibold mb-3">Required Information</h3>
                                            <ul className="space-y-2 text-sm text-muted-foreground">
                                                <li>• Order number or transaction ID</li>
                                                <li>• Email address used for purchase</li>
                                                <li>• Detailed reason for refund request</li>
                                                <li>• Screenshots if reporting technical issues</li>
                                                <li>• Any support ticket numbers (if applicable)</li>
                                            </ul>
                                        </div>
                                        <div className="p-4 border dark:border-none rounded-lg">
                                            <h3 className="font-semibold mb-3">Processing Timeline</h3>
                                            <ul className="space-y-2 text-sm text-muted-foreground">
                                                <li>• <strong>Review:</strong> 24-48 hours for eligibility check</li>
                                                <li>• <strong>Approval:</strong> Email confirmation sent</li>
                                                <li>• <strong>Processing:</strong> 5-7 business days to original method</li>
                                                <li>• <strong>Bank Processing:</strong> Additional 2-3 days possible</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Cancellation Policy */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <AlertTriangle className="w-6 h-6 text-orange-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">5. Cancellation Policy</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Understanding how cancellations work and what happens to your data:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-4 bg-blue-500/10 border dark:border-none border dark:border-none-blue-500/20 rounded-lg">
                                            <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-3">Cancellation Rules</h3>
                                            <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-400">
                                                <li>• Cancel anytime through your dashboard</li>
                                                <li>• No refunds for time already used (after 7 days)</li>
                                                <li>• Service continues until end of billing period</li>
                                                <li>• Auto-renewal stops immediately upon cancellation</li>
                                                <li>• Final invoice sent for any outstanding amounts</li>
                                            </ul>
                                        </div>
                                        <div className="p-4 bg-amber-500/10 border dark:border-none border dark:border-none-amber-500/20 rounded-lg">
                                            <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-3">Data Handling</h3>
                                            <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-400">
                                                <li>• 7-day grace period for data backup</li>
                                                <li>• Download your data before expiration</li>
                                                <li>• Server wiped clean after grace period</li>
                                                <li>• Backup services stop with cancellation</li>
                                                <li>• No data recovery after final deletion</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-red-500/10 border dark:border-none border dark:border-none-red-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-red-800 dark:text-red-300">Important Notice</p>
                                                <p className="text-sm text-red-700 dark:text-red-400">
                                                    Always backup your data before cancelling. Once the grace period expires,
                                                    all data is permanently deleted and cannot be recovered.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Chargeback Policy */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Shield className="w-6 h-6 text-indigo-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">6. Chargeback & Dispute Policy</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Please contact us before initiating chargebacks. We're here to resolve issues fairly:
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-4 bg-blue-500/10 border dark:border-none border dark:border-none-blue-500/20 rounded-lg">
                                        <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Before Filing a Chargeback</h3>
                                        <p className="text-sm text-blue-700 dark:text-blue-400">
                                            Contact our support team first. Most issues can be resolved quickly through direct communication,
                                            often resulting in faster resolution than the chargeback process.
                                        </p>
                                    </div>
                                    <div className="p-4 bg-orange-500/10 border dark:border-none border dark:border-none-orange-500/20 rounded-lg">
                                        <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-2">Chargeback Consequences</h3>
                                        <p className="text-sm text-orange-700 dark:text-orange-400">
                                            Unauthorized chargebacks without prior communication may lead to immediate account suspension.
                                            We reserve the right to dispute invalid chargeback claims and may restrict future services.
                                        </p>
                                    </div>
                                    <div className="p-4 bg-green-500/10 border dark:border-none border dark:border-none-green-500/20 rounded-lg">
                                        <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">Legitimate Disputes</h3>
                                        <p className="text-sm text-green-700 dark:text-green-400">
                                            We understand genuine billing disputes occur. Contact us immediately with any billing concerns,
                                            and we'll work together to find a fair resolution.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Contact Information */}
                        <Card className="bg-primary/5 border dark:border-none-primary/20">
                            <CardContent className="p-8 text-center">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Mail className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-2xl font-bold mb-4">Need to Request a Refund?</h2>
                                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                                    Our support team is here to help. Whether you need a refund, have questions about our policy,
                                    or want to discuss your specific situation, don't hesitate to reach out.
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

                                <div className="mt-8 p-4 bg-muted/30 rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                        <strong>Support Hours:</strong> We typically respond within 24 hours.
                                        For urgent refund requests, please mention "URGENT REFUND" in your subject line.
                                    </p>
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
                                This refund policy may be updated periodically. Changes will be posted on this page with updated revision dates.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}
