'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const products = [
    {
        name: "103.73.222.xx",
        description: "High-performance Linux server with secure and stable environment.",
        features: [
            "99.9% Uptime Guarantee",
            "DDoS Protection",
            "Full Root Access",
            "Optimized for Speed and Security"
        ],
        memoryOptions: {
            "4 GB": 659,
            "8 GB": 899,
            "16 GB": 1299
        }
    },
    {
        name: "103.216.173.xx",
        description: "Reliable and scalable Linux hosting solution with advanced features.",
        features: [
            "Enterprise-Grade Performance",
            "Automated Backups",
            "Easy Scalability",
            "24/7 Customer Support"
        ],
        memoryOptions: {
            "4 GB": 659,
            "8 GB": 899,
            "16 GB": 1299
        }
    },
    {
        name: "103.230.69.xx",
        description: "Affordable and flexible Linux VPS designed for developers and businesses.",
        features: [
            "Flexible Configurations",
            "SSD Storage for Faster Performance",
            "Secure SSH Access",
            "Custom OS Installation"
        ],
        memoryOptions: {
            "4 GB": 659,
            "8 GB": 899,
            "16 GB": 1299
        }
    }
];

const PricingSection = () => {
    return (
        <section className="py-16 bg-gray-900 text-white text-center">
            <h2 className="text-3xl font-bold mb-8">Linux Server Pricing</h2>
            <p className="text-lg text-gray-300 mb-12">Choose the best Linux server plan that fits your needs. All our servers come with high-end security and optimal performance.</p>
            <div className="grid md:grid-cols-3 gap-8 px-4 md:px-12">
                {products.map((product, index) => (
                    <Card key={index} className="p-6 border shadow-lg rounded-lg">
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold text-white">{product.name}</CardTitle>
                            <p className="text-sm text-gray-400 mt-2">{product.description}</p>
                        </CardHeader>
                        <CardContent>
                            <ul className="text-sm text-gray-300 mb-4 list-disc list-inside">
                                {product.features.map((feature, i) => (
                                    <li key={i}>{feature}</li>
                                ))}
                            </ul>
                            <Tabs defaultValue="4 GB" className="w-full">
                                <TabsList className="flex justify-center  p-1 rounded-lg">
                                    {Object.keys(product.memoryOptions).map((memory) => (
                                        <TabsTrigger key={memory} value={memory} className="px-4 py-2 text-white font-medium focus:outline-none focus:ring-2 focus:ring-gray-400">
                                            {memory}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                {Object.entries(product.memoryOptions).map(([memory, price]) => (
                                    <TabsContent key={memory} value={memory} className="text-xl font-semibold mt-4">
                                        ₹{price.toLocaleString('en-IN')}
                                    </TabsContent>
                                ))}
                            </Tabs>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
};

export default PricingSection;