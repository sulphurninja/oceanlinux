# Cashfree Payment Gateway Migration Guide

## Overview
This document outlines the complete migration from Razorpay to Cashfree Payment Gateway that has been implemented in the OceanLinux platform.

## Migration Date
**Completed:** November 23, 2025

---

## 🔧 Environment Variables Required

You need to update your `.env` file with the following Cashfree credentials:

```env
# Cashfree Payment Gateway Configuration
CASHFREE_APP_ID=your_cashfree_app_id
CASHFREE_SECRET_KEY=your_cashfree_secret_key
CASHFREE_ENVIRONMENT=PRODUCTION  # or SANDBOX for testing

# Frontend Configuration
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=production  # or sandbox
NEXT_PUBLIC_BASE_URL=https://yourdomain.com  # Your application URL
```

### How to Get Cashfree Credentials

1. **Sign up/Login** to [Cashfree Dashboard](https://merchant.cashfree.com/)
2. Navigate to **Developers** → **API Keys**
3. Click **Generate API Keys**
4. Copy your **App ID** (Client ID) and **Secret Key**
5. For testing, use **SANDBOX** environment
6. For production, use **PRODUCTION** environment

---

## 📝 Changes Made

### Backend API Changes

#### 1. **Payment Creation API** (`src/app/api/payment/create/route.js`)
- ✅ Replaced Razorpay SDK with Cashfree SDK
- ✅ Updated order creation to use Cashfree's order format
- ✅ Changed response structure to include `payment_session_id`
- ✅ Added customer phone requirement (Cashfree requires it)

**Key Changes:**
```javascript
// Before (Razorpay)
const razorpayOrder = await razorpay.orders.create({
  amount: price * 100, // paise
  currency: 'INR',
  receipt: clientTxnId
});

// After (Cashfree)
const cashfreeOrder = await Cashfree.PGCreateOrder('2023-08-01', {
  order_id: clientTxnId,
  order_amount: price, // rupees
  order_currency: 'INR',
  customer_details: {
    customer_id: userId,
    customer_name: user.name,
    customer_email: user.email,
    customer_phone: user.phone || '9999999999'
  }
});
```

#### 2. **Payment Confirmation API** (`src/app/api/payment/confirm/route.js`)
- ✅ Removed signature verification (Cashfree uses different method)
- ✅ Added Cashfree payment status verification via API
- ✅ Updated to fetch payment details from Cashfree

**Key Changes:**
```javascript
// Before (Razorpay)
// Verify signature
const expectedSignature = crypto
  .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
  .update(body)
  .digest('hex');

// After (Cashfree)
// Verify via API call
const cashfreeResponse = await Cashfree.PGOrderFetchPayments('2023-08-01', orderIdentifier);
if (payment.payment_status === 'SUCCESS') {
  // Process order
}
```

#### 3. **Renewal Payment API** (`src/app/api/payment/renew/route.js`)
- ✅ Updated to use Cashfree order creation
- ✅ Added return URL and notify URL configuration
- ✅ Updated response structure

#### 4. **Renewal Confirmation API** (`src/app/api/payment/renew-confirm/route.js`)
- ✅ Updated to verify payment via Cashfree API
- ✅ Removed signature verification logic
- ✅ Updated to work with SmartVPS and Hostycare renewal flows

#### 5. **Webhook Handler** (`src/app/api/payment/webhook/route.js`)
- ✅ Updated signature verification for Cashfree webhooks
- ✅ Changed event handling from `payment.captured` to `PAYMENT_SUCCESS_WEBHOOK`
- ✅ Updated payload structure parsing

**Webhook Signature Verification:**
```javascript
// Cashfree webhook signature
const signatureData = timestamp + body;
const expectedSignature = crypto
  .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
  .update(signatureData)
  .digest('base64');
```

#### 6. **Payment Status API** (`src/app/api/payment/status/route.js`)
- ✅ Updated to fetch payment status from Cashfree
- ✅ Changed API calls to use Cashfree SDK

#### 7. **Wallet Recharge API** (`src/app/api/users/wallet/recharge/route.js`)
- ✅ Updated default payment method from 'razorpay' to 'cashfree'

---

### Frontend Changes

#### 1. **Layout Script** (`src/app/layout.tsx`)
- ✅ Replaced Razorpay checkout script with Cashfree SDK
```html
<!-- Before -->
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>

<!-- After -->
<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
```

#### 2. **IP Stock Purchase Page** (`src/app/dashboard/ipStock/page.tsx`)
- ✅ Updated Window interface to use Cashfree
- ✅ Replaced Razorpay checkout with Cashfree checkout
- ✅ Updated payment handler to use Cashfree SDK v3

**Payment Flow:**
```javascript
// Initialize Cashfree
const cashfree = await window.Cashfree({
  mode: "production" // or "sandbox"
});

// Open checkout
cashfree.checkout({
  paymentSessionId: data.cashfree.payment_session_id,
  returnUrl: `${window.location.origin}/payment/callback?client_txn_id=${data.clientTxnId}`
});
```

#### 3. **Order Details/Renewal Page** (`src/app/dashboard/order/[id]/page.tsx`)
- ✅ Updated Window interface to use Cashfree
- ✅ Replaced Razorpay renewal flow with Cashfree
- ✅ Updated payment confirmation handler

---

## 🔄 Migration Steps for Deployment

### Step 1: Update Environment Variables
```bash
# Add to your .env file
CASHFREE_APP_ID=your_app_id_here
CASHFREE_SECRET_KEY=your_secret_key_here
CASHFREE_ENVIRONMENT=PRODUCTION
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=production
NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
```

### Step 2: Install Dependencies
The Cashfree package is already in `package.json`:
```json
{
  "cashfree-pg": "^4.3.10",
  "@cashfreepayments/cashfree-js": "^1.0.5"
}
```

If needed, reinstall:
```bash
npm install
# or
bun install
```

### Step 3: Configure Cashfree Webhook
1. Go to Cashfree Dashboard → **Developers** → **Webhooks**
2. Add webhook URL: `https://yourdomain.com/api/payment/webhook`
3. Select events to monitor:
   - ✅ Payment Success
   - ✅ Payment Failed
   - ✅ Payment User Dropped
4. Save the webhook configuration

### Step 4: Test in Sandbox Mode
Before going live:
1. Set `CASHFREE_ENVIRONMENT=SANDBOX`
2. Set `NEXT_PUBLIC_CASHFREE_ENVIRONMENT=sandbox`
3. Use test credentials from Cashfree dashboard
4. Test complete payment flow:
   - New order purchase
   - Service renewal
   - Webhook handling

### Step 5: Deploy to Production
1. Update environment variables to production values
2. Set `CASHFREE_ENVIRONMENT=PRODUCTION`
3. Deploy the application
4. Monitor logs for any issues

---

## 🧪 Testing Checklist

### Payment Creation
- [ ] New VPS order creation
- [ ] Order with promo code
- [ ] Order with IP stock selection
- [ ] Payment session ID generation

### Payment Confirmation
- [ ] Successful payment confirmation
- [ ] Failed payment handling
- [ ] Auto-provisioning trigger after payment
- [ ] Notification creation

### Service Renewal
- [ ] OceanLinux VPS renewal
- [ ] SmartVPS renewal
- [ ] Hostycare renewal
- [ ] Renewal payment confirmation
- [ ] Expiry date extension

### Webhooks
- [ ] Payment success webhook
- [ ] Payment failure webhook
- [ ] Signature verification
- [ ] Order status update

### Edge Cases
- [ ] Duplicate payment attempts
- [ ] Expired payment sessions
- [ ] Network failures
- [ ] Invalid signatures

---

## 📊 API Response Structure Changes

### Payment Create Response

**Before (Razorpay):**
```json
{
  "message": "Payment initiated",
  "orderId": "...",
  "clientTxnId": "...",
  "razorpay": {
    "order_id": "order_...",
    "amount": 50000,
    "currency": "INR",
    "key": "rzp_..."
  }
}
```

**After (Cashfree):**
```json
{
  "message": "Payment initiated",
  "orderId": "...",
  "clientTxnId": "...",
  "cashfree": {
    "order_id": "ORDER_...",
    "payment_session_id": "session_...",
    "order_token": "session_...",
    "amount": 500,
    "currency": "INR"
  }
}
```

### Payment Confirm Request

**Before (Razorpay):**
```json
{
  "clientTxnId": "ORDER_...",
  "razorpay_payment_id": "pay_...",
  "razorpay_order_id": "order_...",
  "razorpay_signature": "..."
}
```

**After (Cashfree):**
```json
{
  "clientTxnId": "ORDER_...",
  "orderId": "ORDER_..."
}
```

---

## 🚨 Important Notes

### Amount Handling
- **Razorpay:** Amounts in paise (multiply by 100)
- **Cashfree:** Amounts in rupees (no multiplication needed)

### Customer Phone
- Cashfree **requires** customer phone number
- Default fallback: `'9999999999'` if not available
- **Action Required:** Update user model to collect phone numbers

### Payment Session
- Cashfree uses `payment_session_id` instead of `order_id` for checkout
- Session is valid for 30 minutes by default
- No need to manually open modal - SDK handles it

### Webhooks
- Cashfree signature uses **base64** encoding (not hex)
- Signature includes timestamp header
- Event type: `PAYMENT_SUCCESS_WEBHOOK` (not `payment.captured`)

### Return URLs
- Must be configured in each order creation
- Should include query parameters for tracking
- Cashfree redirects to return URL after payment

---

## 🔍 Debugging Tips

### Enable Detailed Logging
All payment APIs have extensive console logging:
```javascript
console.log("Creating Cashfree order:", cashfreeRequest);
console.log("Cashfree order created:", cashfreeOrder.data);
```

### Check Cashfree Dashboard
- View all transactions in real-time
- Check webhook delivery status
- View payment session details
- Download settlement reports

### Common Issues

**Issue:** Payment session expired
- **Solution:** Sessions expire after 30 minutes. Create a new order.

**Issue:** Webhook signature mismatch
- **Solution:** Ensure `CASHFREE_SECRET_KEY` is correct and matches dashboard.

**Issue:** Customer phone validation error
- **Solution:** Ensure phone number is valid Indian format or use fallback.

**Issue:** Payment successful but order not confirmed
- **Solution:** Check webhook configuration and logs. Manually verify via status API.

---

## 📞 Support

### Cashfree Support
- **Email:** support@cashfree.com
- **Phone:** +91-80-61606060
- **Dashboard:** https://merchant.cashfree.com/
- **Docs:** https://docs.cashfree.com/

### Internal Support
- Check application logs for detailed error messages
- Use `/api/payment/status` endpoint to verify payment status
- Review Cashfree dashboard for transaction details

---

## 🎉 Benefits of Cashfree

1. **Lower Transaction Fees:** Competitive pricing compared to Razorpay
2. **Instant Settlements:** Faster settlement cycles
3. **Better UPI Support:** Enhanced UPI payment experience
4. **No Setup Fees:** Zero setup or maintenance fees
5. **Advanced Analytics:** Better reporting and analytics dashboard
6. **International Payments:** Support for international cards
7. **Recurring Payments:** Built-in subscription management
8. **Split Payments:** Easy vendor/marketplace payments

---

## 📋 Rollback Plan

If you need to rollback to Razorpay:

1. Restore the following files from git:
   - `src/app/api/payment/*.js`
   - `src/app/layout.tsx`
   - `src/app/dashboard/ipStock/page.tsx`
   - `src/app/dashboard/order/[id]/page.tsx`

2. Update environment variables back to Razorpay:
   ```env
   RAZORPAY_KEY_ID=your_key
   RAZORPAY_KEY_SECRET=your_secret
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
   ```

3. Redeploy the application

---

## ✅ Migration Completed

All Razorpay integrations have been successfully replaced with Cashfree Payment Gateway. The system is ready for testing and deployment.

**Last Updated:** November 23, 2025
**Migration Status:** ✅ Complete

