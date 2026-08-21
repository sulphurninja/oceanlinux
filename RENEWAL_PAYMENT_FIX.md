# Renewal Payment Flow Fix

## Problem
After successful renewal purchases, the renewal was not being processed correctly. Users would pay but their service expiry date wouldn't be extended.

## Root Cause
The renewal payment flow had a critical flaw in how it handled the Cashfree redirect:

1. **Frontend Issue**: The order details page (`src/app/dashboard/order/[id]/page.tsx`) tried to handle renewal confirmation **inline** after the Cashfree checkout using `.then()` callbacks
2. **Redirect Problem**: Cashfree **redirects** the user to the `returnUrl` after payment, which means the page gets unloaded and the `.then()` callback **never executes**
3. **Callback Page Gap**: The payment callback page (`src/app/payment/callback/page.tsx`) only handled **new order** transactions, not renewals
4. **API Limitation**: The payment status API (`src/app/api/payment/status/route.js`) only looked for orders with `clientTxnId`, but renewals use `renewalTxnId`

## Solution

### 1. Updated Payment Status API (`src/app/api/payment/status/route.js`)
- Added support for `renewalTxnId` parameter
- Detects if transaction is a renewal (starts with `RENEWAL_`)
- Verifies renewal payment status with Cashfree
- Returns renewal-specific response format

**Key Changes:**
```javascript
const { clientTxnId, renewalTxnId } = reqBody;
const txnId = renewalTxnId || clientTxnId;
const isRenewal = !!renewalTxnId;

// Handle RENEWAL transactions separately
if (isRenewal) {
  // Check Cashfree for renewal payment status
  // Return renewal-specific response
}
```

### 2. Updated Payment Callback Page (`src/app/payment/callback/page.tsx`)
- Added detection for renewal transactions (checks if `client_txn_id` starts with `RENEWAL_`)
- Implemented renewal-specific flow:
  1. Verify payment status via `/api/payment/status` with `renewalTxnId`
  2. If payment successful, call `/api/payment/renew-confirm` to process renewal
  3. Redirect to order details page after successful renewal
- Shows appropriate success/error messages for renewals

**Key Changes:**
```typescript
const isRenewal = clientTxnId.startsWith("RENEWAL_");

if (isRenewal) {
  // Verify payment status
  const statusResponse = await fetch("/api/payment/status", {
    body: JSON.stringify({ renewalTxnId: clientTxnId })
  });
  
  // If successful, confirm renewal
  if (statusData.paymentStatus === 'SUCCESS') {
    const confirmResponse = await fetch("/api/payment/renew-confirm", {
      body: JSON.stringify({ renewalTxnId: clientTxnId, orderId: orderId })
    });
    
    // Redirect to order page
    router.push(`/dashboard/order/${orderId}`);
  }
}
```

### 3. Updated Order Details Page (`src/app/dashboard/order/[id]/page.tsx`)
- Removed inline renewal confirmation logic (the `.then()` callback that never executed)
- Simplified to just open Cashfree checkout and let it redirect
- Added clear comments explaining the redirect flow
- The callback page now handles all confirmation logic

**Key Changes:**
```typescript
// Open Cashfree checkout - user will be redirected to returnUrl after payment
// The payment/callback page will handle the renewal confirmation
cashfree.checkout(checkoutOptions).then((result: any) => {
  console.log("Cashfree renewal checkout initiated:", result);
  // Note: User will be redirected to payment/callback after payment completion
}).catch((error: any) => {
  toast.error("Payment initialization failed. Please try again.");
  setActionBusy(null);
});
```

## Flow Diagram

### Before (Broken):
```
User clicks "Renew" 
  → Frontend calls /api/payment/renew
  → Opens Cashfree checkout
  → User completes payment
  → Cashfree REDIRECTS to returnUrl
  → [PAGE UNLOADS - .then() callback NEVER RUNS]
  → ❌ Renewal never confirmed
```

### After (Fixed):
```
User clicks "Renew"
  → Frontend calls /api/payment/renew
  → Opens Cashfree checkout
  → User completes payment
  → Cashfree redirects to /payment/callback?client_txn_id=RENEWAL_xxx&order_id=xxx
  → Callback page detects renewal transaction
  → Calls /api/payment/status with renewalTxnId
  → If payment successful, calls /api/payment/renew-confirm
  → Renewal processed (expiry date extended)
  → ✅ User redirected to order page with success message
```

## Files Modified

1. **src/app/api/payment/status/route.js**
   - Added `renewalTxnId` parameter support
   - Added renewal transaction detection and handling
   - Returns renewal-specific response format

2. **src/app/payment/callback/page.tsx**
   - Added renewal transaction detection (`RENEWAL_` prefix)
   - Implemented complete renewal confirmation flow
   - Added proper redirect to order page after renewal

3. **src/app/dashboard/order/[id]/page.tsx**
   - Removed broken inline confirmation logic
   - Simplified to rely on redirect-based flow
   - Added clarifying comments

## Testing Checklist

- [x] Renewal payment initiates correctly
- [x] Cashfree checkout opens for renewal
- [x] After payment, user is redirected to callback page
- [x] Callback page detects renewal transaction
- [x] Payment status is verified
- [x] Renewal is confirmed via API
- [x] Expiry date is extended by 30 days
- [x] User is redirected to order page
- [x] Success message is displayed

## Notes

- Renewal transactions are identified by the `RENEWAL_` prefix in the transaction ID
- The callback page now handles both new orders and renewals
- The payment status API supports both `clientTxnId` (new orders) and `renewalTxnId` (renewals)
- All renewal confirmations now go through the `/api/payment/renew-confirm` endpoint
- The existing renewal confirmation API (`/api/payment/renew-confirm/route.js`) didn't need changes - it already worked correctly when called properly

## Related Files (No Changes Needed)

- `src/app/api/payment/renew/route.js` - Works correctly, creates renewal order
- `src/app/api/payment/renew-confirm/route.js` - Works correctly, processes renewal
- Both APIs were already functional, they just weren't being called properly after payment redirect

