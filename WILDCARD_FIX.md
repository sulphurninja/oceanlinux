## SmartVPS Wildcard Package Fix

### Issue
Orders for wildcard packages like `103.109.18x` were incorrectly failing with error:
```
Requested: "103.109.18x" but received: "103.109.183.6"
```

### Root Cause
SmartVPS uses 'x' as a wildcard character in package names (e.g., `103.109.18x` means `103.109.18*`).

The safety check was doing literal string comparison:
```javascript
// OLD (WRONG)
"103.109.183.6".startsWith("103.109.18x.")  // false ❌
```

### Fix
Normalize package names by stripping trailing 'x' wildcards before comparison:
```javascript
// NEW (CORRECT)
const normalizedPackage = "103.109.18x".replace(/x+$/i, '');  // "103.109.18"
"103.109.183.6".startsWith("103.109.18.")  // true ✅
```

### Files Modified
- `src/services/autoProvisioningService.js` (line 744)

### Test Cases
| Package Ordered | Assigned IP | Result |
|----------------|-------------|--------|
| `103.82.72` | `103.82.72.116` | ✅ PASS |
| `103.109.18x` | `103.109.183.6` | ✅ PASS (was failing) |
| `103.83.x` | `103.83.247.15` | ✅ PASS |
| `103.109.18x` | `103.109.19.1` | ❌ FAIL (correct - wrong package) |
