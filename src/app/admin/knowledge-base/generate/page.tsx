"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Wand2, Loader2, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";

const categories = [
  "Getting Started",
  "VPS Management",
  "Security",
  "Troubleshooting",
  "Billing",
  "General",
];

interface GeneratedArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  readTime: number;
  wordCount: number;
}

export default function KnowledgeBaseGeneratePage() {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("General");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [includeCode, setIncludeCode] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<GeneratedArticle | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a topic or prompt");
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/admin/knowledge-base/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, category, tone, length, includeCode }),
      });

      const data = await response.json();

      if (response.ok) {
        setLastGenerated(data.article);
        toast.success(`Article "${data.article.title}" generated as draft`);
        setPrompt("");
      } else {
        toast.error(data.error || data.details || "Failed to generate article");
      }
    } catch (error) {
      console.error("AI generate error:", error);
      toast.error("Failed to generate article");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/knowledge-base">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Knowledge Base
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wand2 className="w-8 h-8 text-purple-500" />
          AI Article Generator
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate draft knowledge-base articles with OpenAI. Review and publish from the editor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate new article</CardTitle>
          <CardDescription>
            Requires <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code> in server environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="prompt">Topic / prompt *</Label>
            <Textarea
              id="prompt"
              placeholder="e.g. How to secure a Linux VPS, Setting up Docker on Ubuntu, Database backup best practices..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="beginner-friendly">Beginner friendly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label>Length</Label>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short (300–500 words)</SelectItem>
                  <SelectItem value="medium">Medium (800–1200 words)</SelectItem>
                  <SelectItem value="long">Long (1500–2000 words)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 pb-2">
              <Switch
                id="includeCode"
                checked={includeCode}
                onCheckedChange={setIncludeCode}
              />
              <Label htmlFor="includeCode" className="cursor-pointer">
                Include code examples
              </Label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="min-w-[160px]"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate article
                </>
              )}
            </Button>
            <Link href="/admin/knowledge-base/new">
              <Button variant="outline">Write manually</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {lastGenerated && (
        <Card className="border-purple-200 dark:border-purple-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5" />
              Last generated draft
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <h3 className="font-semibold">{lastGenerated.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">{lastGenerated.excerpt}</p>
            <p className="text-xs text-muted-foreground">
              {lastGenerated.category} · {lastGenerated.readTime} min read · ~{lastGenerated.wordCount} words
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => router.push(`/admin/knowledge-base/edit/${lastGenerated.id}`)}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Review & edit
              </Button>
              <Link href={`/knowledge-base/${lastGenerated.slug}`} target="_blank">
                <Button size="sm" variant="outline">
                  Preview
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
