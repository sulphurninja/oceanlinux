import {
    Waves,
    Users,
    Rocket,
    Star,
    Server,
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
    IndianRupee,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import PublicPageHero from "@/components/landing/PublicPageHero";
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader";
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard";
import Tilt3DCard from "@/components/landing/Tilt3DCard";

const pillars = [
    {
        icon: Server,
        title: "Premium Infrastructure",
        description:
            "VPS sourced from trusted upstream providers, fully managed and supported by OceanLinux. Enterprise-grade hardware with 99.9% uptime SLA.",
    },
    {
        icon: IndianRupee,
        title: "Simple Pricing",
        description:
            "Straightforward monthly plans without hidden costs. What you see is what you pay, with transparent billing and no surprise charges.",
    },
    {
        icon: Bot,
        title: "AI + Human Support",
        description:
            "Smart automation combined with human expertise when you need it. Future-ready assistance that actually helps.",
    },
    {
        icon: Award,
        title: "Young Vision, Bold Future",
        description:
            "Built by founders who believe in shaping tomorrow, today. Fresh perspectives meet proven technology for hosting that evolves with you.",
    },
];

const missionValues = [
    {
        icon: Globe,
        title: "Simple",
        description:
            "Easy-to-use interfaces and straightforward processes that don't require a PhD in server management.",
    },
    {
        icon: Shield,
        title: "Transparent",
        description: "Clear pricing, honest communication, and no hidden fees or surprise charges.",
    },
    {
        icon: Zap,
        title: "Powerful",
        description:
            "Enterprise-grade infrastructure with the performance and reliability you need to scale.",
    },
];

const audience = [
    { icon: Code, title: "For Creators", description: "Developers and makers building the next big thing" },
    { icon: TrendingUp, title: "For Businesses", description: "Companies scaling their digital presence" },
    { icon: Star, title: "For Dreamers", description: "Visionaries turning ideas into reality" },
];

export default function AboutUs() {
    return (
        <>
            <PublicPageHero
                eyebrow="About OceanLinux"
                title="Seamless & Boundless"
                titleAccent="Like The Ocean"
                description="At OceanLinux, we believe hosting should feel as seamless and boundless as the ocean itself. Founded by two young minds in their early 20s, we're on a mission to democratize cloud hosting."
                badge={
                    <span className="premium-chip inline-flex items-center gap-2">
                        <Waves className="w-4 h-4" />
                        Backtick Labs · Young Founders · Bold Vision
                    </span>
                }
            >
                <div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Young Founders</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Bold Innovation</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Heart className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Human Touch</span>
                    </div>
                </div>
            </PublicPageHero>

            <section className="premium-page-section">
                <div className="container mx-auto container-padding max-w-4xl space-y-16">
                    {/* Story */}
                    <div>
                        <PremiumSectionHeader
                            eyebrow="Our Story"
                            title="The OceanLinux"
                            titleAccent="Story"
                            description="A product of Backtick Labs, born from a bold vision to make premium hosting accessible to everyone."
                            align="left"
                        />
                        <Tilt3DCard maxTilt={4} scale={1.01} innerClassName="premium-glass-card p-7 sm:p-8">
                            <div className="space-y-5 text-white/55 leading-relaxed">
                                <p>
                                    At OceanLinux, we believe hosting should feel as seamless and boundless as the ocean
                                    itself. As a product of <strong className="text-white/90">Backtick Labs</strong>,
                                    OceanLinux was founded with a bold vision — to deliver premium, reliable, and affordable
                                    VPS and Linux hosting that empowers developers, startups, and businesses to build without
                                    limits.
                                </p>
                                <p>
                                    What sets us apart is not just infrastructure, but the spirit of its creators. Founded
                                    by two young minds in their early 20s —{" "}
                                    <strong className="text-white/90">Aditya</strong> and{" "}
                                    <strong className="text-white/90">Umesh</strong> — OceanLinux is driven by ambition,
                                    innovation, and the relentless pursuit of excellence.
                                </p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4 mt-8">
                                <div className="premium-inner-card p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="premium-icon-box w-10 h-10 shrink-0">
                                            <Code className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-white">Aditya</h3>
                                            <p className="text-xs text-emerald-400/80">Co-Founder & Technical Lead</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-white/50">
                                        Brings deep technical expertise in building scalable products, ensuring our
                                        infrastructure meets the highest standards of performance and reliability.
                                    </p>
                                </div>
                                <div className="premium-inner-card p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="premium-icon-box w-10 h-10 shrink-0">
                                            <TrendingUp className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-white">Umesh</h3>
                                            <p className="text-xs text-emerald-400/80">Co-Founder & Growth Lead</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-white/50">
                                        Drives growth with sharp focus on leads and sales, connecting our solutions with
                                        customers who need reliable hosting that scales with their ambitions.
                                    </p>
                                </div>
                            </div>

                            <div className="premium-inner-card p-4 mt-6 flex items-start gap-3 border-emerald-400/15">
                                <Lightbulb className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-white text-sm">The Energy of a New Generation</p>
                                    <p className="text-sm text-white/50 mt-1">
                                        Together, they embody the energy of a new generation determined to set a mark in the
                                        tech industry, bringing fresh perspectives to traditional hosting challenges.
                                    </p>
                                </div>
                            </div>
                        </Tilt3DCard>
                    </div>

                    {/* Mission */}
                    <div>
                        <PremiumSectionHeader
                            eyebrow="Purpose"
                            title="Our"
                            titleAccent="Mission"
                            description="Democratizing access to cloud and Linux hosting with simplicity, transparency, and power."
                            align="left"
                        />
                        <div className="premium-highlight-box mb-8">
                            <p className="text-lg sm:text-xl font-medium text-white/90 leading-relaxed italic">
                                &ldquo;To democratize access to cloud and Linux hosting by making it simple, transparent,
                                and powerful — blending cutting-edge tech with a human touch.&rdquo;
                            </p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6">
                            {missionValues.map((value) => (
                                <PremiumFeatureCard
                                    key={value.title}
                                    icon={<value.icon className="w-5 h-5" />}
                                    title={value.title}
                                    description={value.description}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Why OceanLinux */}
                    <div>
                        <PremiumSectionHeader
                            eyebrow="Differentiators"
                            title="Why"
                            titleAccent="OceanLinux?"
                            description="Four pillars that make us different from traditional hosting providers."
                            align="left"
                        />
                        <div className="grid md:grid-cols-2 gap-6">
                            {pillars.map((pillar) => (
                                <PremiumFeatureCard
                                    key={pillar.title}
                                    icon={<pillar.icon className="w-5 h-5" />}
                                    title={pillar.title}
                                    description={pillar.description}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Vision */}
                    <div>
                        <PremiumSectionHeader
                            eyebrow="Looking Ahead"
                            title="Our"
                            titleAccent="Vision"
                            description="Building foundations for creators, businesses, and dreamers who want to go further."
                            align="left"
                        />
                        <div className="premium-highlight-box mb-8 text-center">
                            <p className="text-lg font-medium text-white/90 mb-3">
                                OceanLinux isn&apos;t just about hosting servers. It&apos;s about building foundations for
                                creators, businesses, and dreamers who want to go further.
                            </p>
                            <p className="text-sm text-white/50">
                                The ocean is vast, limitless, and powerful — and so is the potential we bring to every
                                customer.
                            </p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6">
                            {audience.map((item) => (
                                <div key={item.title} className="premium-stat-card text-center">
                                    <div className="premium-icon-box w-12 h-12 mx-auto mb-4">
                                        <item.icon className="w-5 h-5" />
                                    </div>
                                    <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                                    <p className="text-sm text-white/45">{item.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="premium-cta-box">
                        <div className="premium-icon-box w-16 h-16 mx-auto mb-6 rounded-full">
                            <Waves className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Welcome Aboard</h2>
                        <p className="text-white/50 mb-2 max-w-xl mx-auto">
                            The ocean is vast, limitless, and powerful. Your hosting journey with us should be too.
                        </p>
                        <p className="text-emerald-400/90 font-medium mb-8">Welcome aboard. The ocean is yours.</p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/get-started">
                                <Button className="premium-btn-primary w-full sm:w-auto px-8 h-12">
                                    <Rocket className="w-4 h-4 mr-2" />
                                    Start Your Journey
                                </Button>
                            </Link>
                            <Link href="mailto:hello@oceanlinux.com">
                                <Button variant="outline" className="premium-btn-outline w-full sm:w-auto px-8 h-12">
                                    <Mail className="w-4 h-4 mr-2" />
                                    Get In Touch
                                </Button>
                            </Link>
                        </div>
                    </div>

                    <div className="text-center pt-4 border-t border-white/[0.06]">
                        <p className="text-sm text-white/40">
                            <strong className="text-white/60">Founded:</strong> 2024 ·{" "}
                            <strong className="text-white/60">Headquarters:</strong> India ·{" "}
                            <strong className="text-white/60">Team:</strong> Growing
                        </p>
                        <p className="text-sm text-white/35 mt-2">
                            Part of Backtick Labs family, building the future of accessible cloud hosting.
                        </p>
                    </div>
                </div>
            </section>
        </>
    );
}
