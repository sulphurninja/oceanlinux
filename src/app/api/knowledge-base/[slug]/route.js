import connectDB from "@/lib/db";
import KnowledgeBase from "@/models/knowledgeBaseModel";

export async function GET(request, { params }) {
    try {
        await connectDB();

        const article = await KnowledgeBase.findOneAndUpdate(
            { slug: params.slug, published: true },
            { $inc: { views: 1 } },
            { new: true }
        )
            // aiPrompt is an internal authoring field — this route is public.
            .select('-aiPrompt')
            .lean();

        if (!article) {
            return new Response(JSON.stringify({ message: 'Article not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify(article), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching article:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch article', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
