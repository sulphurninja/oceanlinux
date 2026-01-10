const RenewalLog = require('@/models/renewalLogModel').default;

/**
 * RenewalLogger - A service to capture comprehensive logs during order renewal process
 * Usage:
 *   const logger = new RenewalLogger(order, renewalTxnId, 'webhook');
 *   logger.logInfo('Starting renewal process');
 *   logger.logSuccess('Payment verified');
 *   await logger.finalize(true, newExpiryDate);
 */
class RenewalLogger {
    constructor(order, renewalTxnId, processedVia = 'confirm-api') {
        this.orderId = order._id;
        this.renewalTxnId = renewalTxnId;
        this.processedVia = processedVia;
        this.startTime = new Date();
        this.logs = [];

        // Store order context for quick reference
        this.orderContext = {
            productName: order.productName,
            provider: order.provider,
            ipAddress: order.ipAddress,
            memory: order.memory,
            price: order.price,
            currentExpiry: order.expiryDate,
            hostycareServiceId: order.hostycareServiceId,
            smartvpsServiceId: order.smartvpsServiceId
        };

        this.paymentInfo = {};
        this.providerApiResult = {
            apiCalled: false
        };

        this.logInfo(`Renewal logger initialized for order ${order._id}`);
    }

    /**
     * Add a log entry
     */
    addLog(level, message, data = null) {
        const logEntry = {
            timestamp: new Date(),
            level,
            message,
            data: data ? JSON.parse(JSON.stringify(data)) : null // Deep clone to avoid references
        };

        this.logs.push(logEntry);

        // Also console log for immediate visibility
        const prefix = `[RENEWAL-LOG][${level.toUpperCase()}]`;
        if (data) {
            console.log(`${prefix} ${message}`, data);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }

    logInfo(message, data = null) {
        this.addLog('info', message, data);
    }

    logSuccess(message, data = null) {
        this.addLog('success', message, data);
    }

    logError(message, error = null) {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
        } : null;
        this.addLog('error', message, errorData);
    }

    logWarning(message, data = null) {
        this.addLog('warning', message, data);
    }

    logDebug(message, data = null) {
        this.addLog('debug', message, data);
    }

    /**
     * Set payment information
     */
    setPaymentInfo(paymentMethod, paymentId, amount) {
        this.paymentInfo = {
            paymentMethod,
            paymentId,
            amount
        };
        this.logInfo('Payment info recorded', this.paymentInfo);
    }

    /**
     * Record provider API call result
     */
    setProviderApiResult(provider, success, result, error = null, duration = null) {
        this.providerApiResult = {
            provider,
            apiCalled: true,
            success,
            result: result ? JSON.parse(JSON.stringify(result)) : null,
            error: error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : null,
            apiDuration: duration
        };

        if (success) {
            this.logSuccess(`Provider API call succeeded: ${provider}`, { duration });
        } else {
            this.logError(`Provider API call failed: ${provider}`, error);
        }
    }

    /**
     * Finalize and save the log to database
     */
    async finalize(success, newExpiryDate = null, errorMessage = null, errorStack = null) {
        const endTime = new Date();
        const duration = endTime - this.startTime;

        this.logInfo(`Renewal process ${success ? 'succeeded' : 'failed'}`, {
            duration: `${duration}ms`,
            newExpiryDate
        });

        try {
            const logDoc = {
                orderId: this.orderId,
                renewalTxnId: this.renewalTxnId,
                orderContext: this.orderContext,
                startTime: this.startTime,
                endTime,
                duration,
                success,
                processedVia: this.processedVia,
                paymentInfo: this.paymentInfo,
                logs: this.logs,
                providerApiResult: this.providerApiResult,
                newExpiryDate,
                errorMessage,
                errorStack
            };

            // Import dynamically to avoid circular dependencies
            const RenewalLogModel = (await import('@/models/renewalLogModel')).default;
            const savedLog = await RenewalLogModel.create(logDoc);

            console.log(`[RENEWAL-LOG] Log saved to database: ${savedLog._id}`);
            return savedLog;
        } catch (saveError) {
            console.error('[RENEWAL-LOG] Failed to save log to database:', saveError);
            // Don't throw - we don't want logging failures to break the renewal process
            return null;
        }
    }
}

module.exports = RenewalLogger;
