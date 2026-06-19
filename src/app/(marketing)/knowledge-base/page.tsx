"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Search,
    BookOpen,
    Clock,
    Eye,
    Star,
    ChevronRight,
    Rocket,
    Settings,
    CreditCard,
    Wrench,
    Shield,
    Zap,
    LucideIcon,
} from "lucide-react";
import Link from "next/link";
import PublicPageHero from "@/components/landing/PublicPageHero";

interface Article {
    _id: string;
    title: string;
    slug: string;
    excerpt: string;
    category: string;
    tags: string[];
    difficulty: string;
    views: number;
    createdAt: string;
    featured: boolean;
}

const categories: { id: string; name: string; icon: LucideIcon }[] = [
    { id: 'all', name: 'All Articles', icon: BookOpen },
    { id: 'getting-started', name: 'Getting Started', icon: Rocket },
    { id: 'server-management', name: 'Server Management', icon: Settings },
    { id: 'billing', name: 'Billing & Pricing', icon: CreditCard },
    { id: 'troubleshooting', name: 'Troubleshooting', icon: Wrench },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'performance', name: 'Performance', icon: Zap },
];

const difficultyStyles = {
    beginner: 'premium-tag',
    intermediate: 'premium-tag',
    advanced: 'premium-tag',
};

export default function KnowledgeBasePage() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [featuredArticles, setFeaturedArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');

    useEffect(() => {
        fetchArticles();
        fetchFeaturedArticles();
    }, [selectedCategory, searchQuery]);

    const fetchArticles = async () => {
        try {
            const params = new URLSearchParams();
            if (selectedCategory !== 'all') params.append('category', selectedCategory);
            if (searchQuery) params.append('search', searchQuery);

            const response = await fetch(`/api/knowledge-base?${params.toString()}`);
            const data = await response.json();
            setArticles(data);
        } catch (error) {
            console.error('Error fetching articles:', error);
        }
    };

    const fetchFeaturedArticles = async () => {
        try {
            const response = await fetch('/api/knowledge-base?featured=true');
            const data = await response.json();
            setFeaturedArticles(data.slice(0, 3));
            setLoading(false);
        } catch (error) {
            console.error('Error fetching featured articles:', error);
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchArticles();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white/50">Loading knowledge base...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <PublicPageHero
                eyebrow="Documentation"
                title="Knowledge"
                titleAccent="Base"
                description="Find answers to common questions, learn about our services, and get help with your Linux VPS hosting."
                badge={
                    <span className="premium-chip inline-flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Guides · Tutorials · Support Articles
                    </span>
                }
            >
                <form onSubmit={handleSearch} className="max-w-2xl mx-auto w-full min-w-0">
                    <div className="relative flex flex-col sm:flex-row gap-2 sm:gap-2">
                        <div className="relative flex-1 min-w-0">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 w-5 h-5" />
                            <Input
                                type="text"
                                placeholder="Search articles, guides, and tutorials..."
                                className="pl-12 h-12 bg-white/5 border-white/10 text-white w-full"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button type="submit" className="premium-btn-primary w-full sm:w-auto px-6 h-12 shrink-0">
                            Search
                        </Button>
                    </div>
                </form>
            </PublicPageHero>

            <div className="premium-page-section">
                <div className="container mx-auto container-padding">
                    {featuredArticles.length > 0 && searchQuery === '' && (
                        <section className="mb-14">
                            <div className="flex items-center gap-2 mb-6">
                                <Star className="w-5 h-5 text-emerald-400" />
                                <h2 className="text-xl font-semibold text-white">Featured Articles</h2>
                            </div>
                            <div className="grid md:grid-cols-3 gap-6">
                                {featuredArticles.map((article) => (
                                    <Card key={article._id} className="premium-glass-card border-0 shadow-none hover:border-emerald-400/20 transition-colors">
                                        <CardHeader className="pb-2">
                                            <div className="flex items-start justify-between mb-2">
                                                <span className={difficultyStyles[article.difficulty as keyof typeof difficultyStyles] || 'premium-tag'}>
                                                    {article.difficulty}
                                                </span>
                                                <div className="flex items-center text-xs text-white/40">
                                                    <Eye className="w-3.5 h-3.5 mr-1" />
                                                    {article.views}
                                                </div>
                                            </div>
                                            <CardTitle className="text-base line-clamp-2 text-white">
                                                <Link href={`/knowledge-base/${article.slug}`} className="hover:text-emerald-300 transition-colors">
                                                    {article.title}
                                                </Link>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-white/45 mb-4 line-clamp-3">{article.excerpt}</p>
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {article.tags.slice(0, 2).map((tag) => (
                                                        <span key={tag} className="premium-tag text-[10px]">{tag}</span>
                                                    ))}
                                                </div>
                                                <Link href={`/knowledge-base/${article.slug}`}>
                                                    <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10">
                                                        Read More <ChevronRight className="w-4 h-4 ml-1" />
                                                    </Button>
                                                </Link>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    )}

                    <div className="grid lg:grid-cols-4 gap-6 lg:gap-8 min-w-0">
                        <div className="lg:col-span-1 min-w-0">
                            <Card className="premium-glass-card border-0 shadow-none lg:sticky lg:top-24">
                                <CardHeader>
                                    <CardTitle className="text-base text-white">Categories</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1">
                                    {categories.map((category) => {
                                        const Icon = category.icon;
                                        const active = selectedCategory === category.id;
                                        return (
                                            <button
                                                key={category.id}
                                                onClick={() => setSelectedCategory(category.id)}
                                                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3 text-sm ${
                                                    active
                                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20'
                                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-400' : 'text-white/40'}`} />
                                                {category.name}
                                            </button>
                                        );
                                    })}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="lg:col-span-3 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
                                <h2 className="text-xl font-semibold text-white">
                                    {selectedCategory === 'all' ? 'All Articles' : categories.find(c => c.id === selectedCategory)?.name}
                                </h2>
                                <p className="text-sm text-white/45">
                                    {articles.length} article{articles.length !== 1 ? 's' : ''} found
                                </p>
                            </div>

                            {articles.length > 0 ? (
                                <div className="space-y-4">
                                    {articles.map((article) => (
                                        <Card key={article._id} className="premium-glass-card border-0 shadow-none hover:border-emerald-400/15 transition-colors">
                                            <CardContent className="p-6">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center flex-wrap gap-2">
                                                        <span className={difficultyStyles[article.difficulty as keyof typeof difficultyStyles] || 'premium-tag'}>
                                                            {article.difficulty}
                                                        </span>
                                                        <span className="premium-tag text-[10px]">
                                                            {categories.find(c => c.id === article.category)?.name || article.category}
                                                        </span>
                                                        {article.featured && (
                                                            <span className="premium-tag text-[10px] inline-flex items-center gap-1">
                                                                <Star className="w-3 h-3" />
                                                                Featured
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center text-xs text-white/40">
                                                        <Eye className="w-3.5 h-3.5 mr-1" />
                                                        {article.views}
                                                    </div>
                                                </div>

                                                <Link href={`/knowledge-base/${article.slug}`}>
                                                    <h3 className="text-lg font-semibold mb-2 text-white hover:text-emerald-300 transition-colors">
                                                        {article.title}
                                                    </h3>
                                                </Link>

                                                <p className="text-sm text-white/45 mb-4 line-clamp-2">{article.excerpt}</p>

                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center text-xs text-white/40">
                                                        <Clock className="w-3.5 h-3.5 mr-1" />
                                                        {new Date(article.createdAt).toLocaleDateString()}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {article.tags.slice(0, 3).map((tag) => (
                                                            <span key={tag} className="premium-tag text-[10px]">{tag}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="premium-cta-box py-12">
                                    <BookOpen className="w-12 h-12 text-emerald-400/60 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-white mb-2">No articles found</h3>
                                    <p className="text-white/45 mb-6">
                                        {searchQuery
                                            ? `No articles match your search for "${searchQuery}"`
                                            : 'No articles available in this category yet.'}
                                    </p>
                                    {searchQuery && (
                                        <Button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }} className="premium-btn-outline w-auto px-6">
                                            Clear Search
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
