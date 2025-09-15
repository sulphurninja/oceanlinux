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
  'Getting Started': { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: '🚀' },
  'VPS Management': { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: '⚙️' },
  'Security': { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: '🛡️' },
  'Troubleshooting': { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', icon: '🔧' },
  'Billing': { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300', icon: '💰' },
  'General': { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', icon: '📚' }
};

// Comprehensive custom markdown parser
function parseMarkdown(content: string): string {
  let html = content;

  // First, escape any existing HTML
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert code blocks first (to preserve them from other processing)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'text';
    return `<pre class="code-block"><code class="language-${language}">${code.trim()}</code></pre>`;
  });

  // Convert inline code (but not if it's in a code block)
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Convert headings
  html = html.replace(/^### (.*$)/gim, (match, title) => {
    const id = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `<h3 id="${id}" class="heading-3">${title}</h3>`;
  });
  html = html.replace(/^## (.*$)/gim, (match, title) => {
    const id = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `<h2 id="${id}" class="heading-2">${title}</h2>`;
  });
  html = html.replace(/^# (.*$)/gim, (match, title) => {
    const id = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `<h1 id="${id}" class="heading-1">${title}</h1>`;
  });

  // Convert bold text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Convert italic text
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Convert numbered lists
  html = html.replace(/^\d+\.\s+\*\*(.*?)\*\*:\s*(.*$)/gim, '<li><strong>$1</strong>: $2</li>');
  html = html.replace(/^\d+\.\s+(.*$)/gim, '<li>$1</li>');

  // Wrap consecutive list items in ol tags
  html = html.replace(/(<li>.*<\/li>\s*)+/gs, '<ol>$&</ol>');

  // Convert bullet points
  html = html.replace(/^[\*\-]\s+(.*$)/gim, '<li>$1</li>');

  // Wrap consecutive bullet points in ul tags (if not already in ol)
  html = html.replace(/(<li>.*<\/li>)(?![^<]*<\/ol>)/gs, '<ul>$1</ul>');

  // Convert line breaks to paragraphs
  html = html.split('\n\n').map(paragraph => {
    paragraph = paragraph.trim();
    if (!paragraph) return '';

    // Don't wrap headings, lists, or code blocks in paragraphs
    if (paragraph.match(/^<(h[1-6]|ul|ol|pre)/)) {
      return paragraph;
    }

    return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
  }).filter(p => p).join('\n\n');

  // Clean up any double wrapping
  html = html.replace(/<p>(<h[1-6][^>]*>.*?<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>.*?<\/ul>)<\/p>/gs, '$1');
  html = html.replace(/<p>(<ol>.*?<\/ol>)<\/p>/gs, '$1');
  html = html.replace(/<p>(<pre>.*?<\/pre>)<\/p>/gs, '$1');

  return html;
}

export default function ArticleContent({ article, relatedArticles }: Props) {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [formattedContent, setFormattedContent] = useState('');

  useEffect(() => {
    // Parse the markdown content
    const htmlContent = parseMarkdown(article.content);
    setFormattedContent(htmlContent);
    console.log('Original content:', article.content.substring(0, 200));
    console.log('Formatted content:', htmlContent.substring(0, 200));
  }, [article.content]);

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

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>/</span>
          <Link href="/knowledge-base" className="hover:text-foreground transition-colors">Knowledge Base</Link>
          <span>/</span>
          <Link href={`/knowledge-base?category=${article.category}`} className="hover:text-foreground transition-colors">
            {article.category}
          </Link>
          <span>/</span>
          <span className="text-foreground truncate">{article.title}</span>
        </nav>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <article className="max-w-none">
              {/* Article Header */}
              <header className="mb-10">
                <div className="flex items-center gap-2 mb-6">
                  <Badge className={categoryInfo.color}>
                    <span className="mr-1">{categoryInfo.icon}</span>
                    {article.category}
                  </Badge>
                  {article.aiGenerated && (
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300">
                      🤖 AI Generated
                    </Badge>
                  )}
                </div>

                <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-6 text-foreground">
                  {article.title}
                </h1>

                <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                  {article.excerpt}
                </p>

                <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground mb-6">
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
                {article.tags && article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {article.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <Separator />
              </header>

              {/* Article Content */}
              <div className="article-content prose prose-lg max-w-none">
                <div dangerouslySetInnerHTML={{ __html: formattedContent }} />
              </div>

              {/* Article Footer */}
              <footer className="mt-16 pt-8 border-t">
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
                  <p className="text-xs text-muted-foreground mt-6">
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
                  <TableOfContents content={formattedContent} />
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
                  <Link href="/contact">
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
        <div className="flex items-center justify-between mt-16 pt-8 border-t">
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
          className="fixed bottom-6 right-6 rounded-full w-12 h-12 p-0 shadow-lg z-40"
          onClick={scrollToTop}
        >
          <ChevronUp className="w-5 h-5" />
        </Button>
      )}

      <Footer />
    </div>
  );
}

// Enhanced Table of Contents Component
function TableOfContents({ content }: { content: string }) {
  const [toc, setToc] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (!content) return;

    // Parse headings from the HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');

    const tocItems = Array.from(headings).map((heading) => {
      const level = parseInt(heading.tagName.charAt(1));
      const text = heading.textContent || '';
      const id = heading.id || text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

      return { id, text, level };
    });

    setToc(tocItems);

    // Set up intersection observer for active heading tracking
    const observerOptions = {
      rootMargin: '-100px 0px -80% 0px',
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveId(entry.target.id);
        }
      });
    }, observerOptions);

    // Observe headings in the document after content is rendered
    const timer = setTimeout(() => {
      const actualHeadings = document.querySelectorAll('.article-content h1, .article-content h2, .article-content h3, .article-content h4, .article-content h5, .article-content h6');
      actualHeadings.forEach(heading => {
        if (heading.id) observer.observe(heading);
      });
    }, 500);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [content]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 120; // Account for fixed header and padding
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
    <nav className="space-y-1 max-h-96 overflow-y-auto">
      {toc.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollToHeading(item.id)}
          className={`
            block w-full text-left text-sm transition-colors py-2 px-3 rounded-md
            ${activeId === item.id
              ? 'text-primary bg-primary/10 font-medium border-l-2 border-primary'
              : 'hover:text-primary hover:bg-muted'
            }
            ${item.level === 1 ? 'font-medium text-base' : ''}
            ${item.level === 2 ? 'font-medium' : ''}
            ${item.level > 2 ? 'text-muted-foreground text-xs' : ''}
          `}
          style={{
            paddingLeft: `${(item.level - 1) * 16 + 12}px`,
            marginLeft: activeId === item.id ? '-2px' : '0'
          }}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
}
