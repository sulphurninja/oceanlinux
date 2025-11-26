# SmartVPS Retry Button Fix

## Problem

When a SmartVPS order failed and the admin clicked the "Provision" retry button in `/admin/manageOrders`, the system would block the retry with this error:

```
Order is currently being provisioned by another process (started 1s ago). Please wait.
```

This happened even though the order had actually **failed** and was not being provisioned by any other process.

## Root Cause

The issue had **three** parts:

### 1. **Orders Getting Stuck in 'provisioning' Status**

When a SmartVPS order failed during lock acquisition, the order was already set to `provisioningStatus: 'provisioning'` **before** the lock was acquired. If the lock acquisition failed, the error was thrown but the order status was never updated to `'failed'`.

**Original Flow:**
```javascript
// 1. Set order to 'provisioning' immediately
await Order.findByIdAndUpdate(order._id, {
  provisioningStatus: 'provisioning',  // ← Set BEFORE lock
  lastProvisionAttempt: new Date()
});

// 2. Try to acquire lock
try {
  await this.acquirePackageLock(pkg.name, order._id);
} catch (lockError) {
  // 3. Lock fails, throw error
  throw new Error(`Cannot provision: ${lockError.message}`);
  // ❌ Order is still in 'provisioning' status!
}
```

**Result:** Order stuck in `'provisioning'` status forever.

### 2. **Duplicate Check Blocking Retries**

The duplicate prevention logic checked if an order was in `'provisioning'` status with a recent `lastProvisionAttempt` (within 10 minutes). It would block any retry attempts, even for genuinely failed orders.

```javascript
if (order.provisioningStatus === 'provisioning' && order.lastProvisionAttempt) {
  const timeSinceAttempt = Date.now() - new Date(order.lastProvisionAttempt).getTime();
  if (timeSinceAttempt < 10 * 60 * 1000) {
    // ❌ Blocks retry even if order actually failed
    throw new Error(`Order is currently being provisioned...`);
  }
}
```

### 3. **Race Condition in Provision API**

The provision API endpoint (`/api/orders/provision`) was setting the order to `'provisioning'` status **before** calling the provisioning service:

```javascript
// In API endpoint
await Order.findByIdAndUpdate(orderId, {
  provisioningStatus: 'provisioning',  // ← Set in API
  lastProvisionAttempt: new Date()
});

// Then call provisioning service
const result = await provisioningService.provisionServer(orderId);

// But provisioning service checks for duplicates...
if (order.provisioningStatus === 'provisioning') {
  // ❌ Blocks the retry!
  throw new Error('Order is currently being provisioned...');
}
```

**Result:** Manual retries were blocked because the API set the status to `'provisioning'` before the provisioning service could check if it was a retry.

## Solution

### Fix 1: Remove Status Update from API Endpoint

Removed the premature status update from the provision API. Let the provisioning service handle all status updates after proper checks and lock acquisition.

**Before:**
```javascript
// API sets status first
await Order.findByIdAndUpdate(orderId, {
  provisioningStatus: 'provisioning',
  lastProvisionAttempt: new Date()
});

// Then calls service
const result = await provisioningService.provisionServer(orderId);
```

**After:**
```javascript
// API just calls the service directly
// Let the service handle status updates after checks
const result = await provisioningService.provisionServer(orderId);
```

**Benefits:**
- No race condition between API and service
- Provisioning service can properly check for duplicates
- Manual retries work correctly

### Fix 2: Set Order to 'provisioning' AFTER Lock Acquisition

Moved the order status update to **after** successfully acquiring the lock. If lock acquisition fails, we now explicitly set the order to `'failed'` status.

**New Flow:**
```javascript
// 1. Try to acquire lock FIRST
try {
  await this.acquirePackageLock(pkg.name, order._id);
  lockAcquired = true;
} catch (lockError) {
  // 2. Lock fails, mark order as FAILED
  await Order.findByIdAndUpdate(order._id, {
    provisioningStatus: 'failed',
    provisioningError: `Lock acquisition failed: ${lockError.message}`,
    provider: 'smartvps'
  });
  throw new Error(`Cannot provision: ${lockError.message}`);
}

// 3. NOW set order to 'provisioning' (only if lock succeeded)
await Order.findByIdAndUpdate(order._id, {
  provisioningStatus: 'provisioning',
  lastProvisionAttempt: new Date(),
  os: targetOS,
  provider: 'smartvps'
});
```

**Benefits:**
- Orders never get stuck in `'provisioning'` status
- Failed orders are properly marked as `'failed'`
- Lock failures are properly recorded in `provisioningError`

### Fix 3: Allow Retries for Failed Orders

Added explicit logic to allow retries for orders with `provisioningStatus: 'failed'`, regardless of `lastProvisionAttempt`.

```javascript
if (order.provisioningStatus === 'provisioning' && order.lastProvisionAttempt) {
  const timeSinceAttempt = Date.now() - new Date(order.lastProvisionAttempt).getTime();
  if (timeSinceAttempt < 10 * 60 * 1000) {
    // Only block if truly in progress
    throw new Error(`Order is currently being provisioned...`);
  } else {
    L.line(`⚠️ Order stuck in 'provisioning' state for ${Math.round(timeSinceAttempt / 60000)} minutes, allowing retry...`);
  }
} else if (order.provisioningStatus === 'failed') {
  // ✅ Explicitly allow retries for failed orders
  L.line(`✅ Order has 'failed' status, allowing manual retry...`);
}
```

**Benefits:**
- Failed orders can always be retried
- Truly in-progress orders are still protected from duplicates
- Clear logging for debugging

## Files Modified

### 1. **src/app/api/orders/provision/route.js**

**Lines 73-83**: Removed premature status update
- Removed the `Order.findByIdAndUpdate()` call that set `provisioningStatus: 'provisioning'`
- Added comment explaining why the service handles status updates
- Prevents race condition between API and service

### 2. **src/services/autoProvisioningService.js**

**Lines 422-448**: Reordered lock acquisition and status update
   - Lock is now acquired before setting `provisioningStatus: 'provisioning'`
   - Lock failures now set `provisioningStatus: 'failed'`
   - Added error handling for lock acquisition

**Lines 334-346**: Enhanced duplicate check logic
   - Added explicit check for `provisioningStatus: 'failed'`
   - Added logging for failed order retries
   - Maintains protection for truly in-progress orders

## Testing Scenarios

### Scenario 1: Lock Acquisition Fails
```
Order 1 starts provisioning from package "103.101"
  ↓
Order 2 tries to provision from same package
  ↓
Lock acquisition fails (package locked)
  ↓
✅ Order 2 is marked as 'failed' with error message
  ↓
Admin clicks retry button
  ↓
✅ Retry is allowed (status is 'failed')
  ↓
Lock is now available
  ↓
✅ Order 2 provisions successfully
```

### Scenario 2: Order Fails During Provisioning
```
Order starts provisioning
  ↓
Lock acquired successfully
  ↓
Status set to 'provisioning'
  ↓
SmartVPS API fails (wrong IP, timeout, etc.)
  ↓
✅ Error caught, status set to 'failed'
  ↓
Admin clicks retry button
  ↓
✅ Retry is allowed (status is 'failed')
  ↓
✅ Provisioning retries
```

### Scenario 3: Duplicate Prevention (Still Works)
```
Order starts provisioning
  ↓
Lock acquired, status set to 'provisioning'
  ↓
Admin clicks retry button (within 10 minutes)
  ↓
❌ Retry is blocked (order truly in progress)
  ↓
Error: "Order is currently being provisioned..."
```

### Scenario 4: Stuck Order (Auto-Recovery)
```
Order stuck in 'provisioning' for 15 minutes
  ↓
Admin clicks retry button
  ↓
✅ Retry is allowed (> 10 minutes elapsed)
  ↓
Log: "Order stuck in 'provisioning' state for 15 minutes, allowing retry..."
  ↓
✅ Provisioning retries
```

## Benefits

1. **No More Stuck Orders**: Orders can't get stuck in `'provisioning'` status
2. **Reliable Retries**: Failed orders can always be retried manually
3. **Better Error Messages**: Lock failures are properly recorded
4. **Maintains Safety**: Duplicate prevention still works for truly in-progress orders
5. **Clear Logging**: Better visibility into what's happening

## Related Issues

This fix addresses the following user-reported issues:
- "order failed, and when i tried clicking retry button in /admin/manageOrders, it says this stupid shit (only for smartvps products)"
- Orders stuck in `'provisioning'` status after lock acquisition failures
- Unable to retry failed SmartVPS orders

## Notes

- This fix only affects SmartVPS orders (Hostycare orders don't use locks)
- The 10-minute duplicate prevention window is still active for truly in-progress orders
- Lock acquisition happens before any database updates to prevent inconsistent states
- Failed orders are explicitly allowed to retry, regardless of timing

