# Cashfree 401 Authentication Error - Fix Guide

## Problem Identified

Your application is experiencing a **401 Unauthorized** error when trying to create Cashfree payment orders.

### Root Causes

1. **Environment Mismatch**: 
   - Using **production credentials** (`cfsk_ma_prod_...`)
   - But connecting to **sandbox environment** (`sandbox.cashfree.com`)
   - Cashfree requires matching credentials and environment

2. **Missing BASE_URL**:
   - `NEXT_PUBLIC_BASE_URL` is `undefined`
   - Causing return URLs to be: `undefined/payment/callback`
   - This will cause redirect issues after payment

---

## Quick Fix

### Option 1: Use Sandbox Credentials (Recommended for Testing)

Update your `.env` file:

```env
# Use SANDBOX credentials from Cashfree dashboard
CASHFREE_APP_ID=your_sandbox_app_id
CASHFREE_SECRET_KEY=your_sandbox_secret_key
CASHFREE_ENVIRONMENT=SANDBOX

# Frontend environment
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=sandbox

# Your application URL (REQUIRED)
NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
# For local testing: http://localhost:3000
```

### Option 2: Use Production Credentials (For Live Payments)

Update your `.env` file:

```env
# Use PRODUCTION credentials from Cashfree dashboard
CASHFREE_APP_ID=1134090f0a13914cd47ca45d2fc0904311
CASHFREE_SECRET_KEY=cfsk_ma_prod_34be1281656372605538be0f2cc2017b_cf899f8d
CASHFREE_ENVIRONMENT=PRODUCTION

# Frontend environment
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=production

# Your application URL (REQUIRED)
NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
```

---

## How to Get Correct Credentials

### For Sandbox (Testing)

1. Go to [Cashfree Merchant Dashboard](https://merchant.cashfree.com/)
2. Navigate to **Developers** → **API Keys**
3. Look for **Sandbox** section
4. Copy **Sandbox App ID** and **Sandbox Secret Key**
5. These will start with different prefixes than production

### For Production (Live)

1. Go to [Cashfree Merchant Dashboard](https://merchant.cashfree.com/)
2. Navigate to **Developers** → **API Keys**
3. Look for **Production** section
4. Copy **Production App ID** and **Production Secret Key**
5. Production keys look like what you have in the error log

---

## Environment Variable Reference

### Required Variables

```env
# Cashfree Credentials (MUST MATCH ENVIRONMENT)
CASHFREE_APP_ID=your_app_id_here
CASHFREE_SECRET_KEY=your_secret_key_here

# Environment Selection (MUST MATCH CREDENTIALS)
CASHFREE_ENVIRONMENT=SANDBOX
# Options: SANDBOX or PRODUCTION

# Frontend Configuration
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=sandbox
# Options: sandbox or production

# Application URL (CRITICAL - DO NOT LEAVE UNDEFINED)
NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
# For local: http://localhost:3000
# For staging: https://staging.oceanlinux.com
# For production: https://oceanlinux.com
```

---

## Verification Steps

After updating your `.env` file:

### 1. Restart Your Application

```bash
# Stop the application
pm2 stop oceanlinux

# Start it again
pm2 start oceanlinux

# Or restart
pm2 restart oceanlinux
```

### 2. Check Environment Variables Are Loaded

Add this temporary logging to verify (remove after testing):

```javascript
// In src/app/api/payment/create/route.js
console.log('Cashfree Environment:', process.env.CASHFREE_ENVIRONMENT);
console.log('Cashfree App ID:', process.env.CASHFREE_APP_ID?.substring(0, 10) + '...');
console.log('Base URL:', process.env.NEXT_PUBLIC_BASE_URL);
```

### 3. Test Payment Creation

Try creating a payment order and check the logs:

**Expected Success Log:**
```
MongoDB connected
Cashfree Environment: SANDBOX (or PRODUCTION)
Cashfree App ID: 1134090f0a...
Base URL: https://oceanlinux.com
Creating Cashfree order: { order_id: 'ORDER_...', ... }
Cashfree order created: { payment_session_id: 'session_...', ... }
```

**Current Error Log:**
```
Error initiating payment: eo [AxiosError]: Request failed with status code 401
url: 'https://sandbox.cashfree.com/pg/orders'
data: { message: 'authentication Failed', type: 'authentication_error', code: 'request_failed' }
```

---

## Understanding the Error

### What the Error Shows

From your error log:

```javascript
'x-client-secret': 'cfsk_ma_prod_34be1281656372605538be0f2cc2017b_cf899f8d'
'x-client-id': '1134090f0a13914cd47ca45d2fc0904311'
url: 'https://sandbox.cashfree.com/pg/orders'
```

**Problem**: 
- Credentials have `prod` in them → Production credentials
- URL is `sandbox.cashfree.com` → Sandbox environment
- **Mismatch causes 401 error**

### How Cashfree SDK Determines Environment

The SDK uses `Cashfree.XEnvironment` to determine the API endpoint:

```javascript
// In your code:
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT || 'PRODUCTION';

// SDK internally does:
if (XEnvironment === 'SANDBOX') {
  apiUrl = 'https://sandbox.cashfree.com';
} else {
  apiUrl = 'https://api.cashfree.com';
}
```

---

## Common Mistakes to Avoid

### ❌ Wrong: Mixing Environments

```env
# DON'T DO THIS
CASHFREE_APP_ID=prod_app_id
CASHFREE_SECRET_KEY=prod_secret_key
CASHFREE_ENVIRONMENT=SANDBOX  # ❌ Mismatch!
```

### ✅ Correct: Matching Environments

```env
# Sandbox Setup
CASHFREE_APP_ID=sandbox_app_id
CASHFREE_SECRET_KEY=sandbox_secret_key
CASHFREE_ENVIRONMENT=SANDBOX  # ✅ Match!
```

```env
# Production Setup
CASHFREE_APP_ID=prod_app_id
CASHFREE_SECRET_KEY=prod_secret_key
CASHFREE_ENVIRONMENT=PRODUCTION  # ✅ Match!
```

### ❌ Wrong: Missing BASE_URL

```env
# DON'T LEAVE THIS UNDEFINED
# NEXT_PUBLIC_BASE_URL=  # ❌ Will cause "undefined/payment/callback"
```

### ✅ Correct: Set BASE_URL

```env
NEXT_PUBLIC_BASE_URL=https://oceanlinux.com  # ✅ Correct!
```

---

## Testing Checklist

Before going live, verify:

- [ ] Environment variables are set correctly
- [ ] Credentials match the environment (sandbox/production)
- [ ] `NEXT_PUBLIC_BASE_URL` is set (not undefined)
- [ ] Application restarted after `.env` changes
- [ ] Payment creation succeeds (no 401 error)
- [ ] Return URLs are correct (not "undefined/...")
- [ ] Webhook URL is configured in Cashfree dashboard
- [ ] Test payment completes successfully

---

## Quick Command Reference

```bash
# Check environment variables (on server)
pm2 env oceanlinux

# View logs in real-time
pm2 logs oceanlinux

# Restart application
pm2 restart oceanlinux

# Check if .env file exists
ls -la /home/ec2-user/oceanlinux/.env

# View .env file (be careful with credentials)
cat /home/ec2-user/oceanlinux/.env | grep CASHFREE
```

---

## Production Deployment Checklist

When moving to production:

1. **Get Production Credentials**
   - Login to Cashfree dashboard
   - Generate production API keys
   - Copy App ID and Secret Key

2. **Update Environment Variables**
   ```env
   CASHFREE_APP_ID=your_production_app_id
   CASHFREE_SECRET_KEY=your_production_secret_key
   CASHFREE_ENVIRONMENT=PRODUCTION
   NEXT_PUBLIC_CASHFREE_ENVIRONMENT=production
   NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
   ```

3. **Configure Webhooks**
   - Go to Cashfree Dashboard → Developers → Webhooks
   - Add: `https://oceanlinux.com/api/payment/webhook`
   - Select events: Payment Success, Payment Failed

4. **Test with Small Amount**
   - Create a test order with ₹1
   - Complete payment
   - Verify order confirmation
   - Check auto-provisioning

5. **Monitor Logs**
   ```bash
   pm2 logs oceanlinux --lines 100
   ```

---

## Support

### If Issue Persists

1. **Verify Credentials in Dashboard**
   - Ensure keys are active
   - Check if keys are for correct environment

2. **Check Cashfree Status**
   - Visit: https://status.cashfree.com/
   - Verify no ongoing issues

3. **Contact Cashfree Support**
   - Email: support@cashfree.com
   - Phone: +91-80-61606060
   - Provide: Request ID from error logs

### Request ID from Your Error

```
x-request-id: ee062515-625a-421d-9c7c-fac1e9418a0c
```

Share this with Cashfree support if needed.

---

## Summary

**Immediate Action Required:**

1. ✅ Update `.env` with matching credentials and environment
2. ✅ Set `NEXT_PUBLIC_BASE_URL` to your domain
3. ✅ Restart application: `pm2 restart oceanlinux`
4. ✅ Test payment creation

**Expected Result:**
- No 401 error
- Payment session created successfully
- Correct return URLs
- Payment flow works end-to-end

---

**Last Updated:** November 23, 2025  
**Error Code:** 401 Unauthorized  
**Status:** ✅ Solution Provided

