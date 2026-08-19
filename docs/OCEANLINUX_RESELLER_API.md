# OceanLinux Reseller API — Partner Documentation

**Version:** 1.0  
**Last updated:** June 2025  
**Support:** support@oceanlinux.com

---

## Overview

OceanLinux Reseller API lets you integrate VPS hosting into your own website or billing panel. You can:

- List products with **your custom prices**
- **Buy** servers (wallet billing)
- Check **online/offline** status
- **Start / Stop / Restart** servers
- **Reinstall** OS
- **Sync** IP, username, password, validity
- **Renew** services

All actions run on OceanLinux infrastructure — what you see in the API matches the live server state.

---

## Base URL

```
https://oceanlinux.com/api/v1/reseller
```

For local/staging, replace with your domain.

---

## Authentication

Every request must include these headers:

| Header | Description |
|--------|-------------|
| `x-api-key` | Your API Key (`rz_...`) |
| `x-api-secret` | Your API Secret (`sec_...`) |

**Important:** Never put the API Secret in frontend JavaScript. Always call the API from your **backend server**.

Alternative header names (also supported):
- `x-reseller-api-key`
- `x-reseller-api-secret`

---

## Quick Start Flow

```
1. GET  /products              → Show stock + your prices on your website
2. POST /orders                → Customer buys → wallet deducts → server provisions
3. GET  /orders/{orderId}      → Get IP + password (poll every 15 sec until ready)
4. GET  /orders/{orderId}/status → Show online/offline on your panel
5. POST /orders/manage         → Start / stop / restart / reinstall
6. POST /orders/{orderId}/sync → Refresh IP, password, validity after reinstall
7. POST /orders/{orderId}/renew → Extend service before expiry
```

---

## Endpoints

### 1. API Index

```
GET /
```

Returns list of all available endpoints.

---

### 2. Account Overview

```
GET /account
```

**Response example:**

```json
{
  "success": true,
  "account": {
    "id": "69d650d79df324d8a4fc223c",
    "businessName": "Your Company",
    "email": "you@company.com",
    "status": "active"
  },
  "wallet": {
    "balance": 9401,
    "currency": "INR",
    "creditLimit": 0
  },
  "overview": {
    "totalRecharged": 10000,
    "totalSpent": 599,
    "totalOrders": 1,
    "currentBalance": 9401
  }
}
```

| Field | Meaning |
|-------|---------|
| `totalRecharged` | Total funds added by admin |
| `totalSpent` | Total spent on orders + renewals |
| `totalOrders` | Number of orders placed |
| `currentBalance` | Available wallet balance |

---

### 3. Wallet & Transactions

```
GET /wallet
```

**Response example:**

```json
{
  "success": true,
  "balance": 9401,
  "currency": "INR",
  "creditLimit": 0,
  "overview": {
    "totalRecharged": 10000,
    "totalSpent": 599,
    "totalOrders": 1
  },
  "transactions": [
    {
      "type": "recharge",
      "amount": 10000,
      "description": "Manual recharge by admin",
      "createdAt": "2025-06-01T10:00:00.000Z"
    },
    {
      "type": "deduction",
      "amount": -599,
      "description": "Reseller API order 65b... — LKO DC Premium (4GB) @ ₹599",
      "createdAt": "2025-06-01T11:00:00.000Z"
    }
  ]
}
```

---

### 4. Products (Stock List)

```
GET /products
```

Returns all available products with **your custom/reseller prices**.

Single product:
```
GET /products?id=PRODUCT_ID
```

**Response example:**

```json
{
  "success": true,
  "count": 5,
  "currency": "INR",
  "products": [
    {
      "_id": "65a1b2c3d4e5f6...",
      "name": "LKO DC – 103.179.xx Premium Rotating Linux",
      "available": true,
      "memoryOptions": {
        "4GB": {
          "price": 599,
          "basePrice": 699
        }
      }
    }
  ]
}
```

- `price` = **your rate** (what you pay / what to show customers)
- `basePrice` = OceanLinux base rate (reference only)

---

### 5. Buy Server

```
POST /orders
Content-Type: application/json
```

**Request body:**

```json
{
  "productId": "65a1b2c3d4e5f6...",
  "memoryOption": "4GB",
  "userEmail": "customer@yourdomain.com",
  "os": "Ubuntu 22"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `productId` | Yes | From `GET /products` |
| `memoryOption` | Yes | e.g. `4GB`, `8GB` |
| `userEmail` | No | Your customer's email (for tracking) |
| `os` | No | `Ubuntu 22`, `CentOS 7`, `Windows 2022 64` (default: Ubuntu 22) |

**Response (201):**

```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "id": "65b123...",
    "productName": "LKO DC Premium - 4GB",
    "price": 599,
    "status": "confirmed",
    "provisioningStatus": "pending",
    "ipAddress": null
  },
  "walletBalance": 8802,
  "creditLimit": 0
}
```

**Note:** After purchase, poll `GET /orders/{orderId}` every 15 seconds until `ipAddress` and `password` appear (usually 2–5 minutes).

---

### 6. List Orders

```
GET /orders
GET /orders?limit=50
```

**Response:**

```json
{
  "success": true,
  "count": 2,
  "orders": [
    {
      "id": "65b123...",
      "productName": "LKO DC Premium - 4GB",
      "memory": "4GB",
      "price": 599,
      "status": "confirmed",
      "ipAddress": "103.179.xx.xx",
      "username": "root",
      "password": "YourPassword123",
      "os": "Ubuntu 22",
      "expiryDate": "2025-07-20T00:00:00.000Z",
      "customerEmail": "customer@yourdomain.com"
    }
  ]
}
```

---

### 7. Order Detail + Capabilities

```
GET /orders/{orderId}
```

**Response:**

```json
{
  "success": true,
  "order": {
    "id": "65b123...",
    "productName": "LKO DC Premium - 4GB",
    "price": 599,
    "ipAddress": "103.179.xx.xx",
    "username": "root",
    "password": "YourPassword123",
    "expiryDate": "2025-07-20T00:00:00.000Z"
  },
  "management": {
    "available": true,
    "supportedActions": ["start", "stop", "restart", "status", "sync", "reinstall"],
    "reinstallRequiresOs": true,
    "osOptions": ["Windows Server 2022", "Windows Server 2025", "Ubuntu 22.04"],
    "osTemplates": [
      { "id": "12", "name": "Windows Server 2022" },
      { "id": "18", "name": "Windows Server 2025" },
      { "id": "4", "name": "Ubuntu 22.04" }
    ]
  }
}
```

Check `management.supportedActions` before showing buttons on your panel.

---

### 8. Server Status (Online / Offline)

```
GET /orders/{orderId}/status
```

**Response:**

```json
{
  "success": true,
  "orderId": "65b123...",
  "online": true,
  "powerState": "running",
  "ipAddress": "103.179.xx.xx"
}
```

| `powerState` | Meaning |
|--------------|---------|
| `running` | Server is ON / online |
| `stopped` | Server is OFF / offline |
| `unknown` | Status not available yet |

This reflects the **live state on OceanLinux** — same as the admin panel.

---

### 9. Sync (IP, Password, Validity)

```
POST /orders/{orderId}/sync
```

Use after **reinstall** or whenever you need the latest credentials from OceanLinux.

**Response:**

```json
{
  "success": true,
  "orderId": "65b123...",
  "ipAddress": "103.179.xx.xx",
  "username": "root",
  "password": "NewPassword456!",
  "os": "Ubuntu 22",
  "validity": {
    "expiryDate": "2025-08-20T00:00:00.000Z",
    "daysRemaining": 28,
    "status": "active"
  },
  "expiryDate": "2025-08-20T00:00:00.000Z",
  "daysRemaining": 28,
  "online": true,
  "powerState": "running",
  "changed": ["password"],
  "credentialsUpdated": true
}
```

---

### 10. Manage Server

```
POST /orders/manage
Content-Type: application/json
```

**Request body:**

```json
{
  "orderId": "65b123...",
  "action": "start"
}
```

| Action | Description | `osType` required? |
|--------|-------------|-------------------|
| `start` | Power on | No |
| `stop` | Power off | No |
| `restart` | Reboot | No |
| `status` | Get power state | No |
| `sync` | Sync credentials | No |
| `reinstall` | Format / rebuild OS | Yes (for some products) — use `osTemplates` from GET order |
| `templates` | List OS templates (same as OceanLinux reinstall dropdown) | No |
| `changeos` | Change OS | Yes (SmartVPS products) |

**Aliases:** `format` → `reinstall`, `reboot` → `restart`

**Start example:**

```json
{ "orderId": "65b123...", "action": "start" }
```

**Reinstall example:**

```json
{ "orderId": "65b123...", "action": "templates" }
```

```json
{ "orderId": "65b123...", "action": "reinstall", "osType": "Windows Server 2022" }
```

`osType` can be the template **id** or **name** from `management.osTemplates` (same OS list as OceanLinux panel reinstall — e.g. 2022, 2025, Ubuntu). Generic `ubuntu` / `windows` still map to a matching template.

After reinstall, wait 3–5 minutes then call `POST /orders/{orderId}/sync` for the new password.

**Status response:**

```json
{
  "success": true,
  "action": "status",
  "message": "Status retrieved",
  "data": { "powerState": "running" }
}
```

---

### 11. Renew Service

**Check price & eligibility:**

```
GET /orders/{orderId}/renew
```

```json
{
  "success": true,
  "renewalPrice": 599,
  "expiryDate": "2025-07-20T00:00:00.000Z",
  "daysUntilExpiry": 2
}
```

**Renew (wallet deduct):**

```
POST /orders/{orderId}/renew
```

```json
{
  "success": true,
  "message": "Service renewed successfully",
  "amount": 599,
  "previousExpiry": "2025-07-20T00:00:00.000Z",
  "newExpiryDate": "2025-08-20T00:00:00.000Z",
  "walletBalance": 8203
}
```

Renewal opens within **2 days** of expiry.

---

## Error Codes

| HTTP | Meaning |
|------|---------|
| `200` | Success |
| `201` | Order created |
| `400` | Invalid request |
| `401` | Wrong/missing API key or secret |
| `402` | Insufficient wallet balance |
| `403` | Account suspended |
| `404` | Order or product not found |
| `409` | Out of stock |
| `500` | Server error |

**Error response example:**

```json
{
  "success": false,
  "message": "Insufficient wallet balance",
  "code": "ACTION_NOT_SUPPORTED",
  "supportedActions": ["start", "stop", "restart", "status", "sync"]
}
```

---

## Code Examples

### cURL — Buy Server

```bash
curl -X POST "https://oceanlinux.com/api/v1/reseller/orders" \
  -H "x-api-key: rz_YOUR_KEY" \
  -H "x-api-secret: sec_YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "YOUR_PRODUCT_ID",
    "memoryOption": "4GB",
    "userEmail": "client@example.com",
    "os": "Ubuntu 22"
  }'
```

### cURL — Check Status

```bash
curl "https://oceanlinux.com/api/v1/reseller/orders/ORDER_ID/status" \
  -H "x-api-key: rz_YOUR_KEY" \
  -H "x-api-secret: sec_YOUR_SECRET"
```

### cURL — Sync Credentials

```bash
curl -X POST "https://oceanlinux.com/api/v1/reseller/orders/ORDER_ID/sync" \
  -H "x-api-key: rz_YOUR_KEY" \
  -H "x-api-secret: sec_YOUR_SECRET"
```

### Node.js — Full Buy Flow

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'https://oceanlinux.com/api/v1/reseller',
  headers: {
    'x-api-key': process.env.OCEAN_API_KEY,
    'x-api-secret': process.env.OCEAN_API_SECRET,
  },
});

async function buyAndDeliver(customerEmail) {
  // 1. Get products
  const { data: catalog } = await client.get('/products');
  const product = catalog.products[0];
  const plan = '4GB';

  // 2. Purchase
  const { data: purchase } = await client.post('/orders', {
    productId: product._id,
    memoryOption: plan,
    userEmail: customerEmail,
    os: 'Ubuntu 22',
  });

  const orderId = purchase.order.id;

  // 3. Wait for provisioning (poll)
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const { data } = await client.get(`/orders/${orderId}`);
    if (data.order.ipAddress && data.order.password) {
      return data.order;
    }
  }

  throw new Error('Provisioning taking longer than expected');
}
```

### PHP — Stop Server

```php
<?php
$ch = curl_init('https://oceanlinux.com/api/v1/reseller/orders/manage');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'x-api-key: ' . getenv('OCEAN_API_KEY'),
    'x-api-secret: ' . getenv('OCEAN_API_SECRET'),
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => json_encode([
    'orderId' => 'ORDER_ID',
    'action' => 'stop',
  ]),
]);
echo curl_exec($ch);
```

---

## Wallet & Billing

- All purchases and renewals deduct from your **Reseller Wallet**
- Contact OceanLinux admin to **add funds**
- Your custom prices (set by admin) apply automatically on buy and renew
- Track spending via `GET /account` or `GET /wallet`

---

## Security Checklist

- [ ] Store API Key + Secret in environment variables (`.env`)
- [ ] Call API only from your **backend** (Node, PHP, Python, etc.)
- [ ] Never expose `sec_...` secret in browser / mobile app
- [ ] Use HTTPS only

---

## Dashboard (Optional)

You can also log in to OceanLinux dashboard:

- **Wallet:** `/dashboard/reseller-wallet`
- **Live API Docs:** `/dashboard/reseller-api-docs`

---

## Support

For wallet recharge, API secret reset, or technical issues:

**Email:** support@oceanlinux.com

---

*© OceanLinux — Reseller Partner API v1.0*
