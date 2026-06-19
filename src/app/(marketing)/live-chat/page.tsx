'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Send,
    Bot,
    User,
    MessageCircle,
    Loader2,
    ArrowLeft,
    Zap,
    Shield,
    Clock
} from "lucide-react";
import Link from "next/link";
import PublicPageHero from "@/components/landing/PublicPageHero";

interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
}

export default function LiveChat() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            content: "Hello! I'm your OceanLinux AI assistant. I can help you with hosting questions, pricing, technical support, and more. What would you like to know?",
            role: 'assistant',
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            content: input.trim(),
            role: 'user',
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage].map(msg => ({
                        role: msg.role,
                        content: msg.content
                    }))
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            const data = await response.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: data.message,
                role: 'assistant',
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: "I'm sorry, I'm having trouble connecting right now. Please try again or contact us directly at hello@oceanlinux.com",
                role: 'assistant',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const quickQuestions = [
        "What are your most affordable VPS plans?",
        "Do you offer Ubuntu 22 servers?",
        "What's included in your hosting plans?",
        "How fast is server deployment?",
        "Do you provide 24/7 support?"
    ];

    return (
        <>
            <PublicPageHero
                eyebrow="Live Support"
                title="Get Instant Help with"
                titleAccent="Our AI Assistant"
                description="Ask anything about our Linux hosting services, pricing, or technical questions. Our AI assistant is trained on all OceanLinux services and ready to help 24/7."
                badge={
                    <span className="premium-chip inline-flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" />
                        Live AI Assistant · Instant Responses
                    </span>
                }
            >
                <div className="premium-hero-stats mb-6">
                    <div className="premium-stat-card">
                        <div className="premium-stat-value text-2xl">24/7</div>
                        <div className="text-sm text-white/50">Always Available</div>
                    </div>
                    <div className="premium-stat-card">
                        <div className="premium-stat-value text-2xl">Instant</div>
                        <div className="text-sm text-white/50">Response Time</div>
                    </div>
                    <div className="premium-stat-card">
                        <div className="premium-stat-value text-2xl">Smart</div>
                        <div className="text-sm text-white/50">AI Powered</div>
                    </div>
                </div>
                <Link href="/contact-us">
                    <Button variant="outline" className="premium-btn-outline w-auto inline-flex px-6">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Contact
                    </Button>
                </Link>
            </PublicPageHero>

            {/* Chat Interface */}
            <section className="premium-page-section">
                <div className="container mx-auto container-padding">
                    <div className="max-w-4xl mx-auto min-w-0">
                        <Card className="premium-glass-card min-h-[420px] h-[min(700px,calc(100dvh-14rem))] flex flex-col">
                            <CardHeader className="border-b border-white/10 rounded-t-2xl flex-shrink-0 p-4 sm:p-6">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="premium-icon-box w-10 h-10 rounded-full">
                                            <Bot className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-white">OceanLinux AI Assistant</h3>
                                            <p className="text-sm text-white/50 flex items-center gap-1">
                                                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                                                Online · Ready to help
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-white/45">
                                        <Shield className="w-3 h-3" />
                                        <span>Secure Chat</span>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                                {/* Messages Container - Fixed height and scrolling */}
                                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0">
                                    {messages.map((message) => (
                                        <div
                                            key={message.id}
                                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.role === 'user'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-secondary text-secondary-foreground'
                                                    }`}>
                                                    {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                                </div>
                                                <div className={`rounded-2xl px-4 py-3 break-words ${message.role === 'user'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted'
                                                    }`}>
                                                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                                                    <p className={`text-xs mt-2 opacity-70 ${message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                                        }`}>
                                                        {formatTime(message.timestamp)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {isLoading && (
                                        <div className="flex justify-start">
                                            <div className="flex gap-3 max-w-[85%]">
                                                <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center">
                                                    <Bot className="w-4 h-4" />
                                                </div>
                                                <div className="bg-muted rounded-2xl px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        <span className="text-sm">Thinking...</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Quick Questions - Only show when minimal messages */}
                                {messages.length === 1 && (
                                    <div className="px-4 sm:px-6 pb-4 flex-shrink-0 border-t border-white/10">
                                        <div className="pt-4">
                                            <p className="text-sm text-muted-foreground mb-3">Quick questions to get started:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {quickQuestions.map((question, index) => (
                                                    <Button
                                                        key={index}
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-xs h-8"
                                                        onClick={() => setInput(question)}
                                                    >
                                                        {question}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Input Section - Fixed at bottom */}
                                <div className="border-t border-white/10 p-3 sm:p-4 flex-shrink-0 bg-background/80">
                                    <div className="flex gap-2 sm:gap-3">
                                        <Input
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyPress={handleKeyPress}
                                            placeholder="Ask about hosting, pricing, or support..."
                                            disabled={isLoading}
                                            className="flex-1 min-w-0 text-base sm:text-sm"
                                        />
                                        <Button
                                            onClick={sendMessage}
                                            disabled={!input.trim() || isLoading}
                                            size="icon"
                                            className="px-4"
                                        >
                                            {isLoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Send className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 mt-2">
                                        <p className="text-[11px] sm:text-xs text-muted-foreground">
                                          Press Enter to send · <Link href="/contact-us" className="text-primary hover:underline">Contact our team</Link>
                                        </p>
                                        <p className="text-[11px] sm:text-xs text-muted-foreground shrink-0">
                                            AI by <span className="font-medium">Backtick Labs</span>
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>
            {/* Features */}
            <section className="premium-page-section">
                <div className="container mx-auto container-padding">
                    <div className="max-w-4xl mx-auto min-w-0">
                        <div className="text-center mb-8 sm:mb-12">
                            <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-white">Why Use Our AI Assistant?</h2>
                            <p className="text-lg text-muted-foreground">
                                Get instant, accurate answers about OceanLinux services
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-8">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Zap className="w-8 h-8 text-primary" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2">Instant Responses</h3>
                                <p className="text-muted-foreground">
                                    Get immediate answers to your questions, any time of day
                                </p>
                            </div>

                            <div className="text-center">
                                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Bot className="w-8 h-8 text-blue-500" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2">Expert Knowledge</h3>
                                <p className="text-muted-foreground">
                                    Trained on all OceanLinux services, pricing, and technical details
                                </p>
                            </div>

                            <div className="text-center">
                                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Clock className="w-8 h-8 text-green-500" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2">24/7 Available</h3>
                                <p className="text-muted-foreground">
                                    Always here when you need help, no waiting for business hours
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>        </>
    );
}
