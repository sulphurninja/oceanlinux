import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import { 
    Waves, 
    Users, 
    Target, 
    Rocket, 
    Star, 
    Server, 
    DollarSign, 
    Bot,
    Heart,
    Zap,
    Globe,
    Award,
    TrendingUp,
    Code,
    Mail,
    Lightbulb,
    Shield,
    IndianRupee
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function AboutUs() {
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
                            <Waves className="w-4 h-4 mr-2 text-blue-400" />
                            <span className="text-sm font-medium text-white">Backtick Labs • Young Founders • Bold Vision</span>
                        </div>
                        
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            🌊 About Us
                            <span className="text-gradient block">Seamless & Boundless Like The Ocean</span>
                        </h1>
                        
                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            At OceanLinux, we believe hosting should feel as seamless and boundless as the ocean itself. 
                            Founded by two young minds in their early 20s, we're on a mission to democratize cloud hosting.
                        </p>

                        <div className="flex items-center justify-center gap-6 text-white/70">
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                <span className="text-sm">Young Founders</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4" />
                                <span className="text-sm">Bold Innovation</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Heart className="w-4 h-4" />
                                <span className="text-sm">Human Touch</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Our Story */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto space-y-12">
                        
                        {/* Company Overview */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Waves className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">🌊 The OceanLinux Story</h2>
                                        <p className="text-muted-foreground mb-4">
                                            A product of Backtick Labs, born from a bold vision to make premium hosting accessible to everyone.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <p className="text-lg leading-relaxed">
                                        At OceanLinux, we believe hosting should feel as seamless and boundless as the ocean itself. 
                                        As a product of <strong>Backtick Labs</strong>, OceanLinux was founded with a bold vision — to deliver 
                                        premium, reliable, and affordable VPS & Linux hosting that empowers developers, startups, and 
                                        businesses to build without limits.
                                    </p>

                                    <p className="text-lg leading-relaxed">
                                        What sets us apart is not just infrastructure, but the spirit of its creators. Founded by two young minds 
                                        in their early 20s — <strong>Aditya</strong> and <strong>Umesh</strong> — OceanLinux is driven by ambition, 
                                        innovation, and the relentless pursuit of excellence.
                                    </p>

                                    <div className="grid md:grid-cols-2 gap-6 mt-8">
                                        <div className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-lg border border-blue-500/20">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                                                    <Code className="w-5 h-5 text-blue-500" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-blue-800 dark:text-blue-300">Aditya</h3>
                                                    <p className="text-sm text-blue-600 dark:text-blue-400">Co-Founder & Technical Lead</p>
                                                </div>
                                            </div>
                                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                                Brings deep technical expertise in building scalable products, ensuring our infrastructure 
                                                meets the highest standards of performance and reliability.
                                            </p>
                                        </div>

                                        <div className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-lg border border-green-500/20">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                                                    <TrendingUp className="w-5 h-5 text-green-500" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-green-800 dark:text-green-300">Umesh</h3>
                                                    <p className="text-sm text-green-600 dark:text-green-400">Co-Founder & Growth Lead</p>
                                                </div>
                                            </div>
                                            <p className="text-sm text-green-700 dark:text-green-300">
                                                Drives growth with sharp focus on leads and sales, connecting our solutions with 
                                                customers who need reliable hosting that scales with their ambitions.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <Lightbulb className="w-5 h-5 text-primary mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-primary">The Energy of a New Generation</p>
                                                <p className="text-sm text-primary/80">
                                                    Together, they embody the energy of a new generation determined to set a mark in the tech industry, 
                                                    bringing fresh perspectives to traditional hosting challenges.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Our Mission */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Target className="w-6 h-6 text-green-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">🌍 Our Mission</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Democratizing access to cloud and Linux hosting with simplicity, transparency, and power.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="text-center p-8 bg-gradient-to-br from-green-500/5 to-blue-500/5 rounded-lg border">
                                        <h3 className="text-2xl font-bold mb-4 text-green-700 dark:text-green-300">
                                            "To democratize access to cloud and Linux hosting by making it simple, transparent, 
                                            and powerful — blending cutting-edge tech with a human touch."
                                        </h3>
                                    </div>

                                    <div className="grid md:grid-cols-3 gap-6">
                                        <div className="text-center p-4">
                                            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Globe className="w-8 h-8 text-green-500" />
                                            </div>
                                            <h3 className="font-bold mb-2">Simple</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Easy-to-use interfaces and straightforward processes that don't require a PhD in server management.
                                            </p>
                                        </div>
                                        <div className="text-center p-4">
                                            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Shield className="w-8 h-8 text-blue-500" />
                                            </div>
                                            <h3 className="font-bold mb-2">Transparent</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Clear pricing, honest communication, and no hidden fees or surprise charges.
                                            </p>
                                        </div>
                                        <div className="text-center p-4">
                                            <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Zap className="w-8 h-8 text-purple-500" />
                                            </div>
                                            <h3 className="font-bold mb-2">Powerful</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Enterprise-grade infrastructure with the performance and reliability you need to scale.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Why OceanLinux */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Rocket className="w-6 h-6 text-purple-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">🚀 Why OceanLinux?</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Four pillars that make us different from traditional hosting providers.
                                        </p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-lg border border-blue-500/20">
                                        <div className="flex items-center gap-3 mb-4">
                                            <Server className="w-8 h-8 text-blue-500" />
                                            <h3 className="font-bold text-lg">Premium Infrastructure</h3>
                                        </div>
                                        <p className="text-muted-foreground">
                                            Reliable servers built for performance. Enterprise-grade hardware, 
                                            99.9% uptime SLA, and infrastructure designed to handle your growth.
                                        </p>
                                    </div>

                                    <div className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-lg border border-green-500/20">
                                        <div className="flex items-center gap-3 mb-4">
                                            <IndianRupee className="w-8 h-8 text-green-500" />
                                            <h3 className="font-bold text-lg">Simple Pricing</h3>
                                        </div>
                                        <p className="text-muted-foreground">
                                            Straightforward monthly plans without hidden costs. What you see is what you pay, 
                                            with transparent billing and no surprise charges.
                                        </p>
                                    </div>

                                    <div className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-lg border border-purple-500/20">
                                        <div className="flex items-center gap-3 mb-4">
                                            <Bot className="w-8 h-8 text-purple-500" />
                                            <h3 className="font-bold text-lg">AI + Human Support</h3>
                                        </div>
                                        <p className="text-muted-foreground">
                                            Future-ready assistance that truly helps. Smart automation combined with 
                                            human expertise when you need it most.
                                        </p>
                                    </div>

                                    <div className="p-6 bg-gradient-to-br from-orange-500/10 to-orange-600/5 rounded-lg border border-orange-500/20">
                                        <div className="flex items-center gap-3 mb-4">
                                            <Award className="w-8 h-8 text-orange-500" />
                                            <h3 className="font-bold text-lg">Young Vision, Bold Future</h3>
                                        </div>
                                        <p className="text-muted-foreground">
                                            Built by founders who believe in shaping tomorrow, today. Fresh perspectives 
                                            meet proven technology for hosting that evolves with you.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Our Vision */}
                        <Card>
                            <CardContent className="p-8">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Star className="w-6 h-6 text-indigo-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold mb-4">🌟 Our Vision</h2>
                                        <p className="text-muted-foreground mb-4">
                                            Building foundations for creators, businesses, and dreamers who want to go further.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="text-center p-8 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-lg border">
                                        <h3 className="text-xl font-bold mb-4">
                                            OceanLinux isn't just about hosting servers. It's about building foundations for creators, 
                                            businesses, and dreamers who want to go further.
                                        </h3>
                                        <p className="text-muted-foreground">
                                            The ocean is vast, limitless, and powerful — and so is the potential we bring to every customer.
                                        </p>
                                    </div>

                                    <div className="grid md:grid-cols-3 gap-6">
                                        <div className="text-center p-6 bg-muted/30 rounded-lg">
                                            <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Code className="w-6 h-6 text-blue-500" />
                                            </div>
                                            <h3 className="font-semibold mb-2">For Creators</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Developers and makers building the next big thing
                                            </p>
                                        </div>
                                        <div className="text-center p-6 bg-muted/30 rounded-lg">
                                            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <TrendingUp className="w-6 h-6 text-green-500" />
                                            </div>
                                            <h3 className="font-semibold mb-2">For Businesses</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Companies scaling their digital presence
                                            </p>
                                        </div>
                                        <div className="text-center p-6 bg-muted/30 rounded-lg">
                                            <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Star className="w-6 h-6 text-purple-500" />
                                            </div>
                                            <h3 className="font-semibold mb-2">For Dreamers</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Visionaries turning ideas into reality
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Call to Action */}
                        <Card className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 border-primary/20">
                            <CardContent className="p-8 text-center">
                                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Waves className="w-10 h-10 text-white" />
                                </div>
                                <h2 className="text-3xl font-bold mb-4">Welcome Aboard 🌊</h2>
                                <p className="text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
                                    The ocean is vast, limitless, and powerful. Your hosting journey with us should be too.
                                </p>
                                <p className="text-lg font-semibold mb-8 text-primary">
                                    Welcome aboard. The ocean is yours. 🌊
                                </p>
                                
                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <Link href="/get-started">
                                        <Button size="lg" className="px-8">
                                            <Rocket className="w-4 h-4 mr-2" />
                                            Start Your Journey
                                        </Button>
                                    </Link>
                                    <Link href="mailto:hello@oceanlinux.com">
                                        <Button size="lg" variant="outline" className="px-8">
                                            <Mail className="w-4 h-4 mr-2" />
                                            Get In Touch
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Last Updated */}
                        <div className="text-center pt-8 border-t">
                            <p className="text-sm text-muted-foreground">
                                <strong>Founded:</strong> 2024 • <strong>Headquarters:</strong> India • <strong>Team:</strong> Growing
                            </p>
                            <p className="text-sm text-muted-foreground mt-2">
                                Part of Backtick Labs family, building the future of accessible cloud hosting.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}