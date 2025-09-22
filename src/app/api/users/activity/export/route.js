import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function GET(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Get activities using the same logic as the main activity endpoint
        const activitiesUrl = new URL('/api/users/activity', request.url);
        activitiesUrl.searchParams.set('export', 'true');

        // Copy all query parameters except export
        const { searchParams } = new URL(request.url);
        for (const [key, value] of searchParams.entries()) {
            if (key !== 'export') {
                activitiesUrl.searchParams.set(key, value);
            }
        }

        // Make internal request to get activities
        const activitiesResponse = await fetch(activitiesUrl.toString(), {
            headers: request.headers
        });

        if (!activitiesResponse.ok) {
            throw new Error('Failed to fetch activities for export');
        }

        const { activities } = await activitiesResponse.json();

        // Convert to CSV
        const csvHeader = 'Date,Time,Type,Title,Description,Status,Category,Metadata\n';
        const csvRows = activities.map(activity => {
            const date = new Date(activity.timestamp);
            const dateStr = date.toLocaleDateString();
            const timeStr = date.toLocaleTimeString();
            const metadata = JSON.stringify(activity.metadata || {}).replace(/"/g, '""');

            return [
                dateStr,
                timeStr,
                activity.type,
                `"${activity.title.replace(/"/g, '""')}"`,
                `"${activity.description.replace(/"/g, '""')}"`,
                activity.status || 'N/A',
                activity.category || 'N/A',
                `"${metadata}"`
            ].join(',');
        }).join('\n');

        const csv = csvHeader + csvRows;

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="activity-log-${new Date().toISOString().split('T')[0]}.csv"`
            }
        });

    } catch (error) {
        console.error('Error exporting activities:', error);
        return NextResponse.json(
            { message: 'Failed to export activities', error: error.message },
            { status: 500 }
        );
    }
}
