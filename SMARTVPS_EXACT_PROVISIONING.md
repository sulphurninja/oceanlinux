# SmartVPS Exact Provisioning - Implementation

## Problem Fixed

**Before:** Customers buying SmartVPS product "X" were sometimes receiving product "Y" due to fuzzy string matching on package names.

**Root Cause:** The `pickSmartVpsPackage()` function was using unreliable string matching:
```javascript
// OLD CODE (BUGGY):
const wantDigits = want.replace(/[^\d.]/g, ''); // "🏅 103.195" -> "103.195"
let selected = packages.find(p => String(p.name).includes(wantDigits)) || ...
```

This would match ANY package containing similar digits, leading to wrong product provisioning!

## Solution Implemented

### 1. Exact Package Tracking in IPStock

The `/api/smartvps/sync` endpoint now stores **exact package identifiers** in each IPStock document:

```typescript
{
  _id: "...",
  name: "Ocean Linux - 103.195.160.2",
  provider: "smartvps",
  available: true,
  defaultConfigurations: {
    smartvps: {
      provider: "smartvps",
      packagePid: "123",      // ✅ EXACT PACKAGE ID
      packageName: "103.195.160.2",  // ✅ EXACT PACKAGE NAME
      availableQty: 50,
      byMemory: { ... }
    }
  }
}
```

### 2. Exact Package Selection in Provisioning

Updated `autoProvisioningService.js` → `pickSmartVpsPackage()`:

```javascript
// NEW CODE (FIXED):
async pickSmartVpsPackage(ipStock, order) {
  // Get EXACT package ID and name from IPStock configuration
  const smartvpsConfig = ipStock.defaultConfigurations.smartvps;
  const storedPid = String(smartvpsConfig.packagePid);
  const storedName = String(smartvpsConfig.packageName);

  // Fetch current packages from API
  const packages = await this.smartvpsApi.ipstock();

  // Find EXACT match by ID AND name
  const exactMatch = packages.find(p => 
    String(p.id) === storedPid && String(p.name) === storedName
  );

  // Verify package is still available
  if (!exactMatch) {
    throw new Error(`Package no longer available in API`);
  }
  if (exactMatch.status !== 'active') {
    throw new Error(`Package not active`);
  }
  if (exactMatch.ipv4 <= 0) {
    throw new Error(`Package has no available IPs`);
  }

  return { id: exactMatch.id, name: exactMatch.name };
}
```

### 3. Automatic Sync with Availability Tracking

The sync endpoint (`/api/smartvps/sync`) now:

✅ **Auto-creates IPStock** when new packages are fetched from SmartVPS API
✅ **Marks as unavailable** if package disappears from API response
✅ **Marks as available** when package comes back
✅ **Updates quantity** in real-time based on API data
✅ **Tracks re-enabled packages** with detailed logging

## How It Works (Full Flow)

### Step 1: Customer Browses Products
```
1. Customer visits /dashboard/ipStock
2. Frontend displays IPStock items (filtered by available: true)
3. Each item shows: name, memory options, pricing
```

### Step 2: Customer Places Order
```
1. Customer selects "Ocean Linux - 103.195.160.2" with 8GB RAM
2. Order created with:
   - ipStockId: "67abc123..." (reference to IPStock document)
   - productName: "Ocean Linux - 103.195.160.2"
   - memory: "8GB"
   - status: "pending"
```

### Step 3: Auto-Provisioning Starts
```
1. Auto-provisioning service picks up the order
2. Loads IPStock document using order.ipStockId
3. Extracts SmartVPS configuration:
   - packagePid: "123"
   - packageName: "103.195.160.2"
```

### Step 4: Exact Package Selection
```
1. Calls SmartVPS API: /api/oceansmart/ipstock
2. Receives all available packages
3. Searches for EXACT match:
   - WHERE package.id === "123"
   - AND package.name === "103.195.160.2"
4. Verifies:
   - ✅ Package exists
   - ✅ Status is "active"
   - ✅ IPv4 count > 0
```

### Step 5: VPS Purchase
```
1. Calls SmartVPS API: /api/oceansmart/buyvps
   - ip: "103.195.160.2" (the exact package name)
   - ram: "8"
2. Receives assigned IP and credentials
3. Updates order with server details
```

## Sync Endpoint Details

### Endpoint
`POST /api/smartvps/sync`

### What It Does
1. Fetches all packages from SmartVPS API
2. De-duplicates packages by `id::name` key
3. For each package in API:
   - If IPStock exists → Update availability, quantity, config
   - If IPStock missing → Create new IPStock with default pricing
4. For each existing IPStock NOT in API:
   - Mark as unavailable (available: false)
   - Set quantity to 0
   - Add lastSeen timestamp
5. Returns detailed summary with counts

### Response Format
```json
{
  "success": true,
  "summary": {
    "created": 2,          // New IPStock items created
    "updated": 15,         // Existing items updated
    "disabled": 3,         // Items marked unavailable
    "reEnabled": 1,        // Previously disabled items made available again
    "tookMs": 1234,
    "totalPackagesInAPI": 18,
    "totalIPStockEntries": 20
  },
  "results": [
    {
      "action": "updated",
      "id": "67abc...",
      "pid": "123",
      "name": "103.195.160.2",
      "qty": 50,
      "available": true,
      "status": "active"
    },
    {
      "action": "disabled",
      "id": "67def...",
      "pid": "456",
      "name": "103.195.160.5",
      "reason": "missing_from_api",
      "available": false
    },
    {
      "action": "re-enabled",
      "id": "67ghi...",
      "pid": "789",
      "name": "103.195.160.8",
      "wasAvailable": false,
      "nowAvailable": true
    }
  ]
}
```

## AWS Lambda Setup

### 1. Lambda Function (Node.js 18+)
```javascript
export const handler = async (event) => {
  const API_ENDPOINT = process.env.APP_URL + '/api/smartvps/sync';
  const SYNC_TOKEN = process.env.SVPS_SYNC_TOKEN; // Optional security token

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AWS-Lambda-SmartVPS-Sync/1.0',
        'x-sync-token': SYNC_TOKEN // If you want security
      }
    });

    const data = await response.json();
    
    console.log('Sync completed:', data.summary);
    
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Sync failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

### 2. EventBridge Rule (Cron)
Schedule: `rate(2 minutes)`

Or using cron expression: `cron(*/2 * * * ? *)`

### 3. Environment Variables
```
APP_URL=https://yourdomain.com
SVPS_SYNC_TOKEN=your-secret-token-here  # Optional
```

### 4. IAM Permissions
Lambda needs:
- `logs:CreateLogGroup`
- `logs:CreateLogStream`
- `logs:PutLogEvents`

No other AWS permissions needed (it just calls your HTTP endpoint).

## Testing

### 1. Manual Sync
```bash
curl -X POST https://yourdomain.com/api/smartvps/sync \
  -H "Content-Type: application/json" \
  -H "User-Agent: Manual-Test"
```

### 2. Check Logs
Look for:
```
[SVPS-SYNC] packages fetched: 20, deduped: 18
[SVPS-SYNC] existing SmartVPS IPStock entries: 20
[SVPS-SYNC] Package re-enabled (was disabled, now available): 123::103.195.160.2
[SVPS-SYNC] Package missing from API, marking unavailable: 456::103.195.160.5
[SVPS-SYNC] ✅ done { created: 0, updated: 18, disabled: 2, reEnabled: 1, tookMs: 1234 }
```

### 3. Verify Provisioning
1. Place a test order for a SmartVPS product
2. Check auto-provisioning logs:
```
[SMARTVPS] Using EXACT package from IPStock config:
[SMARTVPS]   → Package ID (PID) 123
[SMARTVPS]   → Package Name 103.195.160.2
[SMARTVPS] ✅ Exact package verified and available:
[SMARTVPS]   → ID 123
[SMARTVPS]   → Name 103.195.160.2
[SMARTVPS]   → Status active
[SMARTVPS]   → Available IPv4 50
```

## Failure Scenarios (Now Handled)

### Scenario 1: Package Disappears Between Order and Provisioning
**Before:** Would provision wrong package (fuzzy match)
**After:** Throws clear error:
```
Package (PID: 123, Name: 103.195.160.2) no longer available in SmartVPS API.
Customer ordered product that is now unavailable.
```

### Scenario 2: Package Out of Stock
**Before:** Would try to provision anyway, or pick wrong package
**After:** Throws clear error:
```
Package "103.195.160.2" (PID: 123) has no available IPs. IPv4 count: 0
```

### Scenario 3: Package Inactive
**Before:** Would try anyway
**After:** Throws clear error:
```
Package "103.195.160.2" (PID: 123) is not active. Status: suspended
```

## Files Modified

1. **`src/app/api/smartvps/sync/route.ts`**
   - Added default configuration values
   - Added re-enabled tracking
   - Enhanced logging and response format

2. **`src/services/autoProvisioningService.js`**
   - Completely rewrote `pickSmartVpsPackage()` function
   - Uses exact PID + name matching
   - Added comprehensive validation and error messages

3. **`vercel.json`**
   - Removed SmartVPS sync cron (moved to AWS Lambda)
   - Added comment about Lambda setup

## Benefits

✅ **100% Accuracy** - Customers get EXACTLY what they ordered
✅ **Real-time Availability** - IPStock syncs every 2 minutes
✅ **Clear Error Messages** - No silent failures or wrong products
✅ **Audit Trail** - Complete logging of package selection
✅ **Automatic Recovery** - Packages automatically re-enabled when available
✅ **No Manual Work** - Fully automated sync and provisioning

## Monitoring

### Key Metrics to Track
1. **Sync Success Rate** - Should be ~100%
2. **Re-enabled Count** - Indicates API instability if high
3. **Disabled Count** - Packages becoming unavailable
4. **Provisioning Failures** - "Package no longer available" errors

### Alerts to Set Up
- Sync fails for >5 minutes
- >50% of packages become unavailable
- Provisioning error rate >10%

---

**Status:** ✅ Deployed and ready for production
**Last Updated:** 2025-01-19

