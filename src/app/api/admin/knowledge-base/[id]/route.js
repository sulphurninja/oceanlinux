import connectDB from '@/lib/db';
import KnowledgeBase from '@/models/knowledgeBaseModel';
import User from '@/models/userModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { NextResponse } from 'next/server';

// Helper function to generate slug
const generateSlug = (title) => {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

export async function GET(request, { params }) {
    try {
        await connectDB();

        const article = await KnowledgeBase.findById(params.id)
            .populate('author', 'name email')
            .lean();

        if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        return NextResponse.json(article);

    } catch (error) {
        console.error('Error fetching article:', error);
        return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        await connectDB();

        // Check authentication and admin role
        const userId = getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const user = await User.findById(userId);
     

        const {
            title,
            content,
            excerpt,
            category,
            tags = [],
            published,
            featured,
            seoTitle,
            seoDescription
        } = await request.json();

        const article = await KnowledgeBase.findById(params.id);
        if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        // Update slug if title changed
        let slug = article.slug;
        if (title && title !== article.title) {
            slug = generateSlug(title);

            // Ensure unique slug (excluding current article)
            let counter = 1;
            let originalSlug = slug;
            while (await KnowledgeBase.findOne({ slug, _id: { $ne: params.id } })) {
                slug = `${originalSlug}-${counter}`;
                counter++;
            }
        }

        // Calculate reading time if content changed
        let readTime = article.readTime;
        if (content && content !== article.content) {
            const wordsPerMinute = 200;
            const words = content.split(' ').length;
            readTime = Math.ceil(words / wordsPerMinute);
        }

        // Update fields
        const updateData = {
            lastModified: new Date()
        };

        if (title) {
            updateData.title = title;
            updateData.slug = slug;
        }
        if (content) {
            updateData.content = content;
            updateData.readTime = readTime;
        }
        if (excerpt) updateData.excerpt = excerpt;
        if (category) updateData.category = category;
        if (tags) updateData.tags = tags;
        if (published !== undefined) updateData.published = published;
        if (featured !== undefined) updateData.featured = featured;
        if (seoTitle) updateData.seoTitle = seoTitle;
        if (seoDescription) updateData.seoDescription = seoDescription;

        const updatedArticle = await KnowledgeBase.findByIdAndUpdate(
            params.id,
            { $set: updateData },
            { new: true }
        ).populate('author', 'name email');

        return NextResponse.json({
            message: 'Article updated successfully',
            article: updatedArticle
        });

    } catch (error) {
        console.error('Error updating article:', error);
        return NextResponse.json({ error: 'Failed to update article' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        await connectDB();

        // Check authentication and admin role
        const userId = getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const user = await User.findById(userId);
        if (!user || user.role !== 'Admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const article = await KnowledgeBase.findByIdAndDelete(params.id);
        if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Article deleted successfully' });

    } catch (error) {
        console.error('Error deleting article:', error);
        return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 });
    }
}
