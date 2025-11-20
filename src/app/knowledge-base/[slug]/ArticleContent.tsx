"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Twitter,
  Facebook,
  Linkedin,
  Menu,
  X
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
  'Getting Started': { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '🚀' },
  'VPS Management': { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '⚙️' },
  'Security': { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🛡️' },
  'Troubleshooting': { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '🔧' },
  'Billing': { color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '💰' },
  'General': { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: '📚' }
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
  html = html.replace(/(<li>.*<\/li>\s*)+/g, '<ol>$&</ol>');

  // Convert bullet points
  html = html.replace(/^[\*\-]\s+(.*$)/gim, '<li>$1</li>');

  // Wrap consecutive bullet points in ul tags (if not already in ol)
  html = html.replace(/(<li>.*<\/li>)(?![^<]*<\/ol>)/g, '<ul>$1</ul>');

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
  html = html.replace(/<p>(<ul>.*?<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ol>.*?<\/ol>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>.*?<\/pre>)<\/p>/g, '$1');

  return html;
}

export default function ArticleContent({ article, relatedArticles }: Props) {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [formattedContent, setFormattedContent] = useState('');
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    // Force dark mode
    document.documentElement.classList.add('dark');
    
    // Parse the markdown content
    const htmlContent = parseMarkdown(article.content);
    setFormattedContent(htmlContent);
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
    <div className="min-h-screen bg-[#0a0a0a] dark">
      <Header />

      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-white/5 z-50">
        <div
          className="h-full bg-primary transition-all duration-150"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* Mobile TOC Toggle */}
      <button
        onClick={() => setTocOpen(!tocOpen)}
        className="lg:hidden fixed bottom-20 right-4 z-40 bg-primary text-white rounded-full p-3 shadow-lg hover:bg-primary/90 transition-colors"
      >
        {tocOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Breadcrumb */}
        <div className="max-w-7xl mx-auto mb-6">
          <nav className="flex items-center space-x-2 text-sm text-white/50">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/knowledge-base" className="hover:text-white transition-colors">Knowledge Base</Link>
            <span>/</span>
            <Link href={`/knowledge-base?category=${article.category}`} className="hover:text-white transition-colors">
              {article.category}
            </Link>
            <span>/</span>
            <span className="text-white truncate max-w-[150px] sm:max-w-[300px] lg:max-w-none">{article.title}</span>
          </nav>
        </div>

        {/* Full Width Layout */}
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_300px] gap-8 lg:gap-12">
            {/* Main Content - Full Width */}
            <article className="min-w-0">
              {/* Article Header */}
              <header className="mb-10">
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <Badge className={`${categoryInfo.color} border`}>
                    <span className="mr-1">{categoryInfo.icon}</span>
                    {article.category}
                  </Badge>
                  {article.aiGenerated && (
                    <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      🤖 AI Generated
                    </Badge>
                  )}
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-6 text-white">
                  {article.title}
                </h1>

                <p className="text-lg sm:text-xl text-white/70 mb-8 leading-relaxed">
                  {article.excerpt}
                </p>

                <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-white/60 mb-6">
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
                      <Badge key={tag} className="bg-white/5 text-white/70 border border-white/10 text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="h-px bg-white/10 mb-8"></div>
              </header>

              {/* Article Content */}
              <div className="article-content prose prose-lg prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ __html: formattedContent }} />
              </div>

              {/* Article Footer */}
              <footer className="mt-16 pt-8 border-t border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Button
                      variant={liked ? "default" : "outline"}
                      size="sm"
                      onClick={handleLike}
                      className={`flex items-center ${liked ? 'bg-primary text-white' : 'bg-white/5 text-white/70 border-white/20 hover:bg-white/10'}`}
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      {liked ? 'Liked' : 'Like'} ({article.likes})
                    </Button>
                    <Button
                      variant={bookmarked ? "default" : "outline"}
                      size="sm"
                      onClick={handleBookmark}
                      className={`flex items-center ${bookmarked ? 'bg-primary text-white' : 'bg-white/5 text-white/70 border-white/20 hover:bg-white/10'}`}
                    >
                      <Bookmark className="w-4 h-4 mr-2" />
                      {bookmarked ? 'Saved' : 'Save'}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/50 mr-2">Share:</span>
                    <Button variant="outline" size="sm" onClick={shareOnTwitter} className="bg-white/5 text-white/70 border-white/20 hover:bg-white/10">
                      <Twitter className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={shareOnFacebook} className="bg-white/5 text-white/70 border-white/20 hover:bg-white/10">
                      <Facebook className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={shareOnLinkedIn} className="bg-white/5 text-white/70 border-white/20 hover:bg-white/10">
                      <Linkedin className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={copyToClipboard} className="bg-white/5 text-white/70 border-white/20 hover:bg-white/10">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {article.lastModified && (
                  <p className="text-xs text-white/40 mt-6">
                    Last updated: {new Date(article.lastModified).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                )}
              </footer>

              {/* Related Articles - Mobile */}
              {relatedArticles.length > 0 && (
                <div className="lg:hidden mt-12 pt-8 border-t border-white/10">
                  <h3 className="text-xl font-semibold text-white mb-4">Related Articles</h3>
                  <div className="space-y-4">
                    {relatedArticles.map((related) => (
                      <Link key={related._id} href={`/knowledge-base/${related.slug}`}>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                          <h4 className="font-medium text-white line-clamp-2 mb-2">
                            {related.title}
                          </h4>
                          <p className="text-sm text-white/60 line-clamp-2 mb-3">
                            {related.excerpt}
                          </p>
                          <div className="flex items-center text-xs text-white/50">
                            <Clock className="w-3 h-3 mr-1" />
                            {related.readTime} min
                            <Eye className="w-3 h-3 mr-1 ml-3" />
                            {related.views}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-12 pt-8 border-t border-white/10">
                <Link href="/knowledge-base">
                  <Button variant="outline" className="bg-white/5 text-white/70 border-white/20 hover:bg-white/10 w-full sm:w-auto">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Knowledge Base
                  </Button>
                </Link>

                {relatedArticles.length > 0 && (
                  <Link href={`/knowledge-base/${relatedArticles[0].slug}`}>
                    <Button variant="outline" className="bg-white/5 text-white/70 border-white/20 hover:bg-white/10 w-full sm:w-auto">
                      Next Article
                      <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                    </Button>
                  </Link>
                )}
              </div>
            </article>

            {/* Sidebar - Desktop & Mobile Overlay */}
            <aside className={`
              lg:block lg:sticky lg:top-24 lg:h-fit
              ${tocOpen ? 'fixed' : 'hidden'}
              lg:relative inset-0 lg:inset-auto
              z-50 lg:z-auto
              bg-[#0a0a0a] lg:bg-transparent
              p-6 lg:p-0
              overflow-y-auto lg:overflow-visible
            `}>
              {/* Mobile Close Button */}
              <button
                onClick={() => setTocOpen(false)}
                className="lg:hidden absolute top-4 right-4 text-white/70 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="space-y-6">
                {/* Table of Contents */}
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <h3 className="font-semibold text-white mb-4 text-lg">Table of Contents</h3>
                  <TableOfContents content={formattedContent} onItemClick={() => setTocOpen(false)} />
                </div>

                {/* Related Articles - Desktop */}
                {relatedArticles.length > 0 && (
                  <div className="hidden lg:block bg-white/5 border border-white/10 rounded-lg p-4">
                    <h3 className="font-semibold text-white mb-4">Related Articles</h3>
                    <div className="space-y-3">
                      {relatedArticles.map((related) => (
                        <Link key={related._id} href={`/knowledge-base/${related.slug}`}>
                          <div className="p-3 rounded-lg hover:bg-white/10 transition-colors">
                            <h4 className="font-medium text-white text-sm line-clamp-2 mb-1">
                              {related.title}
                            </h4>
                            <p className="text-xs text-white/60 line-clamp-2 mb-2">
                              {related.excerpt}
                            </p>
                            <div className="flex items-center text-xs text-white/50">
                              <Clock className="w-3 h-3 mr-1" />
                              {related.readTime} min
                              <Eye className="w-3 h-3 mr-1 ml-2" />
                              {related.views}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <Button
          className="fixed bottom-6 right-6 rounded-full w-12 h-12 p-0 shadow-lg z-40 bg-primary text-white hover:bg-primary/90"
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
function TableOfContents({ content, onItemClick }: { content: string; onItemClick?: () => void }) {
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
      const offset = 120;
      const top = element.offsetTop - offset;
      window.scrollTo({ top, behavior: 'smooth' });
      onItemClick?.();
    }
  };

  if (toc.length === 0) {
    return (
      <p className="text-sm text-white/50">No headings found in this article.</p>
    );
  }

  return (
    <nav className="space-y-1 max-h-[60vh] lg:max-h-96 overflow-y-auto">
      {toc.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollToHeading(item.id)}
          className={`
            block w-full text-left text-sm transition-colors py-2 px-3 rounded-md
            ${activeId === item.id
              ? 'text-primary bg-primary/10 font-medium border-l-2 border-primary'
              : 'text-white/70 hover:text-white hover:bg-white/5'
            }
            ${item.level === 1 ? 'font-medium' : ''}
            ${item.level === 2 ? 'font-medium' : ''}
            ${item.level > 2 ? 'text-white/60 text-xs' : ''}
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
