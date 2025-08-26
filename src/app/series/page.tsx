import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    RefreshCw, 
    Rocket, 
    Zap, 
    Crown, 
    Star,
    CheckCircle,
    ArrowRight,
    Shield,
    Server,
    Gauge
} from "lucide-react";
import Link from "next/link";

const serverSeries = [
    {
        name: "Gold Series Rotating",
        icon: RefreshCw,
        tagline: "Smart Resource Rotation",
        description: "Perfect for applications with varying resource needs. Our intelligent rotation system ensures optimal performance while keeping costs low.",
        startingPrice: 299,
        features: [
            "Dynamic Resource Allocation",
            "Intelligent Load Balancing", 
            "Auto-Scaling Capabilities",
            "Cost-Optimized Performance",
            "24/7 Automated Monitoring"
        ],
        ideal: "Variable Workloads",
        color: "amber",
        popular: false
    },
    {
        name: "Nova Linux VPS",
        icon: Rocket,
        tagline: "Next-Gen Performance",
        description: "Our flagship VPS series with cutting-edge technology and blazing-fast performance. Built for modern applications that demand speed.",
        startingPrice: 599,
        features: [
            "Latest Intel Xeon CPUs",
            "NVMe SSD Storage",
            "DDR4 ECC Memory",
            "1Gbps Network Port",
            "Advanced Security Features"
        ],
        ideal: "High-Performance Apps",
        color: "blue",
        popular: true
    },
    {
        name: "Power Linux VPS",
        icon: Zap,
        tagline: "Maximum Performance",
        description: "Unleash the full potential with our most powerful VPS series. Designed for resource-intensive applications and high-traffic websites.",
        startingPrice: 999,
        features: [
            "High-Frequency CPUs",
            "Maximum RAM Allocation",
            "Premium NVMe Storage",
            "Dedicated Network Resources",
            "Priority Technical Support"
        ],
        ideal: "Enterprise Applications",
        color: "yellow",
        popular: false
    },
    {
        name: "Titan Series",
        icon: Crown,
        tagline: "Enterprise Excellence", 
        description: "Our premium enterprise-grade series with dedicated resources and white-glove support. The ultimate hosting solution for mission-critical applications.",
        startingPrice: 1999,
        features: [
            "Dedicated CPU Cores",
            "Guaranteed Resources",
            "Enterprise SSD Arrays",
            "Private Network Access",
            "24/7 Phone Support"
        ],
        ideal: "Mission-Critical Systems",
        color: "purple",
        popular: false
    }
];

const colorClasses = {
    amber: "from-amber-500/10 to-amber-600/5 border-amber-500/20",
    blue: "from-blue-500/10 to-blue-600/5 border-blue-500/20",
    yellow: "from-yellow-500/10 to-yellow-600/5 border-yellow-500/20", 
    purple: "from-purple-500/10 to-purple-600/5 border-purple-500/20"
};

const iconColors = {
    amber: "text-amber-500",
    blue: "text-blue-500", 
    yellow: "text-yellow-500",
    purple: "text-purple-500"
};

export default function ServerSeries() {
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
                            <Server className="w-4 h-4 mr-2 text-purple-400" />
                            <span className="text-sm font-medium text-white">4 Unique Series • Specialized Performance • Your Perfect Match</span>
                        </div>
                        
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            🔄 Server Series
                            <span className="text-gradient block">Choose Your Performance Tier</span>
                        </h1>
                        
                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            From intelligent resource rotation to enterprise-grade dedicated servers, 
                            find the perfect hosting solution tailored to your specific needs and budget.
                        </p>

                        <div className="flex items-center justify-center gap-6 text-white/70">
                            <div className="flex items-center gap-2">
                                <Gauge className="w-4 h-4" />
                                <span className="text-sm">Optimized Performance</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span className="text-sm">Enterprise Security</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Star className="w-4 h-4" />
                                <span className="text-sm">Specialized Features</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Server Series Cards */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">Our Server Series</h2>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Each series is specifically designed and optimized for different use cases and performance requirements.
                        </p>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
                        {serverSeries.map((series, index) => (
                            <Card key={index} className={`relative bg-gradient-to-br ${colorClasses[series.color]} ${series.popular ? 'ring-2 ring-primary/50 scale-105' : ''}`}>
                                {series.popular && (
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                        <Badge className="bg-primary text-primary-foreground px-4 py-1">
                                            <Star className="w-3 h-3 mr-1" />
                                            Most Popular
                                        </Badge>
                                    </div>
                                )}
                                
                                <CardContent className="p-8">
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className={`w-16 h-16 bg-white/80 rounded-lg flex items-center justify-center flex-shrink-0`}>
                                            <series.icon className={`w-8 h-8 ${iconColors[series.color]}`} />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-2xl font-bold mb-1">{series.name}</h3>
                                            <p className="text-sm font-medium text-muted-foreground mb-2">{series.tagline}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-bold text-primary">Starting ₹{series.startingPrice}</span>
                                                <span className="text-sm text-muted-foreground">/month</span>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-muted-foreground mb-6 leading-relaxed">
                                        {series.description}
                                    </p>

                                    <div className="space-y-3 mb-6">
                                        {series.features.map((feature, idx) => (
                                            <div key={idx} className="flex items-center gap-3">
                                                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                                                <span className="text-sm">{feature}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                        <div className="text-sm">
                                            <span className="text-muted-foreground">Ideal for:</span>
                                            <span className="font-medium ml-1">{series.ideal}</span>
                                        </div>
                                        <Link href="/hosting">
                                            <Button className="px-6">
                                                View Plans
                                                <ArrowRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16 bg-gradient-to-br from-primary/5 to-secondary/5">
                <div className="container mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold mb-4">Can't Decide Which Series is Right?</h2>
                    <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                        Our experts can help you choose the perfect server series for your specific requirements and budget.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link href="/contact-us">
                            <Button size="lg" className="px-8">
                                Talk to Expert
                            </Button>
                        </Link>
                        <Link href="/hosting">
                            <Button size="lg" variant="outline" className="px-8">
                                Compare All Plans
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}