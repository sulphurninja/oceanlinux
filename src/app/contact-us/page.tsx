import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InstagramLogoIcon } from "@radix-ui/react-icons";
import {
    Mail,
    MessageSquare,
    Phone,
    MapPin,
    Clock,
    Shield,
    Users,
    Handshake,
    Twitter,
    Linkedin,
    IndianRupee,
    Zap,
    HeartHandshake,
    Star
} from "lucide-react";
import Link from "next/link";

export default function ContactUs() {
    return (
        <>
            <Header />

            {/* Hero Section */}
            <section className="section-padding bg-background - relative overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center"></div>
                </div>

                <div className="container mx-auto container-padding relative z-10 text-center">
                    <div className="max-w-4xl mx-auto animate-slide-up">
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border dark:border-none border dark:border-none-white/20 mb-6">
                            <HeartHandshake className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-sm font-medium text-white">24/7 Support • Always Here for You</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            Get in Touch with
                            <span className="text-gradient block">Our Expert Team</span>
                        </h1>

                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            Need help with your Linux hosting? Have questions about our affordable VPS solutions?
                            Our expert team is ready to assist you 24/7. Get the support you deserve.
                        </p>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">24/7</div>
                                <div className="text-sm text-white/70">Support Available</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-400">&lt;5min</div>
                                <div className="text-sm text-white/70">Response Time</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-purple-400">5000+</div>
                                <div className="text-sm text-white/70">Happy Customers</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-yellow-400">4.9/5</div>
                                <div className="text-sm text-white/70">Support Rating</div>
                            </div>
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/live-chat">
                                <Button size="lg" className="btn-primary px-8 py-4 text-lg font-semibold w-full sm:w-auto">
                                    💬 Start Live Chat
                                </Button>
                            </Link>
                            <Link href="mailto:hello@oceanlinux.com">
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className="border dark:border-none-white/30 text-white hover:bg-white/10 backdrop-blur-sm px-8 py-4 text-lg font-semibold w-full sm:w-auto"
                                >
                                    📧 Send Email
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Contact Methods */}
            <section className="py-20 bg-background">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold mb-4">Choose Your Preferred Way to Connect</h2>
                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                            Multiple ways to get in touch - pick what works best for you
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                        {/* Live Chat */}
                        <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                            <CardContent className="p-8 text-center">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/20 transition-colors">
                                    <MessageSquare className="w-8 h-8 text-primary" />
                                </div>
                                <h3 className="text-xl font-semibold mb-4">Live Chat Support</h3>
                                <p className="text-muted-foreground mb-6">
                                    Get instant help from our technical experts. Available 24/7 for all your hosting needs.
                                </p>
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <Clock className="w-4 h-4 text-green-500" />
                                    <span className="text-sm text-green-600 font-medium">Online Now • &lt;5min response</span>
                                </div>
                                <Link href="/live-chat">
                                    <Button className="w-full">Start Chat</Button>
                                </Link>
                            </CardContent>
                        </Card>

                        {/* Email Support */}
                        <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                            <CardContent className="p-8 text-center">
                                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-500/20 transition-colors">
                                    <Mail className="w-8 h-8 text-blue-500" />
                                </div>
                                <h3 className="text-xl font-semibold mb-4">Email Support</h3>
                                <p className="text-muted-foreground mb-6">
                                    Send us detailed queries and we'll get back to you with comprehensive solutions.
                                </p>
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <Star className="w-4 h-4 text-yellow-500" />
                                    <span className="text-sm text-muted-foreground">Professional & Detailed</span>
                                </div>
                                <Link href="mailto:hello@oceanlinux.com">
                                    <Button variant="outline" className="w-full">
                                        hello@oceanlinux.com
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>

                        {/* Business Inquiries */}
                        <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                            <CardContent className="p-8 text-center">
                                <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-purple-500/20 transition-colors">
                                    <Handshake className="w-8 h-8 text-purple-500" />
                                </div>
                                <h3 className="text-xl font-semibold mb-4">Business & Partnerships</h3>
                                <p className="text-muted-foreground mb-6">
                                    Explore partnership opportunities, bulk orders, or enterprise solutions.
                                </p>
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <Users className="w-4 h-4 text-purple-500" />
                                    <span className="text-sm text-muted-foreground">Enterprise Solutions</span>
                                </div>
                                <Link href="mailto:hello@oceanlinux.com?subject=Business Inquiry">
                                    <Button variant="outline" className="w-full">
                                        Contact Business Team
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Payment & Security Info */}
            <section className="py-16 bg-muted/30">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold mb-4">Secure & Trusted Payments</h2>
                            <p className="text-lg text-muted-foreground">
                                Your payments are safe with our enterprise-grade security
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            <Card className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Shield className="w-6 h-6 text-green-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2">Multiple Secure Payment Options</h3>
                                        <p className="text-muted-foreground mb-3">
                                            All transactions are securely processed through trusted payment gateways including
                                            <strong> Razorpay</strong>, <strong>Cashfree</strong>, and <strong>UPI Gateway</strong>,
                                            ensuring maximum security and convenience.
                                        </p>
                                        <div className="flex items-center gap-2 text-sm text-green-600">
                                            <Shield className="w-4 h-4" />
                                            <span>Bank-grade encryption</span>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <Card className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <IndianRupee className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2">Flexible Payment Methods</h3>
                                        <p className="text-muted-foreground mb-3">
                                            Accept all major payment methods including Credit/Debit Cards, Net Banking,
                                            UPI, and Digital Wallets. Choose what's most convenient for you.
                                        </p>
                                        <div className="flex items-center gap-2 text-sm text-blue-600">
                                            <Zap className="w-4 h-4" />
                                            <span>Instant payment processing</span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Payment Gateway Logos */}
                        {/* <div className="mt-12 text-center">
                            <p className="text-sm text-muted-foreground mb-6">Powered by trusted payment partners</p>
                            <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
                                <div className="flex items-center gap-2 px-4 py-2 bg-background/50 rounded-lg">
                                    <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                                        <span className="text-white text-xs font-bold">R</span>
                                    </div>
                                    <span className="text-sm font-medium">Razorpay</span>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 bg-background/50 rounded-lg">
                                    <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center">
                                        <span className="text-white text-xs font-bold">C</span>
                                    </div>
                                    <span className="text-sm font-medium">Cashfree</span>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 bg-background/50 rounded-lg">
                                    <div className="w-8 h-8 bg-orange-600 rounded flex items-center justify-center">
                                        <span className="text-white text-xs font-bold">U</span>
                                    </div>
                                    <span className="text-sm font-medium">UPI Gateway</span>
                                </div>
                            </div>
                        </div> */}
                    </div>
                </div>
            </section>

            {/* Social & Community */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">Join Our Community</h2>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                            Stay connected and get updates on the latest features, tips, and community discussions
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
                        <Card className="p-6 hover:shadow-lg transition-all duration-300 w-full sm:w-auto">
                            <Link href='https://instagram.com/oceanlinux' target="_blank" rel="noopener noreferrer" className="w-full">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                                    <InstagramLogoIcon className="w-6 h-6 text-blue-500" />
                                </div>
                                <div>
                                    <h3 className="font-semibold">Follow us on Instagram</h3>
                                    <p className="text-sm text-muted-foreground">@OceanLinux</p>
                                </div>
                            </div>
                            </Link>
                        </Card>

                        <Card className="p-6 hover:shadow-lg transition-all duration-300 w-full sm:w-auto">
                            <Link href="https://www.linkedin.com/company/oceanlinux" target="_blank" rel="noopener noreferrer" className="w-full">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-600/10 rounded-lg flex items-center justify-center">
                                        <Linkedin className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">Connect on LinkedIn</h3>
                                        <p className="text-sm text-muted-foreground">Ocean Linux</p>
                                    </div>
                                </div>
                            </Link>
                        </Card>
                    </div>
                </div>
            </section>

            {/* FAQ Teaser */}
            <section className="py-16 bg-background /5">
                <div className="container mx-auto px-6 text-center">
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-3xl font-bold mb-4">Still Have Questions?</h2>
                        <p className="text-lg text-muted-foreground mb-8">
                            Check out our comprehensive FAQ section or reach out directly for personalized assistance
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            {/* <Link href="/faq">
                                <Button size="lg" variant="outline" className="px-8 w-full sm:w-auto">
                                    View FAQ
                                </Button>
                            </Link> */}
                            <Link href="/live-chat">
                                <Button size="lg" className="px-8 w-full sm:w-auto">
                                    <Zap className="w-4 h-4 mr-2" />
                                    Get Instant Help
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}
