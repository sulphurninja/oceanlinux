"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, Eye, Loader2 } from "lucide-react";
import { toast } from 'sonner';
import { useRouter, useParams } from 'next/navigation';
import Link from "next/link";
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';

const categories = [
  'Getting Started',
  'VPS Management',
  'Security',
  'Troubleshooting',
  'Billing',
  'General'
];

interface Article {
  _id: string;
  title: string;
  content: string;
  excerpt: string;
  category: string;
  tags: string[];
  published: boolean;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  aiGenerated?: boolean;
}

export default function EditArticlePage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [article, setArticle] = useState<Article | null>(null);
  const [form, setForm] = useState({
    title: '',
    content: '',
    excerpt: '',
    category: 'General',
    tags: '',
    published: false,
    featured: false,
    seoTitle: '',
    seoDescription: '',
    useMarkdown: true
  });

  useEffect(() => {
    if (params.id) {
      fetchArticle();
    }
  }, [params.id]);

  const fetchArticle = async () => {
    try {
      setFetching(true);
      const response = await fetch(`/api/admin/knowledge-base/${params.id}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setArticle(data);
        setForm({
          title: data.title || '',
          content: data.content || '',
          excerpt: data.excerpt || '',
          category: data.category || 'General',
          tags: data.tags ? data.tags.join(', ') : '',
          published: data.published || false,
          featured: data.featured || false,
          seoTitle: data.seoTitle || '',
          seoDescription: data.seoDescription || '',
          useMarkdown: data.useMarkdown !== undefined ? data.useMarkdown : true
        });
      } else if (response.status === 404) {
        toast.error('Article not found');
        router.push('/admin/knowledge-base');
      } else {
        toast.error('Failed to fetch article');
      }
    } catch (error) {
      console.error('Error fetching article:', error);
      toast.error('Failed to fetch article');
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim() || !form.content.trim() || !form.excerpt.trim()) {
      toast.error('Title, content, and excerpt are required');
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...form,
        tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        seoTitle: form.seoTitle || form.title,
        seoDescription: form.seoDescription || form.excerpt
      };

      const response = await fetch(`/api/admin/knowledge-base/${params.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
      });

      if (response.ok) {
        toast.success('Article updated successfully!');
        router.push('/admin/knowledge-base');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update article');
      }
    } catch (error) {
      console.error('Error updating article:', error);
      toast.error('Failed to update article');
    } finally {
      setLoading(false);
    }
  };

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'script': 'sub'}, { 'script': 'super' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['blockquote', 'code-block'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ],
  };

  if (fetching) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading article...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Article Not Found</h2>
          <p className="text-muted-foreground mb-8">The article you're looking for doesn't exist.</p>
          <Link href="/admin/knowledge-base">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Articles
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/knowledge-base">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Articles
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Edit Article</h1>
            <p className="text-muted-foreground">
              {article.aiGenerated && "🤖 AI Generated • "}
              Last modified: {new Date(article.lastModified || article.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            onClick={handleSubmit}
            variant="outline"
            disabled={loading}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
          {article.slug && (
            <Link href={`/knowledge-base/${article.slug}`} target="_blank">
              <Button variant="outline">
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
            </Link>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Article Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Title *</label>
                 <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Enter article title..."
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Excerpt *</label>
                  <Textarea
                    value={form.excerpt}
                    onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                    placeholder="Brief description of the article (will be shown in search results)..."
                    rows={3}
                    className="mt-1"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.excerpt.length}/200 characters
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Content *</label>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-muted-foreground">Use Markdown</span>
                      <Switch
                        checked={form.useMarkdown}
                        onCheckedChange={(checked) => setForm({ ...form, useMarkdown: checked })}
                      />
                    </div>
                  </div>
                  <div className="mt-1">
                    {form.useMarkdown ? (
                      <Textarea
                        value={form.content}
                        onChange={(e) => setForm({ ...form, content: e.target.value })}
                        placeholder="Write your content in Markdown format...&#10;&#10;# Heading 1&#10;## Heading 2&#10;### Heading 3&#10;&#10;**Bold text**&#10;*Italic text*&#10;&#10;- Bullet point 1&#10;- Bullet point 2&#10;&#10;1. Numbered item 1&#10;2. Numbered item 2&#10;&#10;```bash&#10;# Code block&#10;sudo apt update&#10;```&#10;&#10;`inline code`"
                        rows={20}
                        className="font-mono text-sm"
                        required
                      />
                    ) : (
                      <ReactQuill
                        theme="snow"
                        value={form.content}
                        onChange={(value) => setForm({ ...form, content: value })}
                        modules={quillModules}
                        style={{ height: '400px', marginBottom: '50px' }}
                      />
                    )}
                  </div>
                  {form.useMarkdown && (
                    <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border">
                      <p className="text-xs text-muted-foreground font-medium mb-2">📝 Markdown Quick Reference:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div><code className="bg-background px-1 py-0.5 rounded"># H1</code> → Heading 1</div>
                        <div><code className="bg-background px-1 py-0.5 rounded">## H2</code> → Heading 2</div>
                        <div><code className="bg-background px-1 py-0.5 rounded">**bold**</code> → <strong>bold</strong></div>
                        <div><code className="bg-background px-1 py-0.5 rounded">*italic*</code> → <em>italic</em></div>
                        <div><code className="bg-background px-1 py-0.5 rounded">- item</code> → Bullet list</div>
                        <div><code className="bg-background px-1 py-0.5 rounded">1. item</code> → Numbered list</div>
                        <div><code className="bg-background px-1 py-0.5 rounded">`code`</code> → Inline code</div>
                        <div><code className="bg-background px-1 py-0.5 rounded">```lang```</code> → Code block</div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* SEO Section */}
            <Card>
              <CardHeader>
                <CardTitle>SEO Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">SEO Title</label>
                  <Input
                    value={form.seoTitle}
                    onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
                    placeholder="Custom title for search engines (defaults to article title)"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {(form.seoTitle || form.title).length}/60 characters
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">SEO Description</label>
                  <Textarea
                    value={form.seoDescription}
                    onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                    placeholder="Meta description for search engines (defaults to excerpt)"
                    rows={2}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {(form.seoDescription || form.excerpt).length}/160 characters
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Publication Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Published</label>
                  <Switch
                    checked={form.published}
                    onCheckedChange={(checked) => setForm({ ...form, published: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Featured</label>
                  <Switch
                    checked={form.featured}
                    onCheckedChange={(checked) => setForm({ ...form, featured: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Article Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Category *</label>
                  <Select
                    value={form.category}
                    onValueChange={(value) => setForm({ ...form, category: value })}
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
                  <label className="text-sm font-medium">Tags</label>
                  <Input
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="Comma separated tags..."
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Separate multiple tags with commas
                  </p>
                </div>

                {article.aiGenerated && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border">
                    <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
                      🤖 AI Generated Article
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      This article was generated using AI and may require review before publishing.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Article Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Article Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Views:</span>
                  <span className="font-medium">{article.views || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Likes:</span>
                  <span className="font-medium">{article.likes || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Reading Time:</span>
                  <span className="font-medium">{article.readTime || 0} min</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Created:</span>
                  <span className="font-medium">{new Date(article.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
