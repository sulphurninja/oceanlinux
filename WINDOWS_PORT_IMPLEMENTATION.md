# Windows Hostycare Port 49965 Implementation

## Overview
This implementation automatically adds port `:49965` to all IP addresses for Windows Hostycare orders. This port is required for RDP (Remote Desktop Protocol) connections to Windows servers.

## What Orders Get the Port?

The port `:49965` is automatically added to orders that meet **ALL** of these criteria:
1. **Provider:** Hostycare (or default/no provider specified)
2. **Operating System:** Windows (any Windows OS - "Windows 2022 64", etc.)
3. **Has IP Address:** Not "Pending" or empty

## Files Modified

### 1. **Helper Library** (`src/lib/ipAddressHelper.js`)
- **Purpose:** Central utility functions for IP address formatting
- **Functions:**
  - `formatIpAddress(ipAddress, provider, os)` - Adds `:49965` to Windows Hostycare IPs
  - `extractBaseIp(ipAddress)` - Removes port from IP if present
  - `needsPort49965(order)` - Checks if an order needs the port

### 2. **Auto-Provisioning Service** (`src/services/autoProvisioningService.js`)
- **When:** During initial server provisioning via Hostycare API
- **Line ~583-589:** Formats IP address before saving to database
- **Result:** New Windows orders automatically get IP with port

### 3. **Service Sync** (`src/app/api/orders/service-action/route.js`)
- **When:** During credential sync and server state updates
- **Line ~608-621:** Formats IP when syncing from Hostycare API
- **Result:** IP addresses stay formatted during reinstalls and syncs

### 4. **Order Details Page** (`src/app/dashboard/order/[id]/page.tsx`)
- **When:** Displaying connection details to users
- **Line ~1541-1601:** Shows RDP connection info for Windows instead of SSH
- **Changes:**
  - Windows orders show "RDP Connection" instead of "SSH Connection Command"
  - Displays IP address with port for RDP use
  - Shows "Use Remote Desktop Connection (mstsc)" instruction
  - Copy button copies the IP:port directly for Windows

### 5. **Admin Fix Endpoint** (`src/app/api/admin/fix-windows-ports/route.js`)
- **Purpose:** One-time script to fix existing orders
- **GET:** Preview which orders need updating
- **POST:** Actually update the orders
- **Usage:** See "Fixing Existing Orders" below

## How It Works

### For New Orders
1. User purchases a Windows Hostycare server
2. Auto-provisioning service creates the server via Hostycare API
3. IP address is received from Hostycare
4. `formatIpAddress()` checks: Is it Hostycare? Is it Windows?
5. If yes to both, appends `:49965` to the IP
6. Saves to database as `192.168.1.100:49965`

### For Existing Orders (After Reinstall)
1. User reinstalls Windows OS on their Hostycare server
2. Service sync endpoint receives updated credentials from Hostycare
3. `formatIpAddress()` checks the order's provider and OS
4. Appends `:49965` if it's Windows Hostycare
5. Updates database with formatted IP

### For Display
1. Order details page loads
2. Checks if OS is Windows
3. If Windows:
   - Shows "RDP Connection" header
   - Displays IP:port format
   - Shows RDP-specific instructions
4. If Linux:
   - Shows "SSH Connection Command" header
   - Shows SSH command format

## Fixing Existing Orders

To update existing Windows Hostycare orders that don't have the port:

### Step 1: Preview Changes
```bash
GET /api/admin/fix-windows-ports
```

This will return:
```json
{
  "success": true,
  "total": 10,
  "needsUpdate": 7,
  "alreadyFixed": 3,
  "orders": {
    "needsUpdate": [
      {
        "orderId": "...",
        "productName": "...",
        "currentIpAddress": "192.168.1.100",
        "willBecome": "192.168.1.100:49965",
        "os": "Windows 2022 64",
        "provider": "hostycare"
      }
    ]
  }
}
```

### Step 2: Apply Updates
```bash
POST /api/admin/fix-windows-ports
```

This will:
1. Find all Windows Hostycare orders with IP addresses
2. Skip orders that already have `:49965`
3. Update orders that need the port
4. Return detailed update log

## Testing

### Test New Orders
1. Create a test Windows Hostycare order
2. Trigger auto-provisioning
3. Verify IP address has `:49965` appended
4. Check order details page shows RDP connection info

### Test Reinstall
1. Take an existing Windows Hostycare order
2. Perform a reinstall operation
3. Verify IP address gets/keeps `:49965`
4. Check sync operations maintain the port

### Test Display
1. Open order details for Windows Hostycare order
2. Verify "RDP Connection" section appears
3. Verify IP:port is displayed correctly
4. Test copy button copies full IP:port

## Important Notes

### Port is ONLY Added When:
- ✅ Provider is "hostycare" (or null/undefined - defaults to hostycare)
- ✅ OS contains "windows" (case-insensitive)
- ✅ IP address exists and is not "Pending..."

### Port is NOT Added When:
- ❌ Provider is "smartvps" or other non-hostycare providers
- ❌ OS is Linux (CentOS, Ubuntu, etc.)
- ❌ IP address is not yet assigned
- ❌ Port `:49965` is already present (prevents duplicates)

### Edge Cases Handled:
1. **Already Has Port:** Function checks if `:49965` exists before adding
2. **Pending IP:** Returns "Pending - Server being provisioned" unchanged
3. **Empty IP:** Returns empty/null unchanged
4. **Non-Hostycare:** Returns IP unchanged even if Windows
5. **Non-Windows:** Returns IP unchanged even if Hostycare

## Database Impact

### Orders That Will Change:
```javascript
{
  provider: 'hostycare' (or null),
  os: /windows/i,
  ipAddress: '192.168.1.100' // Will become '192.168.1.100:49965'
}
```

### Orders That Won't Change:
```javascript
{
  provider: 'smartvps',
  os: 'Windows 2022 64',
  ipAddress: '103.195.x.x' // Stays as-is (not hostycare)
}

{
  provider: 'hostycare',
  os: 'Ubuntu 22',
  ipAddress: '192.168.1.100' // Stays as-is (not Windows)
}

{
  provider: 'hostycare',
  os: 'Windows 2022 64',
  ipAddress: '192.168.1.100:49965' // Already has port, no duplicate
}
```

## Maintenance

### When Adding New IP Assignment Locations:
If you add code that sets `ipAddress` for orders, make sure to:
1. Import the helper: `import { formatIpAddress } from '@/lib/ipAddressHelper.js'`
2. Call it before saving: `const formattedIp = formatIpAddress(rawIp, order.provider, order.os)`
3. Save the formatted IP to the database

### Future Considerations:
- If different Windows versions need different ports, modify `formatIpAddress()`
- If other providers need custom ports, add logic to the helper function
- The helper is designed to be extensible for future requirements

## Rollback

If you need to remove the port from all orders:

```javascript
// Run in MongoDB or create a rollback endpoint
db.orders.updateMany(
  {
    provider: { $in: ['hostycare', null] },
    os: /windows/i,
    ipAddress: /:49965$/
  },
  {
    $set: {
      ipAddress: { $replaceOne: { input: "$ipAddress", find: ":49965", replacement: "" } }
    }
  }
)
```

Or create a rollback endpoint similar to the fix endpoint but removing the port instead.

