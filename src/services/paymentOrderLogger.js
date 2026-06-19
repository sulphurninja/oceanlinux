/**
 * PaymentOrderLogger — audit trail when payment succeeds but order stays pending.
 */
class PaymentOrderLogger {
  constructor({ order = null, clientTxnId = null, source = 'unknown', flowType = 'new_order' } = {}) {
    this.orderId = order?._id || null;
    this.clientTxnId = clientTxnId || order?.clientTxnId || null;
    this.source = source || 'manual';
    this.flowType = flowType;
    this.startTime = new Date();
    this.logs = [];
    this.paymentInfo = {};
    this.orderContext = order
      ? {
          productName: order.productName,
          memory: order.memory,
          price: order.price,
          status: order.status,
          provisioningStatus: order.provisioningStatus,
          userId: order.user,
          provider: order.provider,
        }
      : {};
  }

  static forOrder(order, source, flowType = 'new_order') {
    return new PaymentOrderLogger({ order, source, flowType });
  }

  static forTxn(clientTxnId, source, flowType = 'new_order') {
    return new PaymentOrderLogger({ clientTxnId, source, flowType });
  }

  addLog(level, message, data = null) {
    const entry = {
      timestamp: new Date(),
      level,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null,
    };
    this.logs.push(entry);
    const prefix = `[PAYMENT-LOG][${this.source}][${level.toUpperCase()}]`;
    if (data) console.log(prefix, message, data);
    else console.log(prefix, message);
  }

  info(message, data) {
    this.addLog('info', message, data);
  }
  success(message, data) {
    this.addLog('success', message, data);
  }
  warning(message, data) {
    this.addLog('warning', message, data);
  }
  error(message, err) {
    const data =
      err && typeof err === 'object'
        ? { message: err.message, stack: err.stack, name: err.name, ...(typeof err === 'string' ? { detail: err } : {}) }
        : err
          ? { detail: String(err) }
          : null;
    this.addLog('error', message, data);
  }
  debug(message, data) {
    this.addLog('debug', message, data);
  }

  setPaymentInfo(info = {}) {
    this.paymentInfo = { ...this.paymentInfo, ...info };
  }

  updateOrderContext(order) {
    if (!order) return;
    this.orderId = order._id;
    this.clientTxnId = order.clientTxnId;
    this.orderContext = {
      productName: order.productName,
      memory: order.memory,
      price: order.price,
      status: order.status,
      provisioningStatus: order.provisioningStatus,
      userId: order.user,
      provider: order.provider,
    };
  }

  async save({ success, anomaly = false, errorMessage = null, errorStack = null } = {}) {
    const endTime = new Date();
    const duration = endTime - this.startTime;

    try {
      const PaymentOrderLog = (await import('@/models/paymentOrderLogModel')).default;
      const doc = await PaymentOrderLog.create({
        orderId: this.orderId,
        clientTxnId: this.clientTxnId,
        flowType: this.flowType,
        source: this.source,
        success: !!success,
        anomaly: !!anomaly,
        orderContext: this.orderContext,
        paymentInfo: this.paymentInfo,
        startTime: this.startTime,
        endTime,
        duration,
        logs: this.logs,
        errorMessage,
        errorStack,
      });
      return doc;
    } catch (saveErr) {
      console.error('[PAYMENT-LOG] Failed to save:', saveErr.message);
      return null;
    }
  }
}

module.exports = PaymentOrderLogger;
