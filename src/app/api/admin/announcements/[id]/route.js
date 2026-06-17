import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import {
  deactivateSiblingOrderPopups,
  normalizeOrderPopupFields,
} from '@/lib/announcementOrderPopup';

export async function DELETE(request, { params }) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    const announcement = await Announcement.findById(params.id);
    if (!announcement) {
      return new Response(JSON.stringify({ message: 'Announcement not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await Announcement.findByIdAndDelete(params.id);

    return new Response(JSON.stringify({
      message: 'Announcement deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting announcement:', error);
    return new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function PATCH(request, { params }) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    const announcement = await Announcement.findById(params.id);
    if (!announcement) {
      return new Response(JSON.stringify({ message: 'Announcement not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();

    const allowedFields = [
      'title', 'content', 'type', 'targetAudience',
      'actionUrl', 'actionText', 'showAsLoginPopup',
      'communityLink', 'status', 'showOnOrderPage',
      'targetProvider', 'targetCompany',
    ];

    if (
      body.showOnOrderPage !== undefined ||
      body.targetProvider !== undefined ||
      body.targetCompany !== undefined
    ) {
      const orderPopupFields = normalizeOrderPopupFields({
        showOnOrderPage: body.showOnOrderPage ?? announcement.showOnOrderPage,
        targetProvider: body.targetProvider ?? announcement.targetProvider,
        targetCompany: body.targetCompany ?? announcement.targetCompany,
      });
      if (orderPopupFields.error) {
        return new Response(JSON.stringify({ message: orderPopupFields.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      Object.assign(announcement, orderPopupFields);
    }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'showAsLoginPopup' || field === 'showOnOrderPage') {
          announcement[field] = Boolean(body[field]);
        } else if (field === 'targetProvider' || field === 'targetCompany') {
          // handled above when any order-popup field changes
        } else {
          announcement[field] = body[field];
        }
      }
    }

    if (body.status === 'sent' && (announcement.showAsLoginPopup || announcement.showOnOrderPage) && !announcement.sentAt) {
      announcement.sentAt = new Date();
    }

    if (body.status === 'sent' && announcement.showOnOrderPage) {
      await deactivateSiblingOrderPopups(announcement);
    }

    const contentChanged =
      (body.title !== undefined && body.title !== announcement.title) ||
      (body.content !== undefined && body.content !== announcement.content);

    if (
      contentChanged &&
      announcement.showOnOrderPage &&
      announcement.status === 'sent'
    ) {
      announcement.sentAt = new Date();
    }

    await announcement.save();

    return new Response(JSON.stringify({
      message: 'Announcement updated successfully',
      announcement
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating announcement:', error);
    return new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
