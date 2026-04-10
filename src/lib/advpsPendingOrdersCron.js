import Order from '@/models/orderModel';
import NotificationService from '@/services/notificationService';
import AdvpsAPI from '@/services/advpsApi';
import WhatsAppService from '@/services/whatsappService';

/**
 * ADVPS Phase 0: orders with ADVPS_PENDING — purchase done, waiting for assignment / IP.
 * Shared by /api/admin/auto-provision-cron and /api/admin/advps-pending-cron.
 */
export async function checkAdvpsPendingOrders() {
  const TWO_MIN_AGO = new Date(Date.now() - 2 * 60 * 1000);

  const pendingOrders = await Order.find({
    advpsOrderId: { $exists: true, $ne: '' },
    status: 'confirmed',
    provisioningStatus: 'provisioning',
    provisioningError: { $regex: /^ADVPS_PENDING/ },
    ipAddress: { $in: [null, '', undefined] },
    lastProvisionAttempt: { $lt: TWO_MIN_AGO },
  }).limit(3);

  if (pendingOrders.length === 0) return [];

  console.log(`[CRON-ADVPS] Found ${pendingOrders.length} ADVPS-pending orders to check`);
  const advpsApi = new AdvpsAPI();
  const results = [];

  for (const order of pendingOrders) {
    const tag = `[CRON-ADVPS] [${order.advpsOrderId}]`;
    try {
      console.log(`${tag} Checking order details...`);
      await Order.findByIdAndUpdate(order._id, { lastProvisionAttempt: new Date() });

      const detailsRes = await advpsApi.getOrderDetails(order.advpsOrderId);
      const orderDetails = detailsRes?.data || detailsRes;
      const orderStatus = orderDetails?.order?.status || '';
      const services = orderDetails?.services || [];

      console.log(`${tag} status=${orderStatus}, services=${services.length}`);

      if (orderStatus === 'FAILED' || orderStatus === 'CANCELLED' || orderStatus === 'REJECTED') {
        console.log(`${tag} Terminal status: ${orderStatus}`);
        await Order.findByIdAndUpdate(order._id, {
          provisioningStatus: 'failed',
          provisioningError: `ADVPS order ${order.advpsOrderId} reached ${orderStatus}`,
        });
        await NotificationService.notifyOrderFailed(order.user, order,
          `ADVPS order ${order.advpsOrderId} ${orderStatus.toLowerCase()}`);
        results.push({ orderId: order._id, advpsOrderId: order.advpsOrderId, result: orderStatus });
        continue;
      }

      const svc = services.find(s => s.ip) || (orderStatus === 'ASSIGNED' && services[0]) || null;
      if (!svc) {
        console.log(`${tag} Still pending (status: ${orderStatus})`);
        results.push({ orderId: order._id, advpsOrderId: order.advpsOrderId, result: 'still_pending' });
        continue;
      }

      const isWindows = /windows|rdp/i.test(String(order.productName));
      let ipAddress = svc.ip || '';
      let username = svc.username || (isWindows ? 'Administrator' : 'root');
      let password = svc.password || order.password || '';
      const advpsServiceId = AdvpsAPI.extractServiceIdFromPurchaseService(svc);
      const expiryDate = svc.expiryDate ? new Date(svc.expiryDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Password may not be in first response — re-poll order details
      if (!password && order.advpsOrderId) {
        const pwPollDelays = [60000];
        for (let p = 0; p < pwPollDelays.length; p++) {
          await new Promise(r => setTimeout(r, pwPollDelays[p]));
          try {
            const retryRes = await advpsApi.getOrderDetails(order.advpsOrderId);
            const retrySvc = (retryRes?.data?.services || [])[0];
            if (retrySvc?.password) {
              password = retrySvc.password;
              if (retrySvc.username) username = retrySvc.username;
              console.log(`${tag} Password from order details (poll ${p + 1})`);
              break;
            }
            console.log(`${tag} Password poll ${p + 1}/${pwPollDelays.length}: not available yet`);
          } catch (e) {
            console.log(`${tag} Password poll ${p + 1} error: ${e.message}`);
          }
        }
      }

      if (!ipAddress && advpsServiceId) {
        try {
          const ipRes = await advpsApi.getIp(advpsServiceId);
          ipAddress = ipRes?.data?.ip || '';
        } catch (e) {
          console.log(`${tag} get-ip: ${e.message}`);
        }
      }

      if (!ipAddress) {
        console.log(`${tag} Service found but no IP yet`);
        results.push({ orderId: order._id, advpsOrderId: order.advpsOrderId, result: 'no_ip_yet' });
        continue;
      }

      console.log(`${tag} ASSIGNED! IP=${ipAddress}, serviceId=${advpsServiceId}`);
      await Order.findByIdAndUpdate(order._id, {
        status: 'active',
        provisioningStatus: 'active',
        provisioningError: '',
        advpsServiceId,
        ipAddress,
        username,
        password,
        expiryDate,
      });

      await NotificationService.notifyOrderCompleted(order.user, order, {
        ipAddress,
        username,
        password: password || 'Check dashboard',
      });
      WhatsAppService.notifyOrderViaWhatsApp(order.user, order).catch(() => {});

      results.push({ orderId: order._id, advpsOrderId: order.advpsOrderId, result: 'completed', ipAddress });
    } catch (err) {
      console.log(`${tag} Error: ${err.message}`);
      results.push({ orderId: order._id, advpsOrderId: order.advpsOrderId, result: 'error', error: err.message });
    }
  }

  return results;
}
