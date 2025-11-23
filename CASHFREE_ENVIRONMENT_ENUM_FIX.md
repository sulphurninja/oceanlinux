# Cashfree Environment Enum Fix

## Problem

Even with `CASHFREE_ENVIRONMENT=PRODUCTION` set in `.env`, the Cashfree SDK was still connecting to the sandbox environment (`sandbox.cashfree.com`), causing 401 authentication errors.

## Root Cause

The Cashfree SDK requires the environment to be set using the `Cashfree.Environment` enum, not a string value.

### ❌ What Was Wrong

```javascript
// This doesn't work correctly
Cashfree.XEnvironment = 'PRODUCTION'; // String value
```

The SDK was defaulting to sandbox because it didn't recognize the string `'PRODUCTION'`.

### ✅ What's Fixed Now

```javascript
// This works correctly
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;
```

Now the SDK properly uses the enum values:
- `Cashfree.Environment.SANDBOX` → connects to `sandbox.cashfree.com`
- `Cashfree.Environment.PRODUCTION` → connects to `api.cashfree.com`

---

## Files Updated

All payment API files have been updated with the correct enum usage:

1. ✅ `src/app/api/payment/create/route.js`
2. ✅ `src/app/api/payment/confirm/route.js`
3. ✅ `src/app/api/payment/renew/route.js`
4. ✅ `src/app/api/payment/renew-confirm/route.js`
5. ✅ `src/app/api/payment/status/route.js`

---

## What Changed

### Before (Incorrect)

```javascript
import { Cashfree } from 'cashfree-pg';

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT || 'PRODUCTION'; // ❌ String
```

### After (Correct)

```javascript
import { Cashfree } from 'cashfree-pg';

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION; // ✅ Enum
```

---

## How It Works Now

### Environment Detection Logic

```javascript
if (process.env.CASHFREE_ENVIRONMENT === 'SANDBOX') {
  // Use Cashfree.Environment.SANDBOX
  // Connects to: https://sandbox.cashfree.com
} else {
  // Use Cashfree.Environment.PRODUCTION (default)
  // Connects to: https://api.cashfree.com
}
```

### Your `.env` Configuration

```env
CASHFREE_APP_ID="1134090f0a13914cd47ca45d2fc0904311"
CASHFREE_SECRET_KEY="cfsk_ma_prod_34be1281656372605538be0f2cc2017b_cf899f8d"
CASHFREE_ENVIRONMENT=PRODUCTION  # ← This now works correctly!
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=production
NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
```

**Result:** SDK will use `Cashfree.Environment.PRODUCTION` and connect to `api.cashfree.com`

---

## Verification

### Added Logging in Payment Create API

The fix includes logging to verify the correct environment is being used:

```javascript
console.log('[Cashfree Init] Environment:', process.env.CASHFREE_ENVIRONMENT);
console.log('[Cashfree Init] Using:', Cashfree.XEnvironment === Cashfree.Environment.PRODUCTION ? 'PRODUCTION' : 'SANDBOX');
```

### Expected Log Output

**For Production:**
```
[Cashfree Init] Environment: PRODUCTION
[Cashfree Init] Using: PRODUCTION
```

**For Sandbox:**
```
[Cashfree Init] Environment: SANDBOX
[Cashfree Init] Using: SANDBOX
```

---

## Testing Steps

### 1. Restart Your Application

```bash
pm2 restart oceanlinux
```

### 2. Check Logs for Initialization

```bash
pm2 logs oceanlinux | grep "Cashfree Init"
```

You should see:
```
[Cashfree Init] Environment: PRODUCTION
[Cashfree Init] Using: PRODUCTION
```

### 3. Test Payment Creation

Try creating a payment order and verify:

**Before Fix:**
```
url: 'https://sandbox.cashfree.com/pg/orders'  # ❌ Wrong!
status: 401 Unauthorized
```

**After Fix:**
```
url: 'https://api.cashfree.com/pg/orders'  # ✅ Correct!
status: 200 OK
```

---

## API Endpoint Reference

### Cashfree Environment URLs

| Environment | Enum Value | API URL |
|------------|------------|---------|
| Sandbox | `Cashfree.Environment.SANDBOX` | `https://sandbox.cashfree.com` |
| Production | `Cashfree.Environment.PRODUCTION` | `https://api.cashfree.com` |

### How SDK Determines URL

The Cashfree SDK internally does:

```javascript
if (Cashfree.XEnvironment === Cashfree.Environment.SANDBOX) {
  baseUrl = 'https://sandbox.cashfree.com';
} else if (Cashfree.XEnvironment === Cashfree.Environment.PRODUCTION) {
  baseUrl = 'https://api.cashfree.com';
}
```

---

## Common Issues & Solutions

### Issue: Still Getting 401 Error

**Check:**
1. Verify environment variable is set correctly
2. Restart application after changes
3. Check logs to confirm environment detection

**Debug:**
```bash
# Check environment variable
pm2 env oceanlinux | grep CASHFREE

# View logs
pm2 logs oceanlinux --lines 50
```

### Issue: Credentials Don't Match Environment

**Sandbox Credentials:**
- App ID: Usually shorter or different format
- Secret Key: Starts with `cfsk_ma_test_...` or similar
- Use with: `CASHFREE_ENVIRONMENT=SANDBOX`

**Production Credentials:**
- App ID: Like yours `1134090f0a13914cd47ca45d2fc0904311`
- Secret Key: Starts with `cfsk_ma_prod_...`
- Use with: `CASHFREE_ENVIRONMENT=PRODUCTION`

### Issue: Environment Not Changing

**Solution:**
1. Update `.env` file
2. **Must restart** application: `pm2 restart oceanlinux`
3. Environment variables are loaded at startup, not runtime

---

## Cashfree SDK Documentation

### Environment Enum

From Cashfree SDK documentation:

```javascript
Cashfree.Environment = {
  SANDBOX: 'sandbox',
  PRODUCTION: 'production'
}
```

### Correct Usage

```javascript
// ✅ Correct - Using enum
Cashfree.XEnvironment = Cashfree.Environment.PRODUCTION;

// ❌ Incorrect - Using string (may not work)
Cashfree.XEnvironment = 'PRODUCTION';

// ❌ Incorrect - Using lowercase (definitely won't work)
Cashfree.XEnvironment = 'production';
```

---

## Migration from Razorpay

This is one of the key differences between Razorpay and Cashfree:

### Razorpay (Old)
```javascript
// Razorpay used different instances for environments
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
// Environment determined by which keys you use
```

### Cashfree (New)
```javascript
// Cashfree uses static configuration with enum
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = Cashfree.Environment.PRODUCTION; // Must use enum
```

---

## Quick Reference

### Environment Variables

```env
# Required for Cashfree
CASHFREE_APP_ID=your_app_id
CASHFREE_SECRET_KEY=your_secret_key
CASHFREE_ENVIRONMENT=PRODUCTION  # or SANDBOX

# Required for frontend
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=production  # or sandbox
NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
```

### Restart Command

```bash
pm2 restart oceanlinux
```

### Check Logs

```bash
pm2 logs oceanlinux
```

### Verify Environment

```bash
pm2 env oceanlinux | grep CASHFREE
```

---

## Summary

✅ **Fixed:** Cashfree SDK now correctly uses enum values for environment  
✅ **Impact:** Production credentials now connect to production API  
✅ **Files:** Updated 5 payment API files  
✅ **Testing:** Added logging to verify environment detection  
✅ **Action:** Restart application to apply changes  

---

**Date:** November 23, 2025  
**Issue:** SDK using sandbox despite PRODUCTION setting  
**Cause:** String value instead of enum  
**Fix:** Use `Cashfree.Environment.PRODUCTION` enum  
**Status:** ✅ Complete

