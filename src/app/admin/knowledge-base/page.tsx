"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  BookOpen,
  Users,
  Calendar,
  TrendingUp,
  Loader2,
  RefreshCw,
  Wand2,
  FileText,
  Globe,
  Star,
  Clock
} from "lucide-react";
import { toast } from 'sonner';
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Article {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  author: {
    name: string;
    email: string;
  };
  published: boolean;
  featured: boolean;
  views: number;
  likes: number;
  readTime: number;
  aiGenerated?: boolean;
  createdAt: string;
  lastModified: string;
}

interface AIGenerationForm {
  prompt: string;
  category: string;
  tone: string;
  length: string;
  includeCode: boolean;
}

const categories = [
  'Getting Started',
  'VPS Management',
  'Security',
  'Troubleshooting',
  'Billing',
  'General'
];

export default function AdminKnowledgeBasePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [publishedFilter, setPublishedFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiForm, setAiForm] = useState<AIGenerationForm>({
    prompt: '',
    category: 'General',
    tone: 'professional',
    length: 'medium',
    includeCode: false
  });

  useEffect(() => {
    fetchArticles();
  }, [currentPage, searchQuery, categoryFilter, publishedFilter, sortBy, sortOrder]);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        sortBy,
        sortOrder
      });

      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (publishedFilter !== 'all') params.append('published', publishedFilter);

      const response = await fetch(`/api/admin/knowledge-base?${params.toString()}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setArticles(data.articles);
        setTotalPages(data.pagination.totalPages);
      } else {
        toast.error('Failed to fetch articles');
      }
    } catch (error) {
      console.error('Error fetching articles:', error);
      toast.error('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!aiForm.prompt.trim()) {
      toast.error('Please enter a topic or prompt');
      return;
    }

    setAiGenerating(true);
    try {
      const response = await fetch('/api/admin/knowledge-base/generate', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(aiForm)
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Article "${data.article.title}" generated successfully!`);
        setShowAIDialog(false);
        setAiForm({
          prompt: '',
          category: 'General',
          tone: 'professional',
          length: 'medium',
          includeCode: false
        });
        fetchArticles();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to generate article');
      }
    } catch (error) {
      console.error('Error generating article:', error);
      toast.error('Failed to generate article');
    } finally {
      setAiGenerating(false);
    }
  };

  const togglePublished = async (articleId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/knowledge-base/${articleId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ published: !currentStatus })
      });

      if (response.ok) {
        toast.success(`Article ${!currentStatus ? 'published' : 'unpublished'}`);
        fetchArticles();
      } else {
        toast.error('Failed to update article');
      }
    } catch (error) {
      console.error('Error updating article:', error);
      toast.error('Failed to update article');
    }
  };

  const deleteArticle = async (articleId: string) => {
    if (!confirm('Are you sure you want to delete this article?')) return;

    try {
      const response = await fetch(`/api/admin/knowledge-base/${articleId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Article deleted successfully');
        fetchArticles();
      } else {
        toast.error('Failed to delete article');
      }
    } catch (error) {
      console.error('Error deleting article:', error);
      toast.error('Failed to delete article');
    }
  };

  if (loading && articles.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading articles...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">Manage articles and documentation</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={fetchArticles} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={() => setShowAIDialog(true)} variant="outline">
            <Wand2 className="w-4 h-4 mr-2" />
            AI Generate
          </Button>
          <Link href="/admin/knowledge-base/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Article
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Total Articles</p>
                <p className="text-2xl font-bold">{articles.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">Published</p>
                <p className="text-2xl font-bold">{articles.filter(a => a.published).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Total Views</p>
                <p className="text-2xl font-bold">{articles.reduce((sum, a) => sum + a.views, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Wand2 className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-sm font-medium">AI Generated</p>
                <p className="text-2xl font-bold">{articles.filter(a => a.aiGenerated).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters & Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={publishedFilter} onValueChange={setPublishedFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="true">Published</SelectItem>
                <SelectItem value="false">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Created Date</SelectItem>
                <SelectItem value="lastModified">Modified Date</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="views">Views</SelectItem>
                <SelectItem value="likes">Likes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
</div>
        </CardContent>
      </Card>

      {/* Articles Table */}
      <Card>
        <CardHeader>
          <CardTitle>Articles ({articles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {articles.map((article) => (
              <div key={article._id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    {article.aiGenerated && (
                      <div className="bg-purple-100 text-purple-700 p-1 rounded mb-1">
                        <Wand2 className="w-3 h-3" />
                      </div>
                    )}
                    {article.featured && (
                      <Star className="w-4 h-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-medium text-lg">{article.title}</h3>
                      {article.published ? (
                        <Badge className="bg-green-100 text-green-800">Published</Badge>
                      ) : (
                        <Badge variant="secondary">Draft</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                      {article.excerpt}
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center">
                        <Users className="w-3 h-3 mr-1" />
                        {article.author.name}
                      </span>
                      <span className="flex items-center">
                        <BookOpen className="w-3 h-3 mr-1" />
                        {article.category}
                      </span>
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {article.readTime} min read
                      </span>
                      <span className="flex items-center">
                        <Eye className="w-3 h-3 mr-1" />
                        {article.views} views
                      </span>
                      <span className="flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(article.createdAt).toLocaleDateString()}
                      </span>
                      {article.tags && article.tags.length > 0 && (
                        <div className="flex items-center space-x-1">
                          {article.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {article.tags.length > 3 && (
                            <span className="text-xs">+{article.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => togglePublished(article._id, article.published)}
                  >
                    {article.published ? 'Unpublish' : 'Publish'}
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <Link href={`/knowledge-base/${article.slug}`} target="_blank">
                        <DropdownMenuItem>
                          <Eye className="w-4 h-4 mr-2" />
                          View Article
                        </DropdownMenuItem>
                      </Link>
                      <Link href={`/admin/knowledge-base/edit/${article._id}`}>
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Article
                        </DropdownMenuItem>
                      </Link>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deleteArticle(article._id)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Article
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            {articles.length === 0 && !loading && (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No articles found</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {searchQuery || categoryFilter !== 'all' || publishedFilter !== 'all'
                    ? 'No articles match your current filters.'
                    : 'Start by creating your first article or generate one with AI.'
                  }
                </p>
                <div className="flex justify-center space-x-2">
                  <Button onClick={() => setShowAIDialog(true)} variant="outline">
                    <Wand2 className="w-4 h-4 mr-2" />
                    Generate with AI
                  </Button>
                  <Link href="/admin/knowledge-base/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Article
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* AI Generation Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Wand2 className="w-5 h-5 mr-2" />
              Generate Article with AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Topic/Prompt *</label>
              <Textarea
                placeholder="e.g., How to secure a Linux VPS server, Setting up Docker on Ubuntu, Best practices for database backups..."
                value={aiForm.prompt}
                onChange={(e) => setAiForm({ ...aiForm, prompt: e.target.value })}
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={aiForm.category}
                  onValueChange={(value) => setAiForm({ ...aiForm, category: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Tone</label>
                <Select
                  value={aiForm.tone}
                  onValueChange={(value) => setAiForm({ ...aiForm, tone: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="beginner-friendly">Beginner Friendly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Length</label>
                <Select
                  value={aiForm.length}
                  onValueChange={(value) => setAiForm({ ...aiForm, length: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (300-500 words)</SelectItem>
                    <SelectItem value="medium">Medium (800-1200 words)</SelectItem>
                    <SelectItem value="long">Long (1500-2000 words)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiForm.includeCode}
                    onChange={(e) => setAiForm({ ...aiForm, includeCode: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Include code examples</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAIDialog(false)}
                disabled={aiGenerating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAIGenerate}
                disabled={aiGenerating || !aiForm.prompt.trim()}
              >
                {aiGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Generate Article
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
