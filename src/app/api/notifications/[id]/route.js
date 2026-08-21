import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Notification from '@/models/notificationModel';

export async function GET(request, { params }) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const notification = await Notification.findOne({
            _id: params.id,
            userId
        }).lean();

        if (!notification) {
            return NextResponse.json(
                { message: 'Notification not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(notification);

    } catch (error) {
        console.error('Error fetching notification:', error);
        return NextResponse.json(
            { message: 'Failed to fetch notification', error: error.message },
            { status: 500 }
        );
    }
}

export async function PATCH(request, { params }) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { read } = await request.json();

        const updateData = {
            read: read === true || read === 'true'
        };

        if (updateData.read) {
            updateData.readAt = new Date();
        } else {
            updateData.readAt = null;
        }

        const notification = await Notification.findOneAndUpdate(
            { _id: params.id, userId },
            updateData,
            { new: true }
        );

        if (!notification) {
            return NextResponse.json(
                { message: 'Notification not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            message: 'Notification updated successfully',
            notification
        });

    } catch (error) {
        console.error('Error updating notification:', error);
        return NextResponse.json(
            { message: 'Failed to update notification', error: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(request, { params }) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const notification = await Notification.findOneAndDelete({
            _id: params.id,
            userId
        });

        if (!notification) {
            return NextResponse.json(
                { message: 'Notification not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            message: 'Notification deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting notification:', error);
        return NextResponse.json(
            { message: 'Failed to delete notification', error: error.message },
            { status: 500 }
        );
    }
}
