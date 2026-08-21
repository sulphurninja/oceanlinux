import connectDB from "@/lib/db";
import KnowledgeBase from "@/models/knowledgeBaseModel";

export async function GET(request) {
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const search = searchParams.get('search');
        const featured = searchParams.get('featured');

        let query = { published: true };

        // Filter by category
        if (category && category !== 'all') {
            query.category = category;
        }

        // Search functionality
        if (search) {
            query.$text = { $search: search };
        }

        // Featured articles
        if (featured === 'true') {
            query.featured = true;
        }

        const articles = await KnowledgeBase.find(query)
            .select('title slug excerpt category tags difficulty views createdAt featured')
            .sort({ featured: -1, views: -1, createdAt: -1 })
            .lean();

        return new Response(JSON.stringify(articles), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching knowledge base articles:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch articles', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
