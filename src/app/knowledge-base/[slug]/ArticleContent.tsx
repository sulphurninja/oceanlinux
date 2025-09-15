"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Clock,
  Eye,
  Calendar,
  User,
  Share2,
  Bookmark,
  ThumbsUp,
  Copy,
  Check,
  ChevronUp,
  MessageCircle,
  Twitter,
  Facebook,
  Linkedin
} from "lucide-react";
import Link from "next/link";
import { toast } from 'sonner';
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

interface Article {
  _id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: string;
  tags: string[];
  author: {
    _id: string;
    name: string;
    email: string;
  } | null;
  readTime: number;
  views: number;
  likes: number;
  createdAt: string;
  lastModified?: string;
  aiGenerated?: boolean;
}

interface RelatedArticle {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  readTime: number;
  views: number;
  createdAt: string;
}

interface Props {
  article: Article;
  relatedArticles: RelatedArticle[];
}

const categoryConfig = {
  'Getting Started': { color: 'bg-green-100 text-green-800', icon: '🚀' },
  'VPS Management': { color: 'bg-blue-100 text-blue-800', icon: '⚙️' },
  'Security': { color: 'bg-red-100 text-red-800', icon: '🛡️' },
  'Troubleshooting': { color: 'bg-orange-100 text-orange-800', icon: '🔧' },
  'Billing': { color: 'bg-purple-100 text-purple-800', icon: '💰' },
  'General': { color: 'bg-gray-100 text-gray-800', icon: '📚' }
};

export default function ArticleContent({ article, relatedArticles }: Props) {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      // Show scroll to top button
      setShowScrollTop(window.scrollY > 400);

      // Calculate reading progress
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight - windowHeight;
      const scrollTop = window.scrollY;
      const progress = (scrollTop / documentHeight) * 100;
      setReadingProgress(Math.min(progress, 100));
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLike = async () => {
    try {
      const response = await fetch(`/api/knowledge-base/${article.slug}/like`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        setLiked(!liked);
        toast.success(liked ? 'Like removed' : 'Article liked!');
      }
    } catch (error) {
      toast.error('Failed to like article');
    }
  };

  const handleBookmark = () => {
    setBookmarked(!bookmarked);
    toast.success(bookmarked ? 'Bookmark removed' : 'Article bookmarked!');
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const shareOnTwitter = () => {
    const text = `Check out this article: ${article.title}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const shareOnFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const shareOnLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const categoryInfo = categoryConfig[article.category as keyof typeof categoryConfig] || categoryConfig['General'];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-muted z-50">
        <div
          className="h-full bg-primary transition-all duration-150"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <Link href="/knowledge-base" className="hover:text-foreground">Knowledge Base</Link>
          <span>/</span>
          <Link href={`/knowledge-base?category=${article.category.toLowerCase().replace(' ', '-')}`} className="hover:text-foreground">
            {article.category}
          </Link>
          <span>/</span>
          <span className="text-foreground">{article.title}</span>
        </nav>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <article className="max-w-none">
              {/* Article Header */}
              <header className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Badge className={categoryInfo.color}>
                    <span className="mr-1">{categoryInfo.icon}</span>
                    {article.category}
                  </Badge>
                  {article.aiGenerated && (
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      🤖 AI Generated
                    </Badge>
                  )}
                </div>

                <h1 className="text-3xl lg:text-4xl font-bold leading-tight mb-4">
                  {article.title}
                </h1>

                <p className="text-xl text-muted-foreground mb-6">
                  {article.excerpt}
                </p>

                <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                  {article.author && (
                    <div className="flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      By {article.author.name}
                    </div>
                  )}
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    {new Date(article.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    {article.readTime} min read
                  </div>
                  <div className="flex items-center">
                    <Eye className="w-4 h-4 mr-2" />
                    {article.views.toLocaleString()} views
                  </div>
                </div>

                {/* Tags */}
                {article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {article.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <Separator className="mt-6" />
              </header>

              {/* Article Content */}
              <div
                className="prose prose-lg max-w-none dark:prose-invert
                  prose-headings:scroll-m-20 prose-headings:font-semibold
                  prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
                  prose-p:leading-7 prose-p:text-muted-foreground
                  prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                  prose-blockquote:border-l-primary prose-blockquote:pl-6 prose-blockquote:italic
                  prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                  prose-pre:bg-muted prose-pre:border
                  prose-img:rounded-lg prose-img:shadow-lg
                  prose-table:border prose-th:border prose-td:border prose-th:bg-muted
                  prose-ul:list-disc prose-ol:list-decimal"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />

              {/* Article Footer */}
              <footer className="mt-12 pt-8 border-t">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <Button
                      variant={liked ? "default" : "outline"}
                      size="sm"
                      onClick={handleLike}
                      className="flex items-center"
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      {liked ? 'Liked' : 'Like'} ({article.likes})
                    </Button>
                    <Button
                      variant={bookmarked ? "default" : "outline"}
                      size="sm"
                      onClick={handleBookmark}
                      className="flex items-center"
                    >
                      <Bookmark className="w-4 h-4 mr-2" />
                      {bookmarked ? 'Saved' : 'Save'}
                    </Button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground mr-2">Share:</span>
                    <Button variant="outline" size="sm" onClick={shareOnTwitter}>
                      <Twitter className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={shareOnFacebook}>
                      <Facebook className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={shareOnLinkedIn}>
                      <Linkedin className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={copyToClipboard}>
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {article.lastModified && (
                  <p className="text-xs text-muted-foreground mt-4">
                    Last updated: {new Date(article.lastModified).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                )}
              </footer>
            </article>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {/* Table of Contents */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Table of Contents</h3>
                  <TableOfContents content={article.content} />
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Quick Actions</h3>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleLike}>
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      {liked ? 'Unlike' : 'Like this article'}
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleBookmark}>
                      <Bookmark className="w-4 h-4 mr-2" />
                      {bookmarked ? 'Remove bookmark' : 'Bookmark'}
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start" onClick={copyToClipboard}>
                      <Share2 className="w-4 h-4 mr-2" />
                      Share article
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Related Articles */}
              {relatedArticles.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Related Articles</h3>
                    <div className="space-y-3">
                      {relatedArticles.map((related) => (
                        <Link key={related._id} href={`/knowledge-base/${related.slug}`}>
                          <div className="p-3 rounded-lg hover:bg-muted transition-colors">
                            <h4 className="font-medium text-sm line-clamp-2 mb-1">
                              {related.title}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {related.excerpt}
                            </p>
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Clock className="w-3 h-3 mr-1" />
                              {related.readTime} min
                              <Eye className="w-3 h-3 mr-1 ml-2" />
                              {related.views}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Help Section */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Need Help?</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Can't find what you're looking for? Our support team is here to help.
                  </p>
                  <Link href="/support/tickets">
                    <Button size="sm" className="w-full">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Contact Support
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-12 pt-8 border-t">
          <Link href="/knowledge-base">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Knowledge Base
            </Button>
          </Link>

          {relatedArticles.length > 0 && (
            <Link href={`/knowledge-base/${relatedArticles[0].slug}`}>
              <Button variant="outline">
                Next Article
                <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <Button
          className="fixed bottom-6 right-6 rounded-full w-12 h-12 p-0 shadow-lg"
          onClick={scrollToTop}
        >
          <ChevronUp className="w-5 h-5" />
        </Button>
      )}

      <Footer />
    </div>
  );
}

// Table of Contents Component
function TableOfContents({ content }: { content: string }) {
  const [toc, setToc] = useState<Array<{ id: string; text: string; level: number }>>([]);

  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');

    const tocItems = Array.from(headings).map((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1));
      const text = heading.textContent || '';
      const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

      // Add id to heading if it doesn't exist
      if (!heading.id) {
        heading.id = id;
      }

      return { id, text, level };
    });

    setToc(tocItems);
  }, [content]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100; // Account for fixed header
      const top = element.offsetTop - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  if (toc.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No headings found in this article.</p>
    );
  }

  return (
    <nav className="space-y-1">
      {toc.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollToHeading(item.id)}
          className={`
            block w-full text-left text-sm hover:text-primary transition-colors
            ${item.level === 1 ? 'font-medium' : ''}
            ${item.level > 2 ? 'text-muted-foreground' : ''}
          `}
          style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
}
