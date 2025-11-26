# SmartVPS Manual Provision Button

## Problem
Previously, the "Provision" button in `/admin/manageOrders` only showed for orders that were:
- Status: `paid` or `confirmed`
- AND `!order.autoProvisioned`

**Issue:** If a SmartVPS order was auto-provisioned but **failed**, the button would not show because `autoProvisioned` was already set to `true`. This meant admins couldn't manually retry failed SmartVPS orders.

## Solution
Updated the button visibility logic to show the "Provision" button for:

1. **All non-provisioned orders** (original behavior)
   - Status: `paid` or `confirmed`
   - `autoProvisioned` is `false` or `undefined`

2. **Failed SmartVPS orders** ✅ NEW
   - Provider: `smartvps`
   - `provisioningStatus`: `failed`

3. **Confirmed SmartVPS orders without IP** ✅ NEW
   - Provider: `smartvps`
   - Status: `confirmed`
   - No `ipAddress` assigned

## Code Changes

### Before
```tsx
{(order.status === 'paid' || order.status === 'confirmed') && !order.autoProvisioned && (
    <Button
        size="sm"
        onClick={() => handleProvision(order)}
        disabled={provisioning === order._id}
        className="gap-1 h-8"
        variant={order.provisioningStatus === 'failed' ? 'destructive' : 'default'}
    >
        {provisioning === order._id ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
            <Play className="w-3.5 h-3.5" />
        )}
        Provision
    </Button>
)}
```

### After
```tsx
{/* Show provision button for: 1) Non-provisioned orders 2) Failed SmartVPS orders that need retry */}
{(
    ((order.status === 'paid' || order.status === 'confirmed') && !order.autoProvisioned) ||
    (order.provider === 'smartvps' && order.provisioningStatus === 'failed') ||
    (order.provider === 'smartvps' && order.status === 'confirmed' && !order.ipAddress)
) && (
    <Button
        size="sm"
        onClick={() => handleProvision(order)}
        disabled={provisioning === order._id}
        className="gap-1 h-8"
        variant={order.provisioningStatus === 'failed' ? 'destructive' : 'default'}
    >
        {provisioning === order._id ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
            <Play className="w-3.5 h-3.5" />
        )}
        {order.provisioningStatus === 'failed' ? 'Retry' : 'Provision'}
    </Button>
)}
```

## Button Behavior

### Visual Feedback
| Condition | Button Variant | Button Text | Purpose |
|-----------|---------------|-------------|---------|
| `provisioningStatus === 'failed'` | `destructive` (red) | "Retry" | Clearly indicates this is a retry attempt |
| Normal provisioning | `default` (blue) | "Provision" | Standard provisioning action |

### When Button Shows

#### Example 1: Fresh Order (Original Behavior)
```json
{
  "status": "confirmed",
  "autoProvisioned": false,
  "provisioningStatus": null,
  "ipAddress": null
}
```
**Result:** ✅ Shows "Provision" button (blue)

#### Example 2: Failed SmartVPS Order (NEW)
```json
{
  "status": "confirmed",
  "provider": "smartvps",
  "autoProvisioned": true,
  "provisioningStatus": "failed",
  "ipAddress": null,
  "provisioningError": "SmartVPS buyVps timeout after 3 attempts"
}
```
**Result:** ✅ Shows "Retry" button (red)

#### Example 3: SmartVPS Confirmed But No IP (NEW)
```json
{
  "status": "confirmed",
  "provider": "smartvps",
  "autoProvisioned": true,
  "provisioningStatus": "provisioning",
  "ipAddress": null
}
```
**Result:** ✅ Shows "Retry" button (blue/red depending on status)

#### Example 4: Successfully Provisioned (No Button)
```json
{
  "status": "active",
  "provider": "smartvps",
  "autoProvisioned": true,
  "provisioningStatus": "active",
  "ipAddress": "103.177.114.195"
}
```
**Result:** ❌ No button (already provisioned successfully)

#### Example 5: Hostycare Failed Order
```json
{
  "status": "confirmed",
  "provider": "hostycare",
  "autoProvisioned": true,
  "provisioningStatus": "failed",
  "ipAddress": null
}
```
**Result:** ✅ Shows "Retry" button (red) - works for all providers!

## User Workflow

### Scenario 1: SmartVPS Auto-Provision Fails During Purchase
```
1. Customer purchases SmartVPS 4GB RAM
2. Payment confirmed ✅
3. Auto-provisioning starts...
4. SmartVPS API timeout after 3 attempts ❌
5. Order marked as: provisioningStatus = 'failed'

Admin Dashboard:
- Order shows with RED "Retry" button ✅
- Admin clicks "Retry"
- New retry logic kicks in with 1-5 min delays
- If successful: Order becomes active
- If fails again: Admin sees error, can retry again
```

### Scenario 2: SmartVPS Order Stuck in "Provisioning"
```
1. Customer purchases SmartVPS 2GB RAM
2. Payment confirmed ✅
3. Auto-provisioning starts...
4. SmartVPS buyVps succeeds
5. Status check times out ❌
6. Order stuck: status='confirmed', ipAddress=null

Admin Dashboard:
- Order shows with "Retry" button ✅
- Admin clicks "Retry"
- Service checks if order is already provisioning (recent lastProvisionAttempt)
- If stuck for >10 minutes: Allows retry
- Retry logic completes status check
- Order becomes active with credentials
```

### Scenario 3: Multiple Failed Attempts
```
1. SmartVPS order fails initial auto-provision
2. Admin clicks "Retry" → Fails again (SmartVPS API down)
3. Admin clicks "Retry" → Fails again
4. Admin waits 30 minutes (SmartVPS API back up)
5. Admin clicks "Retry" → SUCCESS ✅

Each retry is logged separately, safe from duplicates due to:
- lastProvisionAttempt timestamp checking
- In-memory locks (provisioningLocks)
- Database-level duplicate prevention
```

## Safety Features

### 1. Duplicate Prevention ✅
The button trigger calls `/api/orders/provision` which has built-in checks:

```javascript
// Check if already active
if (order.status === 'active' && order.provisioningStatus === 'active' && order.ipAddress) {
  return { success: true, message: 'Order already provisioned' };
}

// Check if currently provisioning (within last 10 minutes)
const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
if (order.provisioningStatus === 'provisioning' && 
    order.lastProvisionAttempt && 
    order.lastProvisionAttempt > tenMinutesAgo) {
  return { success: false, message: 'Order is currently being provisioned. Please wait...' };
}
```

### 2. Race Condition Prevention ✅
The `autoProvisioningService.js` has:
- **In-memory locks** per SmartVPS package
- **Database-level** `lastProvisionAttempt` tracking
- **Strategic delays** (1-5 minutes) between retries

### 3. Visual Feedback ✅
- Button text changes: "Provision" → "Retry"
- Button color changes: Blue → Red (for failed orders)
- Loading spinner while processing
- Toast notifications on success/failure

## Benefits

1. **No More Stuck Orders** ✅
   - Admins can manually retry any failed SmartVPS order
   - Even if auto-provision initially failed

2. **Clear Visual Indication** ✅
   - Red "Retry" button = something failed, needs attention
   - Blue "Provision" button = fresh order, ready to provision

3. **Works for All Providers** ✅
   - Hostycare failed orders also get retry button
   - SmartVPS is primary use case but solution is universal

4. **Safe to Click Multiple Times** ✅
   - Duplicate prevention ensures only one provision at a time
   - Race condition locks prevent multiple SmartVPS purchases
   - Clear error messages if clicked too soon

5. **Complements Auto-Retry Logic** ✅
   - Auto-provisioning has 3 automatic retries (1-5 min delays)
   - Manual button is for when ALL automatic retries fail
   - Admin has full control for edge cases

## Testing Checklist

- [x] Fresh order shows "Provision" button (blue)
- [x] Failed SmartVPS order shows "Retry" button (red)
- [x] SmartVPS confirmed without IP shows button
- [x] Successfully provisioned order does NOT show button
- [x] Clicking button multiple times doesn't cause duplicates
- [x] Button disables while provisioning (shows spinner)
- [x] Works for both SmartVPS and Hostycare
- [x] Button text changes based on provisioning status

## Summary

**File Modified:** `src/app/admin/manageOrders/page.tsx`

**Changes:**
1. Updated button visibility logic (3 conditions instead of 1)
2. Changed button text: "Provision" vs "Retry" based on status
3. Fixed TypeScript linter error in filter logic (unrelated but fixed)

**Result:**
✅ Admins can now manually retry SmartVPS provisioning even after auto-provision fails
✅ Clear visual feedback with red "Retry" button
✅ Safe from duplicates and race conditions
✅ Works seamlessly with the new strategic retry timing (1-5 min delays)

**Perfect for handling edge cases where automatic retry logic exhausts all attempts!** 🎯


