# Quick Start Guide - Cashfree Integration

## 🚀 Get Started in 5 Minutes

### Step 1: Get Cashfree Credentials (2 minutes)

1. Go to [Cashfree Merchant Dashboard](https://merchant.cashfree.com/)
2. Sign up or log in
3. Navigate to **Developers** → **API Keys**
4. Click **Generate API Keys**
5. Copy your credentials:
   - **App ID** (Client ID)
   - **Secret Key**

### Step 2: Update Environment Variables (1 minute)

Add these to your `.env` file:

```env
# Cashfree Payment Gateway
CASHFREE_APP_ID=your_app_id_here
CASHFREE_SECRET_KEY=your_secret_key_here
CASHFREE_ENVIRONMENT=SANDBOX
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=sandbox
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Important:** Start with `SANDBOX` for testing!

### Step 3: Install Dependencies (1 minute)

```bash
npm install
# or
bun install
```

The required packages are already in `package.json`:
- `cashfree-pg`: ^4.3.10
- `@cashfreepayments/cashfree-js`: ^1.0.5

### Step 4: Configure Webhooks (1 minute)

1. Go to Cashfree Dashboard → **Developers** → **Webhooks**
2. Add webhook URL:
   - **For local testing:** Use ngrok or similar tool
   - **For production:** `https://yourdomain.com/api/payment/webhook`
3. Select events:
   - ✅ Payment Success
   - ✅ Payment Failed
4. Save

### Step 5: Test Payment Flow (30 seconds)

```bash
npm run dev
# or
bun dev
```

1. Navigate to IP Stock page
2. Select a VPS plan
3. Click "Proceed to Payment"
4. Use Cashfree test cards (see below)
5. Complete payment
6. Verify order confirmation

---

## 🧪 Test Cards for Sandbox

### Successful Payment
- **Card Number:** 4111 1111 1111 1111
- **CVV:** Any 3 digits
- **Expiry:** Any future date
- **Name:** Any name

### Failed Payment
- **Card Number:** 4000 0000 0000 0002
- **CVV:** Any 3 digits
- **Expiry:** Any future date

### UPI Testing
- **UPI ID:** success@upi
- **Result:** Successful payment

More test credentials: [Cashfree Test Data](https://docs.cashfree.com/docs/test-data)

---

## 🔍 Verify Everything Works

### 1. Check Payment Creation
```bash
# Look for this in console logs:
Creating Cashfree order: { order_id: 'ORDER_...', ... }
Cashfree order created: { payment_session_id: 'session_...', ... }
```

### 2. Check Payment Confirmation
```bash
# After successful payment:
Cashfree payment verification response: [{ payment_status: 'SUCCESS', ... }]
Order confirmed with payment: cf_...
```

### 3. Check Webhook
```bash
# Webhook received:
[WEBHOOK] 🚀 CASHFREE WEBHOOK RECEIVED
[WEBHOOK] 💳 Payment successful for order: ORDER_...
[WEBHOOK] ✅ FOUND ORDER: ...
```

### 4. Check Auto-Provisioning
```bash
# After payment confirmation:
[WEBHOOK] 🚀 STARTING AUTO-PROVISIONING for order ...
Auto-provisioning completed successfully
```

---

## 🎯 Quick Test Checklist

- [ ] Environment variables set
- [ ] Dependencies installed
- [ ] Dev server running
- [ ] Can access IP Stock page
- [ ] Payment modal opens
- [ ] Test payment succeeds
- [ ] Order status updates to "confirmed"
- [ ] Auto-provisioning triggers
- [ ] Webhook received and processed
- [ ] Email notification sent

---

## 🚨 Common Issues & Quick Fixes

### Issue: "Cashfree is not defined"
**Fix:** Check that Cashfree script is loaded in `layout.tsx`
```html
<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
```

### Issue: "Invalid credentials"
**Fix:** 
1. Verify `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` are correct
2. Ensure no extra spaces in `.env` file
3. Restart dev server after changing `.env`

### Issue: "Payment session expired"
**Fix:** Payment sessions expire after 30 minutes. Create a new order.

### Issue: "Webhook not received"
**Fix:** 
1. For local testing, use ngrok: `ngrok http 3000`
2. Update webhook URL in Cashfree dashboard
3. Check webhook logs in Cashfree dashboard

### Issue: "Customer phone validation error"
**Fix:** Ensure user has phone number or fallback is used:
```javascript
customer_phone: user.phone || '9999999999'
```

---

## 📱 Testing on Mobile

1. Use ngrok to expose local server:
   ```bash
   ngrok http 3000
   ```

2. Update `.env`:
   ```env
   NEXT_PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io
   ```

3. Open ngrok URL on mobile device
4. Test payment flow

---

## 🎉 Going to Production

When ready for production:

1. **Update environment variables:**
   ```env
   CASHFREE_ENVIRONMENT=PRODUCTION
   NEXT_PUBLIC_CASHFREE_ENVIRONMENT=production
   NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
   ```

2. **Use production credentials** from Cashfree dashboard

3. **Update webhook URL** to production domain

4. **Deploy and monitor** first few transactions

5. **Test with small amount** first

---

## 📚 Additional Resources

- **Full Migration Guide:** `CASHFREE_MIGRATION_GUIDE.md`
- **All Changes:** `RAZORPAY_TO_CASHFREE_CHANGES.md`
- **Environment Setup:** `ENV_TEMPLATE.md`
- **Cashfree Docs:** https://docs.cashfree.com/
- **Cashfree Dashboard:** https://merchant.cashfree.com/

---

## 💡 Pro Tips

1. **Always test in sandbox first** before going live
2. **Monitor webhook logs** in Cashfree dashboard
3. **Set up email alerts** for failed payments
4. **Keep API keys secure** - never commit to git
5. **Use environment-specific configs** for dev/staging/prod
6. **Test all payment methods** (cards, UPI, netbanking)
7. **Verify auto-provisioning** works correctly
8. **Check settlement reports** regularly

---

## 🆘 Need Help?

1. **Check console logs** - extensive logging is enabled
2. **Review Cashfree dashboard** - view transaction details
3. **Check webhook delivery** - verify webhooks are received
4. **Test in sandbox** - isolate production issues
5. **Contact Cashfree support** - support@cashfree.com

---

## ✅ You're Ready!

Your Cashfree integration is complete and ready to use. Start with sandbox testing, then move to production when confident.

**Happy testing! 🚀**


