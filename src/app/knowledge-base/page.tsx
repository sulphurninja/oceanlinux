"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, Clock, Eye, Star, ChevronRight } from "lucide-react";
import Link from "next/link";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

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

const categories = [
    { id: 'all', name: 'All Articles', icon: '📚' },
    { id: 'getting-started', name: 'Getting Started', icon: '🚀' },
    { id: 'server-management', name: 'Server Management', icon: '⚙️' },
    { id: 'billing', name: 'Billing & Pricing', icon: '💰' },
    { id: 'troubleshooting', name: 'Troubleshooting', icon: '🔧' },
    { id: 'security', name: 'Security', icon: '🛡️' },
    { id: 'performance', name: 'Performance', icon: '⚡' }
];

const difficultyColors = {
    beginner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    intermediate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    advanced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
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
            <div className="min-h-screen bg-background">
                <Header />
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Loading knowledge base...</p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <Header />

            {/* Hero Section */}
            <section className="bg-gradient-to-br from-primary/10 to-secondary/10 py-16">
                <div className="container mx-auto px-4">
                    <div className="text-center mb-12">
                        <div className="flex items-center justify-center mb-4">
                            <BookOpen className="w-12 h-12 text-primary mr-4" />
                            <h1 className="text-4xl lg:text-5xl font-bold">Knowledge Base</h1>
                        </div>
                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                            Find answers to common questions, learn about our services, and get help with your Linux VPS hosting.
                        </p>

                        {/* Search Bar */}
                        <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                <Input
                                    type="text"
                                    placeholder="Search for articles, guides, and tutorials..."
                                    className="pl-12 pr-4 py-4 text-lg"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <Button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                    Search
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </section>

            <div className="container mx-auto px-4 py-16">
                {/* Featured Articles */}
                {featuredArticles.length > 0 && searchQuery === '' && (
                    <section className="mb-16">
                        <div className="flex items-center mb-8">
                            <Star className="w-6 h-6 text-yellow-500 mr-2" />
                            <h2 className="text-2xl font-bold">Featured Articles</h2>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6">
                            {featuredArticles.map((article) => (
                                <Card key={article._id} className="hover:shadow-lg transition-shadow">
                                    <CardHeader>
                                        <div className="flex items-start justify-between mb-2">
                                            <Badge className={difficultyColors[article.difficulty as keyof typeof difficultyColors]}>
                                                {article.difficulty}
                                            </Badge>
                                            <div className="flex items-center text-sm text-muted-foreground">
                                                <Eye className="w-4 h-4 mr-1" />
                                                {article.views}
                                            </div>
                                        </div>
                                        <CardTitle className="text-lg line-clamp-2">
                                            <Link href={`/knowledge-base/${article.slug}`} className="hover:text-primary">
                                                {article.title}
                                            </Link>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground mb-4 line-clamp-3">
                                            {article.excerpt}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-wrap gap-2">
                                                {article.tags.slice(0, 2).map((tag) => (
                                                    <Badge key={tag} variant="outline" className="text-xs">
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                            <Link href={`/knowledge-base/${article.slug}`}>
                                                <Button variant="ghost" size="sm">
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

                <div className="grid lg:grid-cols-4 gap-8">
                    {/* Categories Sidebar */}
                    <div className="lg:col-span-1">
                        <Card className="sticky top-4">
                            <CardHeader>
                                <CardTitle className="text-lg">Categories</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {categories.map((category) => (
                                    <button
                                        key={category.id}
                                        onClick={() => setSelectedCategory(category.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center ${
                                            selectedCategory === category.id
                                                ? 'bg-primary text-primary-foreground'
                                                : 'hover:bg-muted'
                                        }`}
                                    >
                                        <span className="mr-3">{category.icon}</span>
                                        {category.name}
                                    </button>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Articles Grid */}
                    <div className="lg:col-span-3">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold">
                                {selectedCategory === 'all' ? 'All Articles' : categories.find(c => c.id === selectedCategory)?.name}
                            </h2>
                            <p className="text-muted-foreground">
                                {articles.length} article{articles.length !== 1 ? 's' : ''} found
                            </p>
                        </div>

                        {articles.length > 0 ? (
                            <div className="space-y-6">
                                {articles.map((article) => (
                                    <Card key={article._id} className="hover:shadow-lg transition-shadow">
                                        <CardContent className="p-6">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center space-x-2">
                                                    <Badge className={difficultyColors[article.difficulty as keyof typeof difficultyColors]}>
                                                        {article.difficulty}
                                                    </Badge>
                                                    <Badge variant="outline">
                                                        {categories.find(c => c.id === article.category)?.name}
                                                    </Badge>
                                                    {article.featured && (
                                                        <Badge className="bg-yellow-100 text-yellow-800">
                                                            <Star className="w-3 h-3 mr-1" />
                                                            Featured
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center text-sm text-muted-foreground">
                                                    <Eye className="w-4 h-4 mr-1" />
                                                    {article.views}
                                                </div>
                                            </div>

                                            <Link href={`/knowledge-base/${article.slug}`}>
                                                <h3 className="text-xl font-semibold mb-2 hover:text-primary transition-colors">
                                                    {article.title}
                                                </h3>
                                            </Link>

                                            <p className="text-muted-foreground mb-4 line-clamp-2">
                                                {article.excerpt}
                                            </p>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                                                    <div className="flex items-center">
                                                        <Clock className="w-4 h-4 mr-1" />
                                                        {new Date(article.createdAt).toLocaleDateString()}
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {article.tags.slice(0, 3).map((tag) => (
                                                        <Badge key={tag} variant="outline" className="text-xs">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                                <h3 className="text-xl font-semibold mb-2">No articles found</h3>
                                <p className="text-muted-foreground mb-6">
                                    {searchQuery
                                        ? `No articles match your search for "${searchQuery}"`
                                        : 'No articles available in this category yet.'
                                    }
                                </p>
                                {searchQuery && (
                                    <Button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}>
                                        Clear Search
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}
