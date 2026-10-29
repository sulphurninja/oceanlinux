import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import ResellerWalletService from '@/services/resellerWalletService';
import { verifyUPIPayment } from '@/lib/paymentGateways';
import { getPaytmTransactionStatus } from '@/lib/paytmMerchant';
import { getKwikUpiPaymentStatus } from '@/lib/kwikUpi';
import { logKwikRaw } from '@/lib/kwikRawLog';
import {
  getPaytmCredentials,
  getKwikUpiCredentials,
  getVyaparCredentials,
  getUpiGatewayCredentials,
  getResellerRechargeSettings,
} from '@/lib/resellerRechargeSettings';
import { getVyaparOrderStatus } from '@/lib/vyaparGateway';
import { getUpiGatewayOrderStatus } from '@/lib/upiGateway';
import { upiVerificationAmountAcceptable } from '@/lib/paymentAmountValidation';

function amountsMatch(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 1;
}

export async function confirmResellerRechargeRequest(request, { transactionId, paymentDetails, paymentMethod, adminUserId, adminNote } = {}) {
  if (!request) return { success: false, reason: 'request missing' };

  const fresh = await ResellerRechargeRequest.findById(request._id);
  if (!fresh) return { success: false, reason: 'request missing' };

  if (fresh.status === 'confirmed') {
    const reseller = await ResellerWalletService.getWalletDetails(fresh.reseller);
    return {
      success: true,
      alreadyProcessed: true,
      requestId: fresh._id,
      newBalance: reseller.balance,
    };
  }

  if (!['awaiting_approval', 'pending_payment', 'processing'].includes(fresh.status)) {
    return { success: false, reason: `invalid status: ${fresh.status}` };
  }

  const claimed = await ResellerRechargeRequest.findOneAndUpdate(
    { _id: fresh._id, status: { $in: ['awaiting_approval', 'pending_payment', 'processing'] } },
    { $set: { status: 'processing' } },
    { new: true }
  );

  if (!claimed) {
    const again = await ResellerRechargeRequest.findById(fresh._id);
    if (again?.status === 'confirmed') {
      const reseller = await ResellerWalletService.getWalletDetails(again.reseller);
      return { success: true, alreadyProcessed: true, requestId: again._id, newBalance: reseller.balance };
    }
    return { success: false, reason: 'request not approvable' };
  }

  if (paymentMethod) claimed.paymentMethod = paymentMethod;
  if (transactionId) claimed.transactionId = transactionId;
  if (paymentDetails) {
    claimed.paymentDetails = { ...(claimed.paymentDetails || {}), ...paymentDetails };
  }
  if (adminUserId) claimed.reviewedBy = adminUserId;
  if (adminNote) claimed.adminNote = adminNote;
  claimed.reviewedAt = new Date();

  try {
    const result = await ResellerWalletService.recharge(
      claimed.reseller,
      claimed.amount,
      `Wallet recharge ₹${claimed.amount} (UPI auto)`,
      {
        source:
          claimed.method === 'paytm_qr'
            ? 'reseller_paytm'
            : claimed.method === 'kwikupi'
              ? 'reseller_kwikupi'
              : claimed.method === 'upigateway'
                ? 'reseller_upigateway'
                : 'reseller_manual_upi',
        rechargeRequestId: String(claimed._id),
        clientTxnId: claimed.clientTxnId,
        utr: claimed.utr || '',
        transactionId: claimed.transactionId || '',
      }
    );

    claimed.status = 'confirmed';
    claimed.creditedAt = new Date();
    await claimed.save();

    return {
      success: true,
      requestId: claimed._id,
      newBalance: result.newBalance,
    };
  } catch (err) {
    claimed.status = claimed.method === 'manual_upi' ? 'awaiting_approval' : 'pending_payment';
    claimed.failureReason = err.message;
    await claimed.save();
    return { success: false, reason: err.message };
  }
}

export async function probePaytmResellerRecharge(request) {
  if (!request || request.method !== 'paytm_qr') {
    return { verified: false, reason: 'not a Paytm request' };
  }

  const paytm = getPaytmCredentials(await getResellerRechargeSettings());
  if (!paytm) {
    return { verified: false, reason: 'Paytm not connected' };
  }

  const result = await getPaytmTransactionStatus({
    mid: paytm.mid,
    merchantKey: paytm.merchantKey,
    orderId: request.clientTxnId,
    environment: paytm.environment,
  });

  if (!result.verified) {
    return { verified: false, reason: result.reason || 'not paid', pending: result.pending, failed: result.failed };
  }

  if (result.txnAmount && !amountsMatch(result.txnAmount, request.amount)) {
    return { verified: false, reason: 'amount mismatch' };
  }

  return {
    verified: true,
    transactionId: result.txnId || result.bankTxnId || '',
    paymentDetails: {
      paytmTxnId: result.txnId,
      bankTxnId: result.bankTxnId,
      paymentMode: result.paymentMode,
      txnDate: result.txnDate,
      verifiedAmount: result.txnAmount,
      confirmedAt: new Date(),
    },
  };
}

export async function probeAutoResellerRecharge(request) {
  if (!request || request.method !== 'auto_upi') {
    return { verified: false, reason: 'not an auto request' };
  }

  const result = await verifyUPIPayment(request.clientTxnId);
  if (!result.verified) {
    return { verified: false, reason: result.error || 'not paid' };
  }
  if (result.amount && !amountsMatch(result.amount, request.amount)) {
    return { verified: false, reason: 'amount mismatch' };
  }

  return {
    verified: true,
    transactionId: result.upi_txn_id || '',
    paymentDetails: {
      upi_txn_id: result.upi_txn_id,
      verifiedAmount: result.amount,
      confirmedAt: new Date(),
    },
  };
}

export async function probeVyaparResellerRecharge(request) {
  if (!request || request.method !== 'vyapar') {
    return { verified: false, reason: 'not a VyaparGateway request' };
  }

  const vyapar = getVyaparCredentials(await getResellerRechargeSettings());
  if (!vyapar) {
    return { verified: false, reason: 'VyaparGateway not connected' };
  }

  const result = await getVyaparOrderStatus({
    apiKey: vyapar.apiKey,
    orderId: request.gatewayOrderId,
    clientTxnId: request.clientTxnId,
  });

  if (!result.verified) {
    return {
      verified: false,
      reason: result.reason || 'not paid',
      pending: result.pending,
      failed: result.failed,
      expired: result.expired,
    };
  }

  if (
    result.amount &&
    !upiVerificationAmountAcceptable({ ...result, provider: 'vyapar', verified: true }, request.amount)
  ) {
    return { verified: false, reason: 'amount mismatch' };
  }

  return {
    verified: true,
    transactionId: result.transactionId || '',
    paymentDetails: {
      upiProvider: 'vyapar',
      vyaparOrderId: request.gatewayOrderId,
      upi_txn_id: result.transactionId,
      verifiedAmount: result.amount,
      confirmedAt: new Date(),
    },
  };
}

export async function probeUpiGatewayResellerRecharge(request) {
  if (!request || request.method !== 'upigateway') {
    return { verified: false, reason: 'not a UPI Gateway request' };
  }

  const gateway = getUpiGatewayCredentials(await getResellerRechargeSettings());
  if (!gateway) {
    return { verified: false, reason: 'UPI Gateway not connected' };
  }

  const result = await getUpiGatewayOrderStatus({
    apiKey: gateway.apiKey,
    apiSecret: gateway.apiSecret,
    clientTxnId: request.clientTxnId,
    txnDate: request.createdAt,
    expectedAmount: request.amount,
  });

  if (!result.verified) {
    return { verified: false, reason: result.reason || 'not paid', pending: result.pending, failed: result.failed };
  }

  return {
    verified: true,
    transactionId: result.transactionId || '',
    paymentDetails: {
      upiProvider: 'upigateway',
      gatewayOrderId: request.gatewayOrderId,
      upi_txn_id: result.transactionId,
      verifiedAmount: result.amount,
      confirmedAt: new Date(),
    },
  };
}

export async function probeKwikUpiResellerRecharge(request) {
  if (!request || request.method !== 'kwikupi') {
    return { verified: false, reason: 'not a KwikUPI request' };
  }

  const kwikupi = getKwikUpiCredentials(await getResellerRechargeSettings());
  if (!kwikupi) {
    return { verified: false, reason: 'KwikUPI not connected' };
  }

  const paymentId = request.kwikUpiPaymentId || request.gatewayOrderId;
  const result = await getKwikUpiPaymentStatus({
    apiKey: kwikupi.apiKey,
    apiSecret: kwikupi.apiSecret,
    paymentId,
  });

  if (!result.verified) {
    return { verified: false, reason: result.reason || 'not paid', pending: result.pending, failed: result.failed };
  }

  logKwikRaw({
    source: 'status-api',
    paymentId,
    orderId: request.clientTxnId || '',
    reportedStatus: result.raw?.status || 'SUCCESS',
    reportedAmount: result.amount,
    expectedAmount: request.amount,
    raw: result.raw,
    note: 'reseller recharge status check',
  }).catch(() => {});

  if (result.amount && !amountsMatch(result.amount, request.amount)) {
    return { verified: false, reason: 'amount mismatch' };
  }

  return {
    verified: true,
    transactionId: result.transactionId || '',
    paymentDetails: {
      kwikUpiPaymentId: paymentId,
      kwikUpiTxnId: result.transactionId,
      verifiedAmount: result.amount,
      confirmedAt: new Date(),
    },
  };
}

export async function rejectResellerRechargeRequest(requestId, { adminUserId, reason } = {}) {
  const req = await ResellerRechargeRequest.findById(requestId);
  if (!req) return { success: false, reason: 'not found' };
  if (!['awaiting_approval', 'pending_payment'].includes(req.status)) {
    return { success: false, reason: 'cannot reject this request' };
  }

  req.status = 'rejected';
  req.rejectionReason = reason || 'Rejected by admin';
  req.reviewedBy = adminUserId || null;
  req.reviewedAt = new Date();
  await req.save();

  return { success: true };
}
