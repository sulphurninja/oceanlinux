import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import connectDB from '@/lib/db';
import User from '@/models/userModel';
import KnowledgeBase from '@/models/knowledgeBaseModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Helper function to generate slug
const generateSlug = (title) => {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

// Helper function to calculate reading time
const calculateReadTime = (content) => {
    const wordsPerMinute = 200;
    const words = content.split(' ').length;
    return Math.ceil(words / wordsPerMinute);
};

export async function POST(request) {
    try {
        await connectDB();

        // Check authentication and admin role
        const userId = getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const user = await User.findById(userId);

        const { prompt, category, tone = 'professional', length = 'medium', includeCode = false } = await request.json();

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        // Build the AI prompt based on parameters
        let systemPrompt = `You are an expert technical writer for Ocean Linux, a premium VPS hosting company. Write comprehensive, helpful articles for our knowledge base.

Guidelines:
- Write in a ${tone} tone
- Target length: ${length === 'short' ? '300-500' : length === 'medium' ? '800-1200' : '1500-2000'} words
- Focus on practical, actionable advice
- Include step-by-step instructions where appropriate
- Use proper markdown formatting
- Include relevant examples
${includeCode ? '- Include code examples and commands where relevant' : ''}

Article structure should include:
1. Clear title
2. Brief introduction explaining what the reader will learn
3. Main content with clear sections and headings
4. Conclusion with key takeaways
5. Suggested next steps or related topics

Topic category: ${category}
Write about: ${prompt}`;

        console.log('Generating article with OpenAI...');

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Write a comprehensive article about: ${prompt}` }
            ],
            max_tokens: length === 'short' ? 1500 : length === 'medium' ? 3000 : 4500,
            temperature: 0.7
        });

        const generatedContent = completion.choices[0].message.content;

        // Extract title from the generated content (assuming it starts with # Title)
        const titleMatch = generatedContent.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : `Generated Article: ${prompt.slice(0, 50)}`;

        // Generate excerpt (first paragraph or first 200 characters)
        const contentWithoutTitle = generatedContent.replace(/^#\s+.+$/m, '').trim();
        const excerptMatch = contentWithoutTitle.match(/^(.+?)(?:\n\n|$)/);
        let excerpt = excerptMatch ? excerptMatch[1] : contentWithoutTitle.slice(0, 200);
        excerpt = excerpt.replace(/#+\s*/g, '').trim();
        if (excerpt.length > 200) {
            excerpt = excerpt.slice(0, 197) + '...';
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

        // Generate SEO title and description
        const seoTitle = title.length > 60 ? title.slice(0, 57) + '...' : title;
        const seoDescription = excerpt.length > 160 ? excerpt.slice(0, 157) + '...' : excerpt;

        // Calculate reading time
        const readTime = calculateReadTime(contentWithoutTitle);

        // Create the article
        const article = new KnowledgeBase({
            title,
            slug,
            content: generatedContent,
            excerpt,
            category,
            tags: [], // Can be enhanced with AI tag generation
            author: userId,
            published: false, // Admin can review and publish
            seoTitle,
            seoDescription,
            readTime,
            aiGenerated: true,
            aiPrompt: prompt
        });

        await article.save();

        return NextResponse.json({
            message: 'Article generated successfully',
            article: {
                id: article._id,
                title: article.title,
                slug: article.slug,
                excerpt: article.excerpt,
                category: article.category,
                readTime: article.readTime,
                wordCount: contentWithoutTitle.split(' ').length
            }
        });

    } catch (error) {
        console.error('Error generating article:', error);

        if (error.code === 'insufficient_quota') {
            return NextResponse.json({
                error: 'OpenAI API quota exceeded. Please try again later.'
            }, { status: 429 });
        }

        return NextResponse.json({
            error: 'Failed to generate article',
            details: error.message
        }, { status: 500 });
    }
}
