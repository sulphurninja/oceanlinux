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
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

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
            <Header />

            {/* Hero Section */}
            <section className="section-padding gradient- relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center"></div>
                </div>

                <div className="container mx-auto container-padding relative z-10">
                    <div className="max-w-4xl mx-auto text-center animate-slide-up">
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
                            <MessageCircle className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-sm font-medium text-white">Live AI Assistant • Instant Responses</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            Get Instant Help with
                            <span className="text-gradient block">Our AI Assistant</span>
                        </h1>

                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            Ask anything about our Linux hosting services, pricing, or technical questions.
                            Our AI assistant is trained on all OceanLinux services and ready to help 24/7.
                        </p>

                        <div className="grid grid-cols-3 gap-6 mb-8">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">24/7</div>
                                <div className="text-sm text-white/70">Always Available</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-400">Instant</div>
                                <div className="text-sm text-white/70">Response Time</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-purple-400">Smart</div>
                                <div className="text-sm text-white/70">AI Powered</div>
                            </div>
                        </div>

                        {/* AI Powered by Credit */}
                        <div className="mb-8">
                            <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/5 backdrop-blur-sm border border-white/10">
                                <span className="text-xs text-white/60">AI Powered by </span>
                                <span className="text-xs font-semibold text-white/80 ml-1">Backtick Labs</span>
                            </div>
                        </div>



                        <Link href="/contact-us">
                            <Button
                                variant="outline"
                                className="border-white/30 text-white hover:bg-white/10 backdrop-blur-sm"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Contact
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Chat Interface */}
            <section className="p-12 bg-background">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto">
                        <Card className="h-[700px] flex flex-col shadow-2xl">
                            <CardHeader className="bg-primary/5 rounded-t-lg flex-shrink-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                                            <Bot className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold">OceanLinux AI Assistant</h3>
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                                Online • Ready to help
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Shield className="w-3 h-3" />
                                        <span>Secure Chat</span>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                                {/* Messages Container - Fixed height and scrolling */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
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
                                    <div className="px-6 pb-4 flex-shrink-0 border-t border-border/50">
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
                                <div className="border-t p-4 flex-shrink-0 bg-background">
                                    <div className="flex gap-3">
                                        <Input
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyPress={handleKeyPress}
                                            placeholder="Ask about our hosting services, pricing, or technical questions..."
                                            disabled={isLoading}
                                            className="flex-1"
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
                                    <div className="flex justify-between items-center mt-2">
                                        <p className="text-xs text-muted-foreground">
                                            Press Enter to send • Need human help? <Link href="/contact-us" className="text-primary hover:underline">Contact our team</Link>
                                        </p>
                                        <p className="text-xs text-muted-foreground">
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
            <section className="py-16 bg-muted/30">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold mb-4">Why Use Our AI Assistant?</h2>
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
            </section>

            <Footer />
        </>
    );
}