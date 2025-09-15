import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import connectDB from '@/lib/db';
import KnowledgeBase from '@/models/knowledgeBaseModel';
import ArticleContent from './ArticleContent';

interface Props {
  params: { slug: string };
}

// Generate metadata for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    await connectDB();
    const article = await KnowledgeBase.findOne({
      slug: params.slug,
      published: true
    }).populate('author', 'name').lean();

    if (!article) {
      return {
        title: 'Article Not Found - Ocean Linux Knowledge Base',
        description: 'The article you are looking for could not be found.'
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
    const articleUrl = `${baseUrl}/knowledge-base/${article.slug}`;

    return {
      title: article.seoTitle || `${article.title} - Ocean Linux Knowledge Base`,
      description: article.seoDescription || article.excerpt,
      keywords: article.tags.join(', '),
      authors: [{ name: article.author?.name || 'Ocean Linux Team' }],
      category: article.category,
      openGraph: {
        title: article.title,
        description: article.excerpt,
        url: articleUrl,
        siteName: 'Ocean Linux',
        locale: 'en_US',
        type: 'article',
        publishedTime: article.createdAt,
        modifiedTime: article.lastModified || article.updatedAt,
        authors: [article.author?.name || 'Ocean Linux Team'],
        section: article.category,
        tags: article.tags,
      },
      twitter: {
        card: 'summary_large_image',
        title: article.title,
        description: article.excerpt,
        creator: '@oceanlinux',
        site: '@oceanlinux'
      },
      alternates: {
        canonical: articleUrl
      },
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-video-preview': -1,
          'max-image-preview': 'large',
          'max-snippet': -1,
        },
      }
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Ocean Linux Knowledge Base',
      description: 'Learn about VPS hosting, server management, and more.'
    };
  }
}

export default async function ArticlePage({ params }: Props) {
  try {
    await connectDB();

    // Fetch the article and increment views
    const article = await KnowledgeBase.findOneAndUpdate(
      { slug: params.slug, published: true },
      { $inc: { views: 1 } },
      { new: true }
    ).populate('author', 'name email').lean();

    if (!article) {
      notFound();
    }

    // Fetch related articles
    const relatedArticles = await KnowledgeBase.find({
      _id: { $ne: article._id },
      published: true,
      $or: [
        { category: article.category },
        { tags: { $in: article.tags } }
      ]
    })
    .select('title slug excerpt category readTime views createdAt')
    .sort({ views: -1 })
    .limit(4)
    .lean();

    // Convert ObjectId to string for client component
    const serializedArticle = {
      ...article,
      _id: article._id.toString(),
      author: article.author ? {
        ...article.author,
        _id: article.author._id.toString()
      } : null
    };

    const serializedRelatedArticles = relatedArticles.map(article => ({
      ...article,
      _id: article._id.toString()
    }));

    return (
      <ArticleContent
        article={serializedArticle}
        relatedArticles={serializedRelatedArticles}
      />
    );
  } catch (error) {
    console.error('Error fetching article:', error);
    notFound();
  }
}

// Generate static params for better performance
export async function generateStaticParams() {
  try {
    await connectDB();
    const articles = await KnowledgeBase.find({ published: true })
      .select('slug')
      .lean();

    return articles.map(article => ({
      slug: article.slug
    }));
  } catch (error) {
    console.error('Error generating static params:', error);
    return [];
  }
}
