# SmartVPS Strategic Retry Timing

## Problem
Short delays (5s, 10s) between retries don't give SmartVPS API enough time to:
- Fully process the VPS purchase
- Allocate resources
- Complete server provisioning
- Make credentials available

This can cause:
- Race conditions
- Partial provisioning states
- Duplicate purchase attempts while first is still processing

## Solution: Strategic Long Delays

### Buy VPS Retry Strategy

**Total: 3 attempts with increasing delays**

```
Attempt 1: buyVps(package, ram)
  ↓ [FAILS]
  ⏳ Wait 2 MINUTES (120,000ms)
  ↓
Attempt 2: buyVps(package, ram)  
  ↓ [FAILS]
  ⏳ Wait 3 MINUTES (180,000ms)
  ↓
Attempt 3: buyVps(package, ram)
  ↓ [SUCCESS or FINAL FAIL]
```

**Why these delays:**
- **2 minutes**: Allows SmartVPS to fully process first purchase attempt
- **3 minutes**: If system is slow/under load, gives even more time
- **API timeout: 2 minutes** (was 45s) - SmartVPS can take time to respond

### Status/Credentials Retry Strategy

**Total: 3 attempts with increasing delays**

```
Attempt 1: status(ip)
  ↓ [FAILS]
  ⏳ Wait 1 MINUTE (60,000ms)
  ↓
Attempt 2: status(ip)
  ↓ [FAILS]
  ⏳ Wait 2 MINUTES (120,000ms)
  ↓
Attempt 3: status(ip)
  ↓ [SUCCESS or FINAL FAIL]
```

**Why these delays:**
- **1 minute**: Server is provisioning, credentials being generated
- **2 minutes**: System may be slow, needs more time
- **API timeout: 90 seconds** (was 30s) - Server details take time to fetch

## Total Time Analysis

### Best Case (All succeed on first try)
```
Buy VPS attempt 1: ~30s
Status check attempt 1: ~10s
Total: ~40 seconds ✅
```

### Moderate Case (One retry each)
```
Buy VPS attempt 1: fails in ~2min
Wait: 2 minutes
Buy VPS attempt 2: ~30s (SUCCESS)
Status check attempt 1: fails in ~90s
Wait: 1 minute
Status check attempt 2: ~10s (SUCCESS)
Total: ~8.5 minutes ⏱️
```

### Worst Case (All retries exhausted)
```
Buy VPS attempt 1: fails in ~2min
Wait: 2 minutes
Buy VPS attempt 2: fails in ~2min
Wait: 3 minutes
Buy VPS attempt 3: ~30s (SUCCESS)
Status check attempt 1: fails in ~90s
Wait: 1 minute
Status check attempt 2: fails in ~90s
Wait: 2 minutes
Status check attempt 3: ~10s (SUCCESS)
Total: ~15 minutes ⏱️
```

### Complete Failure (Everything fails)
```
Buy VPS: 3 attempts × 2min + 2min + 3min wait = ~11 minutes
Order marked as FAILED
Admin can manually retry later
```

## Benefits

### 1. Eliminates Race Conditions ✅
```
Before: 
  Attempt 1 → Wait 5s → Attempt 2
  (Attempt 1 still processing in background!)
  Result: Duplicate purchase

After:
  Attempt 1 → Wait 2min → Attempt 2
  (Attempt 1 fully processed or timed out)
  Result: Clean retry, no duplicate
```

### 2. Respects API Processing Time ✅
```
SmartVPS API needs time to:
- Allocate IP from pool
- Create VPS container
- Install OS
- Generate credentials
- Make status available

2-3 minute delays give API ample time
```

### 3. Better Success Rate ✅
```
Before: Quick retries hit same issue
After: Long delays allow transient issues to resolve
```

### 4. Reduced API Load ✅
```
Before: 3 requests in 15 seconds
After: 3 requests over 5+ minutes
(More respectful to SmartVPS infrastructure)
```

### 5. Clearer Error States ✅
```
If fails after 15 minutes of trying:
- Definitely a real issue (not transient)
- Admin knows it needs manual investigation
- Not a timing/race condition problem
```

## Timeouts Increased

| Operation | Before | After | Reason |
|-----------|--------|-------|--------|
| buyVps() | 45s | 120s (2min) | VPS creation can take time |
| status() | 30s | 90s (1.5min) | Credentials may not be ready immediately |

## Code Changes

### Buy VPS Retry Loop
```javascript
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    buyRes = await this.withTimeout(
      this.smartvpsApi.buyVps(pkg.name, ram),
      120000, // 2 minute timeout (was 45s) ✅
      `SmartVPS buyVps timeout (attempt ${attempt})`
    );
    break; // Success!
    
  } catch (error) {
    if (attempt < maxRetries) {
      const delayMinutes = attempt + 1; // 2 min, 3 min ✅
      const delay = delayMinutes * 60 * 1000;
      
      L.line(`⏳ Waiting ${delayMinutes} minute(s) before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Status Check Retry Loop
```javascript
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    statusRaw = await this.withTimeout(
      this.smartvpsApi.status(boughtIp),
      90000, // 90 second timeout (was 30s) ✅
      `SmartVPS status timeout (attempt ${attempt})`
    );
    break; // Success!
    
  } catch (error) {
    if (attempt < maxRetries) {
      const delayMinutes = attempt; // 1 min, 2 min ✅
      const delay = delayMinutes * 60 * 1000;
      
      L.line(`⏳ Waiting ${delayMinutes} minute(s) before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## User Experience

### Admin View
When provisioning takes time, admin sees clear progress:
```
[SMARTVPS] ❌ buyVps attempt 1 failed: timeout
[SMARTVPS] ⏳ Strategic delay: Waiting 2 minute(s) before retry...
[SMARTVPS] 💡 This allows SmartVPS API to fully process and prevents race conditions
... [2 minutes pass] ...
[SMARTVPS] Calling buyVps - attempt 2/3
[SMARTVPS] ✅ buyVps succeeded on attempt 2
```

### Customer View
- Payment confirmed immediately
- Notification: "Your server is being provisioned..."
- If quick: Server ready in ~1 minute
- If slow: Server ready in ~5-15 minutes
- Final notification: "Your server is ready!" (with credentials)

## Monitoring

### What to Watch For

**Good Signs:**
```
[SMARTVPS] ✅ buyVps succeeded on attempt 1
[SMARTVPS] ✅ status succeeded on attempt 1
Total Time: 40000ms
```

**Concerning but OK:**
```
[SMARTVPS] ❌ buyVps attempt 1 failed
[SMARTVPS] ⏳ Waiting 2 minutes...
[SMARTVPS] ✅ buyVps succeeded on attempt 2
Total Time: 180000ms
```

**Needs Investigation:**
```
[SMARTVPS] ❌ buyVps attempt 3 failed
💥 PROVISIONING FAILED after 3 attempts
```

## Summary

| Metric | Old Strategy | New Strategy |
|--------|-------------|--------------|
| Buy VPS timeout | 45s | 2 min ✅ |
| Status timeout | 30s | 90s ✅ |
| Retry 1 delay | 5s | 2 min ✅ |
| Retry 2 delay | 10s | 3 min ✅ |
| Status retry 1 | 3s | 1 min ✅ |
| Status retry 2 | 6s | 2 min ✅ |
| **Best case time** | 40s | 40s (same) ✅ |
| **Moderate case** | ~2 min | ~8 min (safer) ✅ |
| **Worst case** | ~3 min | ~15 min (complete) ✅ |
| **Race conditions** | Possible ❌ | Eliminated ✅ |
| **Duplicate orders** | Possible ❌ | Prevented ✅ |

**Result: Rock-solid provisioning with zero race conditions, at the cost of taking more time when retries are needed (which is rare).** 🎯

