import { NextResponse } from 'next/server';
import { getDataFromToken } from '@/helper/getDataFromToken';
import NotificationService from '@/services/notificationService';

export async function GET(request) {
  try {
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 20;
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    // Build options object for filtering
    const options = {};
    
    // Handle read filter
    const readParam = searchParams.get('read');
    if (readParam === 'true') {
      options.read = true;
    } else if (readParam === 'false') {
      options.read = false;
    }
    
    // Handle other filters
    const type = searchParams.get('type');
    if (type && type !== 'all') {
      options.type = type;
    }
    
    const priority = searchParams.get('priority');
    if (priority && priority !== 'all') {
      options.priority = priority;
    }
    
    const search = searchParams.get('search');
    if (search) {
      options.search = search;
    }

    const result = await NotificationService.getUserNotifications(userId, page, limit, unreadOnly, options);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { message: 'Failed to fetch notifications', error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { notificationIds } = await request.json();

    const result = await NotificationService.markAsRead(userId, notificationIds);

    return NextResponse.json({
      message: 'Notifications marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { message: 'Failed to mark notifications as read', error: error.message },
      { status: 500 }
    );
  }
}


// Add DELETE method for bulk deletion
export async function DELETE(request) {
  try {
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { notificationIds } = await request.json();

    if (!notificationIds || notificationIds.length === 0) {
      return NextResponse.json(
        { message: 'No notification IDs provided' },
        { status: 400 }
      );
    }

    const result = await NotificationService.deleteNotifications(userId, notificationIds);

    return NextResponse.json({
      message: 'Notifications deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting notifications:', error);
    return NextResponse.json(
      { message: 'Failed to delete notifications', error: error.message },
      { status: 500 }
    );
  }
}
