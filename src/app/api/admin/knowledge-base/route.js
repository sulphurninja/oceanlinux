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

export async function GET(request) {
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = searchParams.get('search');
        const category = searchParams.get('category');
        const published = searchParams.get('published');
        const sortBy = searchParams.get('sortBy') || 'createdAt';
        const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;

        let query = {};

        // Search functionality
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { content: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        // Filter by category
        if (category && category !== 'all') {
            query.category = category;
        }

        // Filter by published status
        if (published === 'true') {
            query.published = true;
        } else if (published === 'false') {
            query.published = false;
        }

        const skip = (page - 1) * limit;

        const articles = await KnowledgeBase.find(query)
            .populate('author', 'name email')
            .sort({ [sortBy]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalArticles = await KnowledgeBase.countDocuments(query);
        const totalPages = Math.ceil(totalArticles / limit);

        return NextResponse.json({
            articles,
            pagination: {
                currentPage: page,
                totalPages,
                totalArticles,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Error fetching articles:', error);
        return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        await connectDB();

        // Check authentication and admin role
        const userId = getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const user = await User.findById(userId);
        // if (!user || user.role !== 'Admin') {
        //     return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        // }

        const {
            title,
            content,
            excerpt,
            category,
            tags = [],
            published = false,
            featured = false,
            seoTitle,
            seoDescription
        } = await request.json();

        if (!title || !content || !excerpt || !category) {
            return NextResponse.json({
                error: 'Title, content, excerpt, and category are required'
            }, { status: 400 });
        }

        // Generate slug
        let slug = generateSlug(title);

        // Ensure unique slug
        let counter = 1;
        let originalSlug = slug;
        while (await KnowledgeBase.findOne({ slug })) {
            slug = `${originalSlug}-${counter}`;
            counter++;
        }

        // Calculate reading time
        const wordsPerMinute = 200;
        const words = content.split(' ').length;
        const readTime = Math.ceil(words / wordsPerMinute);

        const article = new KnowledgeBase({
            title,
            slug,
            content,
            excerpt,
            category,
            tags,
            author: userId,
            published,
            featured,
            readTime,
            seoTitle: seoTitle || title,
            seoDescription: seoDescription || excerpt
        });

        await article.save();
        await article.populate('author', 'name email');

        return NextResponse.json({
            message: 'Article created successfully',
            article
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating article:', error);
        return NextResponse.json({ error: 'Failed to create article' }, { status: 500 });
    }
}
