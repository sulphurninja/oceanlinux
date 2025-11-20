# SmartVPS Race Condition - Complete Fix

## 🚨 Problem: Race Condition Leading to Wrong Product Provisioning

### The Issue
When multiple customers order from the same SmartVPS package simultaneously, there's a race condition:

```
10:00:00.000 - Order 1 checks "103.181.91" → 2 IPs available ✅
10:00:00.050 - Order 2 checks "103.181.91" → 2 IPs available ✅ (STALE!)
10:00:00.100 - Order 1 calls buyVps("103.181.91") → Gets 103.181.91.50 ✅
10:00:00.150 - Order 2 calls buyVps("103.181.91") → Package exhausted!
                SmartVPS assigns 103.182.44.18 instead ❌
```

**Result:** Customer 2 gets the WRONG product.

---

## ✅ Solution: Three-Layer Protection

### Layer 1: Package Locking (NEW! 🔒)

**Purpose:** Prevent multiple orders from provisioning the same package simultaneously

**Implementation:**
```javascript
// In-memory lock map
const provisioningLocks = new Map(); // { packageName: { orderId, acquiredAt } }

// Before provisioning:
await acquirePackageLock("103.181.91", orderId);

// After provisioning (always, even on error):
releasePackageLock("103.181.91", orderId);
```

**How It Works:**
1. Order 1 tries to provision "103.181.91" → Acquires lock ✅
2. Order 2 tries to provision "103.181.91" → Lock already held, WAITS ⏳
3. Order 1 completes → Releases lock 🔓
4. Order 2 acquires lock → Checks availability → If exhausted, FAILS ❌

**Key Features:**
- **Timeout:** If lock not acquired in 30 seconds, order fails with clear error
- **Stale Detection:** Locks older than 2 minutes are auto-released (handles crashes)
- **Order-Specific:** Each lock is tied to a specific order ID
- **Always Released:** `try-finally` ensures lock release even on errors

---

### Layer 2: Response Verification (EXISTING ✅)

**Purpose:** Catch cases where SmartVPS API assigns wrong package despite lock

**Implementation:**
```javascript
// After buyVps() call:
const boughtIp = extractIp(response); // e.g., "103.182.44.18"
const requestedPackage = "103.181.91";

if (!boughtIp.startsWith(requestedPackage)) {
  // Wrong package detected!
  await Order.updateOne({ 
    _id: orderId, 
    status: 'failed',
    provisioningError: 'Wrong package assigned by SmartVPS API'
  });
  throw new Error('PROVISIONING BLOCKED: Wrong package assigned');
}
```

**What It Catches:**
- SmartVPS API bugs (assigns wrong package silently)
- Network issues causing garbled responses
- Unexpected fallback behavior from SmartVPS

---

### Layer 3: Low IP Warning (EXISTING ⚠️)

**Purpose:** Alert admins when packages are running low on IPs

**Implementation:**
```javascript
if (package.ipv4 <= 5) {
  console.warn('⚠️ Package running low on IPs! Risk of exhaustion.');
}
```

**What It Does:**
- Logs warning for packages with ≤5 IPs
- Helps admin proactively add more IPs or disable package
- Prevents last-minute race conditions

---

## 🔄 Complete Flow (After Fix)

### Scenario 1: Sequential Orders (Normal Case)

```
Order 1:
1. Acquire lock for "103.181.91" → SUCCESS 🔒
2. Check availability → 10 IPs available ✅
3. Call buyVps("103.181.91") → Get 103.181.91.50 ✅
4. Verify: "103.181.91.50".startsWith("103.181.91") ✅
5. Release lock 🔓
6. Order completed ✅

Order 2:
1. Acquire lock for "103.181.91" → SUCCESS 🔒 (Order 1 already released)
2. Check availability → 9 IPs available ✅
3. Call buyVps("103.181.91") → Get 103.181.91.51 ✅
4. Verify: "103.181.91.51".startsWith("103.181.91") ✅
5. Release lock 🔓
6. Order completed ✅
```

**Result:** Both orders get correct product ✅

---

### Scenario 2: Concurrent Orders (Race Condition)

```
Order 1 (10:00:00.000):
1. Acquire lock for "103.181.91" → SUCCESS 🔒
2. Check availability → 1 IP available ✅
3. Call buyVps("103.181.91") → Get 103.181.91.99 ✅
4. Verify: "103.181.91.99".startsWith("103.181.91") ✅
5. Release lock 🔓
6. Order completed ✅

Order 2 (10:00:00.050 - 50ms later):
1. Try to acquire lock for "103.181.91" → LOCKED by Order 1 ⏳
2. WAIT 1 second...
3. WAIT 1 second...
4. Order 1 releases lock 🔓
5. Acquire lock for "103.181.91" → SUCCESS 🔒
6. Check availability → 0 IPs available ❌
7. FAIL: "Package has no available IPs"
8. Release lock 🔓
9. Order marked as FAILED ❌
```

**Result:**  
- Order 1: ✅ Gets correct product  
- Order 2: ❌ **FAILS** (correct behavior - no wrong product assigned!)

---

### Scenario 3: SmartVPS API Bug (Wrong Package Assigned)

```
Order 1:
1. Acquire lock for "103.181.91" → SUCCESS 🔒
2. Check availability → 1 IP available ✅
3. Call buyVps("103.181.91") → SmartVPS has a bug, returns "103.182.44.18" ❌
4. Verify: "103.182.44.18".startsWith("103.181.91") ❌
5. DETECTED MISMATCH!
6. Mark order as FAILED immediately
7. Release lock 🔓
8. Throw error: "PROVISIONING BLOCKED: Wrong package assigned"

Result: Order marked as FAILED (customer does NOT receive wrong product)
```

**Result:** Order fails instead of getting wrong product ✅

---

## 🛡️ Protection Summary

| Protection Layer | Prevents | When It Triggers | Result |
|------------------|----------|------------------|--------|
| **Package Lock** | Race condition | Multiple orders at same time | Second order waits or fails |
| **Response Verification** | Wrong IP assignment | SmartVPS API bug/fallback | Order fails with error |
| **Low IP Warning** | Last-minute exhaustion | Package ≤5 IPs | Admin alerted |

---

## 📊 Code Changes

### File: `src/services/autoProvisioningService.js`

#### 1. Added Lock Mechanism (Lines 12-75)
```javascript
// Global lock map
const provisioningLocks = new Map();

class AutoProvisioningService {
  // Acquire lock (waits up to 30 seconds)
  async acquirePackageLock(packageName, orderId, maxWaitMs = 30000) {
    // Implementation...
  }

  // Release lock
  releasePackageLock(packageName, orderId) {
    // Implementation...
  }
}
```

#### 2. Lock Usage in Provisioning (Lines 390-410)
```javascript
// Acquire lock before provisioning
let lockAcquired = false;
try {
  await this.acquirePackageLock(pkg.name, order._id.toString());
  lockAcquired = true;
} catch (lockError) {
  throw new Error(`Cannot provision: ${lockError.message}`);
}

try {
  // ... provisioning logic ...
} finally {
  // ALWAYS release lock
  if (lockAcquired) {
    this.releasePackageLock(pkg.name, order._id.toString());
  }
}
```

#### 3. Response Verification (Lines 425-450)
```javascript
// Verify IP matches requested package
if (!boughtIp.startsWith(requestedPackage)) {
  await Order.findByIdAndUpdate(order._id, {
    provisioningStatus: 'failed',
    status: 'failed',
    provisioningError: 'WRONG PACKAGE ASSIGNED'
  });
  throw new Error('PROVISIONING BLOCKED: Wrong package assigned');
}
```

### File: `src/app/api/orders/cleanup-old/route.js`

#### Changed: Failed Orders are NEVER Deleted
```javascript
// OLD: Deleted failed orders after 7 days
// NEW: Failed orders are PRESERVED for debugging

// Line 61-70: Skip failed orders, just count them
const failedOrdersCount = await Order.countDocuments({
  $or: [{ status: 'failed' }, { provisioningStatus: 'failed' }]
});
console.log(`Found ${failedOrdersCount} failed orders (PRESERVED - never deleted)`);
```

---

## 🧪 Testing Scenarios

### Test 1: Single Order (Normal Case)
```bash
# Place 1 order for "103.181.91"
# Expected: SUCCESS, receives 103.181.91.x
```

### Test 2: 5 Simultaneous Orders (Race Condition)
```bash
# Place 5 orders for "103.181.91" at the same time
# Package has 5 IPs available

# Expected:
# - All 5 orders process SEQUENTIALLY (lock prevents parallel)
# - Order 1-5: SUCCESS (each gets 103.181.91.x)
# - Total time: ~5-10 minutes (sequential processing)
```

### Test 3: 10 Orders, Package Has 5 IPs (Exhaustion)
```bash
# Place 10 orders for "103.181.91" at the same time
# Package has 5 IPs available

# Expected:
# - Orders 1-5: SUCCESS (get 103.181.91.x)
# - Orders 6-10: FAILED with "Package has no available IPs"
# - NO orders receive wrong package
```

### Test 4: SmartVPS API Bug (Simulated)
```bash
# Manually modify SmartVPS API to return wrong IP
# Place order for "103.181.91"
# API returns "103.182.44.18"

# Expected:
# - Response verification detects mismatch
# - Order marked as FAILED
# - Error: "PROVISIONING BLOCKED: Wrong package assigned"
```

---

## 🚀 Deployment Checklist

- [x] Add package locking mechanism
- [x] Integrate lock in SmartVPS provisioning
- [x] Add response verification
- [x] Update order cleanup to preserve failed orders
- [x] Add low IP warnings
- [ ] Deploy to production
- [ ] Monitor lock performance
- [ ] Test with 10 simultaneous orders
- [ ] Verify failed orders are preserved

---

## 📈 Expected Behavior After Fix

| Situation | Old Behavior | New Behavior |
|-----------|--------------|--------------|
| **Single order** | ✅ Provisions correctly | ✅ Provisions correctly (faster) |
| **5 orders, 10 IPs** | ⚠️ Possible race condition | ✅ All succeed (sequential) |
| **10 orders, 5 IPs** | ❌ Last 5 get wrong product | ✅ First 5 succeed, last 5 FAIL |
| **SmartVPS API bug** | ❌ Wrong product provisioned | ✅ Order FAILS (not provisioned) |
| **Failed orders** | 🗑️ Deleted after 7 days | 🔒 PRESERVED forever |

---

## 🎯 Key Takeaways

1. **Lock Prevents Race Conditions** 🔒  
   Only ONE order can provision from a package at a time

2. **Verification Catches API Bugs** ✅  
   Wrong IPs are detected and orders are failed

3. **Failed Orders are Preserved** 📋  
   Kept for debugging and audit purposes

4. **No More Wrong Products** 🎉  
   Customers will NEVER receive the wrong product

5. **Clear Error Messages** 💬  
   Failed orders have detailed error messages for troubleshooting

---

## 🔍 Monitoring & Maintenance

### Check Lock Performance
```bash
# Monitor logs for lock wait times
grep "LOCK.*waiting" /var/log/app.log

# Expected: < 5 seconds wait time
# Alert if: > 30 seconds (indicates issue)
```

### Check Failed Orders
```bash
# Count failed orders by reason
db.orders.aggregate([
  { $match: { status: 'failed' } },
  { $group: { _id: '$provisioningError', count: { $sum: 1 } } }
])

# Expected: 
# - "Package has no available IPs" → Add more IPs
# - "WRONG PACKAGE ASSIGNED" → SmartVPS API issue, contact them
```

### Cleanup Stale Locks (Manual)
```javascript
// If you suspect stale locks, restart the app
// Or manually clear them:
// (locks are in-memory, so app restart clears all)
```

---

## ✅ Status

**Implementation:** ✅ Complete  
**Testing:** ⚠️ Needs production testing  
**Deployment:** 🚀 Ready to deploy  
**Issue Fixed:** ❌ → ✅ Customers will NOT receive wrong products

---

**Next Steps:**
1. Deploy to production
2. Place 10 test orders simultaneously
3. Verify lock mechanism works
4. Monitor for 24 hours
5. Confirm no wrong-product issues

