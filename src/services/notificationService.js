import Notification from '../models/notificationModel.js';
import connectDB from '../lib/db.js';

class NotificationService {

  // Create a new notification
  static async create(userId, type, title, message, data = {}, options = {}) {
    try {
      await connectDB();

      const notification = new Notification({
        userId,
        type,
        title,
        message,
        data,
        priority: options.priority || 'medium',
        actionUrl: options.actionUrl,
        icon: options.icon || 'bell'
      });

      await notification.save();
      console.log(`Notification created for user ${userId}: ${title}`);
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }


  // Enhanced ticket reply notification (updated)
  static async notifyTicketReplied(userId, ticket, isFromAdmin = true) {
    const title = isFromAdmin ? 'Support Team Replied' : 'Your Reply Sent';
    const message = isFromAdmin
      ? `Our support team has replied to your ticket "${ticket.subject}". Please check your ticket for the latest update.`
      : `Your reply has been sent for ticket "${ticket.subject}"`;

    return this.create(
      userId,
      'ticket_replied',
      title,
      message,
      {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        status: ticket.status
      },
      {
        actionUrl: `/support/tickets/${ticket.ticketId}`,
        icon: 'message-circle',
        priority: isFromAdmin ? 'high' : 'medium'
      }
    );
  }

  // New: Ticket status changed notification
  static async notifyTicketStatusChanged(userId, ticket, previousStatus, newStatus) {
    const statusMessages = {
      'open': 'opened',
      'in-progress': 'being worked on',
      'waiting-response': 'waiting for your response',
      'resolved': 'resolved',
      'closed': 'closed'
    };

    const title = 'Ticket Status Updated';
    const message = `Your ticket "${ticket.subject}" is now ${statusMessages[newStatus] || newStatus}.`;

    // Determine priority based on status
    let priority = 'medium';
    if (newStatus === 'resolved' || newStatus === 'closed') {
      priority = 'high';
    } else if (newStatus === 'waiting-response') {
      priority = 'high';
    }

    return this.create(
      userId,
      'ticket_updated',
      title,
      message,
      {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        previousStatus,
        newStatus
      },
      {
        actionUrl: `/support/tickets/${ticket.ticketId}`,
        icon: newStatus === 'resolved' ? 'check-circle' :
          newStatus === 'closed' ? 'x-circle' :
            newStatus === 'waiting-response' ? 'clock' : 'alert-circle',
        priority
      }
    );
  }

  // Enhanced ticket resolved notification
  static async notifyTicketResolved(userId, ticket) {
    return this.create(
      userId,
      'ticket_resolved',
      '✅ Ticket Resolved',
      `Great news! Your support ticket "${ticket.subject}" has been resolved. If you need further assistance, feel free to create a new ticket.`,
      {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        resolvedAt: new Date()
      },
      {
        actionUrl: `/support/tickets/${ticket.ticketId}`,
        icon: 'check-circle',
        priority: 'high'
      }
    );
  }

  // New: Ticket assigned notification (for when tickets get assigned to specific agents)
  static async notifyTicketAssigned(userId, ticket, assignedTo) {
    return this.create(
      userId,
      'ticket_assigned',
      'Ticket Assigned',
      `Your ticket "${ticket.subject}" has been assigned to our support specialist for personalized assistance.`,
      {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        assignedTo
      },
      {
        actionUrl: `/support/tickets/${ticket.ticketId}`,
        icon: 'user-check',
        priority: 'medium'
      }
    );
  }

  // New: Ticket escalated notification (for urgent tickets)
  static async notifyTicketEscalated(userId, ticket, reason) {
    return this.create(
      userId,
      'ticket_escalated',
      'Ticket Escalated',
      `Your ticket "${ticket.subject}" has been escalated for priority handling. Our senior support team will assist you shortly.`,
      {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        reason
      },
      {
        actionUrl: `/support/tickets/${ticket.ticketId}`,
        icon: 'trending-up',
        priority: 'urgent'
      }
    );
  }


  // Order related notifications
  static async notifyOrderCreated(userId, order) {
    return this.create(
      userId,
      'order_created',
      'Order Created Successfully',
      `Your order for ${order.productName} has been created and is awaiting payment.`,
      { orderId: order._id, orderNumber: order.clientTxnId },
      {
        actionUrl: `/dashboard/orders`,
        icon: 'shopping-cart',
        priority: 'high'
      }
    );
  }

  static async notifyOrderConfirmed(userId, order) {
    return this.create(
      userId,
      'order_confirmed',
      'Payment Confirmed',
      `Payment for ${order.productName} has been confirmed. Server setup is starting.`,
      { orderId: order._id, transactionId: order.transactionId },
      {
        actionUrl: `/dashboard/order/${order._id}`,
        icon: 'check-circle',
        priority: 'high'
      }
    );
  }

  static async notifyOrderProvisioning(userId, order) {
    return this.create(
      userId,
      'order_provisioning',
      'Server Setup in Progress',
      `Your ${order.productName} server is being set up. This usually takes 5-15 minutes.`,
      { orderId: order._id },
      {
        actionUrl: `/dashboard/order/${order._id}`,
        icon: 'server',
        priority: 'medium'
      }
    );
  }

  static async notifyOrderCompleted(userId, order, serverDetails = {}) {
    return this.create(
      userId,
      'order_completed',
      'Server Ready!',
      `Your ${order.productName} server is now ready to use. IP: ${serverDetails.ipAddress || 'Available in dashboard'}`,
      { orderId: order._id, serverDetails },
      {
        actionUrl: `/dashboard/order/${order._id}`,
        icon: 'server',
        priority: 'high'
      }
    );
  }

  static async notifyOrderFailed(userId, order, error) {
    return this.create(
      userId,
      'order_failed',
      'Server Setup Failed',
      `There was an issue setting up your ${order.productName}. Our team has been notified.`,
      { orderId: order._id, error },
      {
        actionUrl: `/support/tickets`,
        icon: 'alert-circle',
        priority: 'urgent'
      }
    );
  }

  // Ticket related notifications
  static async notifyTicketCreated(userId, ticket) {
    return this.create(
      userId,
      'ticket_created',
      'Support Ticket Created',
      `Your support ticket "${ticket.subject}" has been created. Ticket ID: ${ticket.ticketId}`,
      { ticketId: ticket.ticketId },
      {
        actionUrl: `/support/tickets/${ticket.ticketId}`,
        icon: 'help-circle',
        priority: 'medium'
      }
    );
  }

  static async notifyTicketReplied(userId, ticket, isFromAdmin = true) {
    const title = isFromAdmin ? 'Support Team Replied' : 'Your Reply Sent';
    const message = isFromAdmin
      ? `Our support team has replied to your ticket "${ticket.subject}"`
      : `Your reply has been sent for ticket "${ticket.subject}"`;

    return this.create(
      userId,
      'ticket_replied',
      title,
      message,
      { ticketId: ticket.ticketId },
      {
        actionUrl: `/support/tickets/${ticket.ticketId}`,
        icon: 'message-circle',
        priority: isFromAdmin ? 'high' : 'medium'
      }
    );
  }

  static async notifyTicketResolved(userId, ticket) {
    return this.create(
      userId,
      'ticket_resolved',
      'Ticket Resolved',
      `Your support ticket "${ticket.subject}" has been resolved.`,
      { ticketId: ticket.ticketId },
      {
        actionUrl: `/support/tickets/${ticket.ticketId}`,
        icon: 'check-circle',
        priority: 'medium'
      }
    );
  }

  // Announcement notifications
  static async notifyAnnouncement(userId, announcement) {
    const typeIcons = {
      promotion: 'gift',
      update: 'refresh-cw',
      maintenance: 'wrench',
      feature: 'star',
      security: 'shield'
    };

    return this.create(
      userId,
      'announcement',
      announcement.title,
      announcement.content,
      { announcementId: announcement._id, announcementType: announcement.type },
      {
        actionUrl: announcement.actionUrl || '/dashboard',
        icon: typeIcons[announcement.type] || 'megaphone',
        priority: announcement.type === 'security' ? 'urgent' : 'medium'
      }
    );
  }

  // Server action notifications
  static async notifyServerAction(userId, action, serverName, success = true) {
    const actionMessages = {
      start: success ? 'Server started successfully' : 'Failed to start server',
      stop: success ? 'Server stopped successfully' : 'Failed to stop server',
      restart: success ? 'Server restarted successfully' : 'Failed to restart server',
      reinstall: success ? 'Server reinstalled successfully' : 'Server reinstall failed'
    };

    return this.create(
      userId,
      'server_action',
      `Server ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      `${actionMessages[action]} - ${serverName}`,
      { action, serverName, success },
      {
        actionUrl: `/dashboard/viewLinux`,
        icon: success ? 'server' : 'alert-circle',
        priority: success ? 'low' : 'medium'
      }
    );
  }

  // Profile update notification
  static async notifyProfileUpdated(userId) {
    return this.create(
      userId,
      'profile_updated',
      'Profile Updated',
      'Your profile has been successfully updated.',
      {},
      {
        actionUrl: '/dashboard/my-account',
        icon: 'user',
        priority: 'low'
      }
    );
  }

  // Get user notifications with pagination
  // Enhanced getUserNotifications method with filtering
  static async getUserNotifications(userId, page = 1, limit = 20, unreadOnly = false, options = {}) {
    try {
      await connectDB();

      const query = { userId };

      // Apply filters
      if (unreadOnly) {
        query.read = false;
      } else if (options.read !== undefined) {
        query.read = options.read;
      }
      
      if (options.type) query.type = options.type;
      if (options.priority) query.priority = options.priority;

      // Search functionality
      if (options.search) {
        query.$or = [
          { title: { $regex: options.search, $options: 'i' } },
          { message: { $regex: options.search, $options: 'i' } }
        ];
      }

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.countDocuments({ userId, read: false });

      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        unreadCount
      };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  }

  // New method for deleting notifications
  static async deleteNotifications(userId, notificationIds) {
    try {
      await connectDB();

      const result = await Notification.deleteMany({
        userId,
        _id: { $in: notificationIds }
      });

      return result;
    } catch (error) {
      console.error('Error deleting notifications:', error);
      throw error;
    }
  }

  // Mark notifications as read
  static async markAsRead(userId, notificationIds = []) {
    try {
      await connectDB();

      const query = { userId };
      if (notificationIds.length > 0) {
        query._id = { $in: notificationIds };
      } else {
        query.read = false; // Mark all unread as read
      }

      const result = await Notification.updateMany(
        query,
        {
          $set: {
            read: true,
            readAt: new Date()
          }
        }
      );

      return result;
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      throw error;
    }
  }

  // Delete old notifications (cleanup job)
  static async cleanup(daysOld = 30) {
    try {
      await connectDB();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await Notification.deleteMany({
        createdAt: { $lt: cutoffDate },
        read: true
      });

      console.log(`Cleaned up ${result.deletedCount} old notifications`);
      return result;
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      throw error;
    }
  }
}

export default NotificationService;
