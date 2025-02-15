"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type MemoryOptions = {
    [key: string]: number | null;
    // This index signature allows any string key mapping to number or null
};

interface Plan {
    name: string;
    description: string;
    features: string[];
    memoryOptions: MemoryOptions;
}

const popularPlans: Plan[] = [
    {
        name: "Essential Linux #1 – IP: 103.73.222.xx",
        description:
            "An entry-level Linux hosting plan best suited for personal blogs, small portfolios, and low-traffic websites. Delivers stable performance within India for smooth user experiences.",
        features: [
            "Perfect for personal or hobby sites",
            "Stable performance and reliable uptime",
            "Low-maintenance environment",
            "Basic security and DDoS protection"
        ],
        memoryOptions: {
            "4GB": 659,
            "8GB": 899,
            "16GB": 1299
        }
    },
    {
        name: "Essential Linux #2 – IP: 103.216.173.xx",
        description:
            "A cost-effective hosting solution for personal sites and small businesses. Offers consistent performance and dependable uptime for emerging projects in India.",
        features: [
            "Budget-friendly for tight budgets",
            "Suitable for single-site deployments",
            "Basic automated backups",
            "24/7 ticket support"
        ],
        memoryOptions: {
            "4GB": 659,
            "8GB": 899,
            "16GB": 1299
        }
    },
    {
        name: "Standard Linux #1 – IP: 103.204.22.xx",
        description:
            "A balanced plan suitable for growing businesses aiming for stable hosting and frequent content updates. Provides a secure environment and seamless scalability options.",
        features: [
            "Ideal for small-to-mid-sized business websites",
            "Enhanced stability for moderate traffic",
            "Scalable resource allocation",
            "24/7 support for core hosting issues"
        ],
        memoryOptions: {
            "4GB": 659,
            "8GB": 899,
            "16GB": 1299
        }
    },
    {
        name: "Enhanced Linux #1 – IP: 157.254.25.xx",
        description:
            "Offers improved memory and CPU utilization for busier websites, media-rich portals, or regional forums. Ideal for projects expecting steady growth in traffic from India.",
        features: [
            "Better CPU/RAM for heavier workloads",
            "Supports streaming, forums, or e-commerce",
            "Upgraded DDoS shielding",
            "Automatic backups available"
        ],
        memoryOptions: {
            "4GB": 659,
            "8GB": 899,
            "16GB": 1299
        }
    },
    {
        name: "Advanced Linux #1 – IP: 216.122.167.xx",
        description:
            "Geared towards enterprises with multi-layer security needs. Delivers robust performance under sustained load and is ideal for sizable corporate or institutional websites.",
        features: [
            "High CPU & RAM for demanding apps",
            "Multi-layer security & monitoring",
            "Excellent for corporate or institutional sites",
            "99.9% uptime SLA"
        ],
        memoryOptions: {
            "4GB": 659,
            "8GB": 899,
            "16GB": 1299
        }
    },
    {
        name: "Premium Gold #1 – IP: 103.227.xx",
        description:
            "Engineered for high-traffic e-commerce ventures or complex data-driven applications. Includes advanced support options and cutting-edge security features for peace of mind.",
        features: [
            "Premium-tier hardware for major traffic",
            "Perfect for large-scale or mission-critical sites",
            "Advanced support & security add-ons",
            "Highly optimized for speed"
        ],
        memoryOptions: {
            "4GB": 699,
            // The others might be null in your DB, you can show or skip them
            "8GB": null,
            "16GB": null
        }
    }
];


export default function PricingSection() {
    return (
        <section className="py-16  text-white text-center">
            <h2 className="text-3xl font-bold mb-8">Popular Linux Plans</h2>
            <p className="text-lg text-gray-300 mb-12">
                Choose from our top plans, each with reliable performance, secure environments,
                and transparent pricing.
            </p>

            {/* Plans in a responsive grid */}
            <div className="grid md:grid-cols-3 gap-8 px-4 md:px-12">
                {popularPlans.map((plan, index) => {
                    const memoryKeys = Object.keys(plan.memoryOptions || {});
                    return (
                        <Card key={index} className="bg-gray-800 border border-gray-700 p-4 text-left">
                            <CardHeader className="p-0 mb-4">
                                <CardTitle className="text-lg font-bold">{plan.name}</CardTitle>
                                <CardDescription className="mt-2 text-sm text-gray-400">
                                    {plan.description}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                {/* Feature list */}
                                <ul className="list-disc list-inside text-sm text-gray-300 mb-4 space-y-1">
                                    {plan.features.map((feature, i) => (
                                        <li key={i}>{feature}</li>
                                    ))}
                                </ul>

                                {/* Memory Options Tabs */}
                                {memoryKeys.length > 0 ? (
                                    <Tabs defaultValue={memoryKeys[0]} className="w-full">
                                        <TabsList className="flex justify-center bg-gray-700 rounded-lg p-1 mb-3">
                                            {memoryKeys.map((memory) => (
                                                <TabsTrigger
                                                    key={memory}
                                                    value={memory}
                                                    className="px-4 py-2 text-white text-sm hover:bg-gray-600 font-medium"
                                                >
                                                    {memory}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>

                                        {memoryKeys.map((memory) => {
                                            const price = plan.memoryOptions[memory];
                                            // If price is null, skip or show "Not Available"
                                            if (!price) {
                                                return (
                                                    <TabsContent
                                                        key={memory}
                                                        value={memory}
                                                        className="text-sm text-gray-400"
                                                    >
                                                        <p>Not available for {memory}</p>
                                                    </TabsContent>
                                                );
                                            }
                                            return (
                                                <TabsContent
                                                    key={memory}
                                                    value={memory}
                                                    className="flex  items-center justify-between"
                                                >
                                                    <span className="text-sm text-green-400 font-medium">
                                                        Special Offer Price
                                                    </span>
                                                    <div className="text-xl font-semibold">
                                                        ₹{price.toLocaleString("en-IN")}
                                                    </div>
                                                </TabsContent>
                                            );
                                        })}
                                    </Tabs>
                                ) : (
                                    <p className="text-sm text-gray-500">No memory tiers available.</p>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}
