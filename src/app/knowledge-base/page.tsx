import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Mail, MessageCircle, Clock } from "lucide-react";
import Link from "next/link";

export default function KnowledgeBase() {
    return (
        <>
            <Header />
            
            <section className="py-16 bg-background min-h-screen flex items-center">
                <div className="container mx-auto px-6">
                    <div className="max-w-2xl mx-auto text-center">
                        <Card>
                            <CardContent className="p-12">
                                <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <BookOpen className="w-10 h-10 text-blue-500" />
                                </div>
                                
                                <h1 className="text-3xl font-bold mb-4">Knowledge Base Coming Soon!</h1>
                                <p className="text-muted-foreground mb-8 leading-relaxed">
                                    We're curating comprehensive guides, tutorials, and documentation to help you 
                                    make the most of your Linux VPS hosting experience.
                                </p>

                                <div className="space-y-4 mb-8">
                                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-sm">Expected Launch: Q1 2025</span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <Link href="mailto:hello@oceanlinux.com">
                                        <Button size="lg" className="px-8">
                                            <Mail className="w-4 h-4 mr-2" />
                                            Get Help via Email
                                        </Button>
                                    </Link>
                                    <Link href="/contact-us">
                                        <Button size="lg" variant="outline" className="px-8">
                                            <MessageCircle className="w-4 h-4 mr-2" />
                                            Contact Support
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}