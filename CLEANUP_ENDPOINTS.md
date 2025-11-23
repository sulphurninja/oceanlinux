# Order Cleanup Endpoints Documentation

## Overview
Two endpoints have been created to automatically clean up old and expired orders from the database.

## Endpoints

### 1. Cleanup Expired Orders Only
**Endpoint:** `/api/orders/cleanup-expired`

**Purpose:** Deletes orders that have been expired for 3 or more days.

**Criteria:**
- Orders with `expiryDate` older than 3 days from current date
- No status restrictions (will delete any expired order regardless of status)

**Methods:** `POST` or `GET`

**Response:**
```json
{
  "success": true,
  "message": "Successfully deleted X expired orders",
  "deleted": 5,
  "orders": [
    {
      "id": "order_id",
      "productName": "Product Name",
      "expiryDate": "2024-01-01T00:00:00.000Z",
      "daysExpired": 5
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "executionTime": "120ms"
}
```

### 2. Comprehensive Cleanup (Recommended)
**Endpoint:** `/api/orders/cleanup-old`

**Purpose:** Performs a comprehensive cleanup of multiple types of old orders.

**Criteria:**
1. **Expired Orders:** Orders with `expiryDate` older than 3 days
2. **Failed Orders:** Orders with status `failed` or `provisioningStatus: failed` that are 7+ days old
3. **Pending Orders:** Orders with status `pending`, `initiated`, or `processing` that are 3+ days old

**Methods:** `POST` or `GET`

**Response:**
```json
{
  "success": true,
  "message": "Successfully cleaned up 15 orders",
  "totalDeleted": 15,
  "breakdown": {
    "expired": 5,
    "failed": 7,
    "pending": 3
  },
  "details": {
    "expired": {
      "count": 5,
      "orders": [...]
    },
    "failed": {
      "count": 7,
      "orders": [...]
    },
    "pending": {
      "count": 3,
      "orders": [...]
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "executionTime": "250ms"
}
```

## Setting Up Automated Cleanup

### Option 1: Using Vercel Cron Jobs (Recommended for Vercel deployment)

Add to your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/orders/cleanup-old",
      "schedule": "0 2 * * *"
    }
  ]
}
```

This runs the comprehensive cleanup daily at 2 AM UTC.

### Option 2: Using External Cron Service (EasyCron, cron-job.org, etc.)

1. Go to your cron service provider
2. Create a new cron job with:
   - **URL:** `https://yourdomain.com/api/orders/cleanup-old`
   - **Method:** POST (or GET)
   - **Schedule:** Daily at 2 AM (or preferred time)
   - **Timezone:** UTC or your preferred timezone

Example cron expression for daily at 2 AM:
```
0 2 * * *
```

### Option 3: GitHub Actions (for GitHub-hosted projects)

Create `.github/workflows/cleanup-orders.yml`:

```yaml
name: Cleanup Old Orders

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Manual trigger option

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Call Cleanup Endpoint
        run: |
          curl -X POST https://yourdomain.com/api/orders/cleanup-old
```

## Manual Trigger

You can manually trigger cleanup by:

### Using cURL:
```bash
# Comprehensive cleanup
curl -X POST https://yourdomain.com/api/orders/cleanup-old

# Or just expired orders
curl -X POST https://yourdomain.com/api/orders/cleanup-expired
```

### Using Browser:
Simply navigate to:
- `https://yourdomain.com/api/orders/cleanup-old`
- `https://yourdomain.com/api/orders/cleanup-expired`

## Logging

Both endpoints provide detailed console logging:
- Found orders to delete
- Individual order details
- Deletion results
- Execution time
- Summary statistics

Check your server logs to monitor cleanup activity.

## Recommendations

1. **Use the comprehensive cleanup endpoint** (`/api/orders/cleanup-old`) as it handles multiple cleanup scenarios
2. **Schedule daily at off-peak hours** (e.g., 2 AM) to minimize impact
3. **Monitor logs regularly** to ensure cleanup is working as expected
4. **Test in development first** before enabling in production
5. **Keep a backup schedule** in case you need to restore accidentally deleted data

## Safety Features

- Only deletes orders matching specific criteria
- Provides detailed logging of what will be deleted
- Returns comprehensive response with deleted order details
- Graceful error handling with detailed error messages

## Troubleshooting

**No orders deleted but should be:**
- Check if orders have proper `expiryDate` field set
- Verify dates are in correct format
- Check server timezone settings

**Endpoint not executing:**
- Verify cron job is properly configured
- Check server logs for errors
- Ensure database connection is working
- Test endpoint manually first

**Too many orders deleted:**
- Review the criteria (3 days for expired, 7 days for failed)
- Consider adjusting the time thresholds in the code if needed
- Always test in development environment first



