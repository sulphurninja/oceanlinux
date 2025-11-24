# SmartVPS Provider Display Fix

## Problem
In the `/admin/manageOrders` table, SmartVPS orders were displaying their provider as "hostycare" instead of "smartvps".

### Root Cause
The `provider` field in the order document was not being set during the initial provisioning phase. It was only being set at the very end when the order succeeded.

**Timeline of the issue:**
```
1. Order created → provider = 'hostycare' (default from model)
2. Payment confirmed
3. Auto-provisioning starts
4. provisionViaSmartVps() called
5. Order updated: provisioningStatus = 'provisioning' (but provider still 'hostycare')
6. SmartVPS API calls (buyVps, status)
7. SUCCESS: provider = 'smartvps' set ✅
8. FAILURE: provider never changed, stays 'hostycare' ❌
```

**Result:** Failed or in-progress SmartVPS orders showed as "hostycare" in the admin panel.

## Solution
Set the `provider` field **at the very start** of both provisioning paths, not just on success.

### Code Changes

#### 1. SmartVPS Provisioning Path
**File:** `src/services/autoProvisioningService.js`

**Before:**
```javascript
async provisionViaSmartVps(order, ipStock, startTime) {
  L.head(`SMARTVPS PATH — order ${order._id}`);
  
  const isWindowsProduct = /windows|rdp|vps/i.test(String(order.productName));
  const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
  
  await Order.findByIdAndUpdate(order._id, {
    provisioningStatus: 'provisioning',
    provisioningError: '',
    autoProvisioned: true,
    lastProvisionAttempt: new Date(),
    os: targetOS
    // provider NOT set here ❌
  });
  
  // ... provisioning logic ...
  
  // Only set provider on SUCCESS
  const updateData = {
    status: 'active',
    provisioningStatus: 'active',
    provider: 'smartvps',  // Set here, but only if successful ❌
    // ...
  };
}
```

**After:**
```javascript
async provisionViaSmartVps(order, ipStock, startTime) {
  L.head(`SMARTVPS PATH — order ${order._id}`);
  
  const isWindowsProduct = /windows|rdp|vps/i.test(String(order.productName));
  const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
  
  await Order.findByIdAndUpdate(order._id, {
    provisioningStatus: 'provisioning',
    provisioningError: '',
    autoProvisioned: true,
    lastProvisionAttempt: new Date(),
    os: targetOS,
    provider: 'smartvps'  // ✅ Set provider immediately
  });
  
  // ... provisioning logic ...
  
  // Provider already set, just update status
  const updateData = {
    status: 'active',
    provisioningStatus: 'active',
    provider: 'smartvps',  // Redundant but kept for clarity
    // ...
  };
}
```

#### 2. Hostycare Provisioning Path
**File:** `src/services/autoProvisioningService.js`

**Before:**
```javascript
async provisionViaHostycare(order, ipStock, startTime) {
  L.head(`HOSTYCARE PATH — order ${order._id}`);
  
  const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
  
  await Order.findByIdAndUpdate(order._id, {
    provisioningStatus: 'provisioning',
    provisioningError: '',
    autoProvisioned: true,
    lastProvisionAttempt: new Date(),
    os: targetOS
    // provider NOT set here ❌
  });
  
  // ... provisioning logic ...
  
  // Only set provider on SUCCESS
  await Order.findByIdAndUpdate(order._id, {
    status: 'active',
    provisioningStatus: 'active',
    provider: 'hostycare',  // Set here, but only if successful ❌
    // ...
  });
}
```

**After:**
```javascript
async provisionViaHostycare(order, ipStock, startTime) {
  L.head(`HOSTYCARE PATH — order ${order._id}`);
  
  const targetOS = isWindowsProduct ? 'Windows 2022 64' : 'Ubuntu 22';
  
  await Order.findByIdAndUpdate(order._id, {
    provisioningStatus: 'provisioning',
    provisioningError: '',
    autoProvisioned: true,
    lastProvisionAttempt: new Date(),
    os: targetOS,
    provider: 'hostycare'  // ✅ Set provider immediately
  });
  
  // ... provisioning logic ...
  
  // Provider already set, just update status
  await Order.findByIdAndUpdate(order._id, {
    status: 'active',
    provisioningStatus: 'active',
    provider: 'hostycare',  // Redundant but kept for clarity
    // ...
  });
}
```

## Order Lifecycle with Fix

### Scenario 1: SmartVPS Order - Success
```
1. Order created (payment) → provider = 'hostycare' (default)
2. provisionServer() called
3. Determines route: SmartVPS ✅
4. provisionViaSmartVps() → IMMEDIATELY sets provider = 'smartvps' ✅
5. buyVps() → success
6. status() → success
7. Final update → provider = 'smartvps' (already set)

Admin Dashboard: Shows "smartvps" ✅
```

### Scenario 2: SmartVPS Order - Fails During Provisioning
```
1. Order created (payment) → provider = 'hostycare' (default)
2. provisionServer() called
3. Determines route: SmartVPS ✅
4. provisionViaSmartVps() → IMMEDIATELY sets provider = 'smartvps' ✅
5. buyVps() → timeout/error after 3 retries ❌
6. Catch block → provisioningStatus = 'failed'
7. Provider field PRESERVED as 'smartvps' ✅

Admin Dashboard: Shows "smartvps" with red "Retry" button ✅
```

### Scenario 3: SmartVPS Order - In Progress
```
1. Order created (payment) → provider = 'hostycare' (default)
2. provisionServer() called
3. Determines route: SmartVPS ✅
4. provisionViaSmartVps() → IMMEDIATELY sets provider = 'smartvps' ✅
5. buyVps() → waiting (retry delay)...
6. Still processing...

Admin Dashboard: Shows "smartvps" with "Provisioning" status ✅
```

### Scenario 4: Hostycare Order - Any Status
```
1. Order created (payment) → provider = 'hostycare' (default)
2. provisionServer() called
3. Determines route: Hostycare ✅
4. provisionViaHostycare() → IMMEDIATELY sets provider = 'hostycare' ✅
5. createService() → success/fail/in-progress

Admin Dashboard: Always shows "hostycare" ✅
```

## Admin Dashboard Display

### Table View (After Fix)

| Customer | Product | Memory | Provider | Status | Provisioning | Actions |
|----------|---------|--------|----------|--------|--------------|---------|
| John Doe | Smart VPS Delhi 📍 | 4GB | **smartvps** ✅ | Confirmed | ❌ Failed | [Edit] [🔴 Retry] |
| Jane Smith | Smart VPS Mumbai 📍 | 2GB | **smartvps** ✅ | Confirmed | ⏳ Provisioning | [Edit] |
| Bob Lee | Smart VPS Delhi 📍 | 8GB | **smartvps** ✅ | Active | ✅ Active | [Edit] |
| Alice Wong | Ocean Linux Cloud 🌊 | 4GB | **hostycare** ✅ | Active | ✅ Active | [Edit] |

**Before Fix:** All SmartVPS orders showed "hostycare" ❌  
**After Fix:** All SmartVPS orders show "smartvps" ✅

## Benefits

### 1. Accurate Provider Tracking ✅
```
Before: Admin couldn't tell which provider an order used
After:  Clear visibility of SmartVPS vs Hostycare
```

### 2. Better Debugging ✅
```
Before: Failed SmartVPS orders looked like Hostycare orders
After:  Can immediately identify which API failed (SmartVPS vs Hostycare)
```

### 3. Filtering & Analytics ✅
```
Admin can now:
- Filter orders by provider
- Track SmartVPS vs Hostycare success rates
- Identify which provider has more failures
```

### 4. Manual Intervention ✅
```
Before: Admin sees "hostycare" → tries Hostycare fixes → doesn't work
After:  Admin sees "smartvps" → applies SmartVPS retry logic → works!
```

### 5. Audit Trail ✅
```
Order history now correctly reflects:
- Which API was used for provisioning
- Which provider credentials are stored
- Which provider to use for management actions (start/stop/reinstall)
```

## Testing Checklist

- [x] SmartVPS order in progress shows "smartvps"
- [x] SmartVPS failed order shows "smartvps"
- [x] SmartVPS successful order shows "smartvps"
- [x] Hostycare order in progress shows "hostycare"
- [x] Hostycare failed order shows "hostycare"
- [x] Hostycare successful order shows "hostycare"
- [x] Provider field persists through retries
- [x] Provider field persists through failures

## Summary

**File Modified:** `src/services/autoProvisioningService.js`

**Changes:**
1. Added `provider: 'smartvps'` to initial update in `provisionViaSmartVps()` (line 424)
2. Added `provider: 'hostycare'` to initial update in `provisionViaHostycare()` (line 686)

**Lines Changed:** 2 lines added (one in each method)

**Impact:**
- ✅ SmartVPS orders now correctly display "smartvps" in admin panel
- ✅ Provider is set IMMEDIATELY when provisioning starts
- ✅ Provider persists even if provisioning fails
- ✅ Better tracking, debugging, and filtering capabilities

**Result: Admin dashboard now accurately reflects which provider is being used for each order, regardless of provisioning status!** 🎯

