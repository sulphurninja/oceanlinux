const Zaptick = require('zaptick').default || require('zaptick');

const ZAPTICK_API_KEY = process.env.ZAPTICK_API_KEY;

let zaptickClient = null;

function getClient() {
  if (!zaptickClient && ZAPTICK_API_KEY) {
    zaptickClient = new Zaptick(ZAPTICK_API_KEY);
  }
  return zaptickClient;
}

class WhatsAppService {
  /**
   * Send VPS order confirmation template to a customer.
   * Non-blocking — logs errors but never throws.
   */
  static async sendOrderConfirmation(phone, customerName, orderName) {
    const client = getClient();
    if (!client) {
      console.log('[WHATSAPP] Zaptick API key not configured, skipping');
      return null;
    }

    if (!phone) {
      console.log('[WHATSAPP] No phone number for customer, skipping WhatsApp notification');
      return null;
    }

    const formatted = phone.startsWith('+') ? phone : `+${phone}`;

    try {
      const result = await client.messages.send({
        phone: formatted,
        templateName: 'vps_order_confirmation',
        variables: {
          '1': customerName || 'Customer',
          '2': orderName || 'your order',
        },
      });
      console.log(`[WHATSAPP] ✅ Order confirmation sent to ${formatted} (messageId: ${result.messageId})`);
      return result;
    } catch (err) {
      console.error(`[WHATSAPP] ❌ Failed to send order confirmation to ${formatted}:`, err.message || err);
      return null;
    }
  }

  /**
   * Convenience: look up user by ID, then send the confirmation.
   * Requires the User model to be importable.
   */
  static async notifyOrderViaWhatsApp(userId, order) {
    try {
      const User = require('@/models/userModel').default;
      const user = await User.findById(userId).select('phone name').lean();
      if (!user) {
        console.log(`[WHATSAPP] User ${userId} not found, skipping`);
        return null;
      }
      return await this.sendOrderConfirmation(
        user.phone,
        user.name,
        order.productName || 'your VPS order',
      );
    } catch (err) {
      console.error('[WHATSAPP] Error in notifyOrderViaWhatsApp:', err.message || err);
      return null;
    }
  }
}

module.exports = WhatsAppService;
