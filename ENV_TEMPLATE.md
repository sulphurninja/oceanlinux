# Environment Variables Template

Copy these variables to your `.env` file and fill in your actual values.

```env
# ============================================
# CASHFREE PAYMENT GATEWAY (REQUIRED)
# ============================================
# Get these from: https://merchant.cashfree.com/merchants/login
# Navigate to: Developers → API Keys → Generate API Keys

CASHFREE_APP_ID=your_cashfree_app_id_here
CASHFREE_SECRET_KEY=your_cashfree_secret_key_here
CASHFREE_ENVIRONMENT=PRODUCTION
# Options: PRODUCTION or SANDBOX

# Frontend Cashfree Configuration
NEXT_PUBLIC_CASHFREE_ENVIRONMENT=production
# Options: production or sandbox

# ============================================
# APPLICATION CONFIGURATION
# ============================================
NEXT_PUBLIC_BASE_URL=https://oceanlinux.com
# Your application's base URL (used for return URLs and webhooks)

# ============================================
# DATABASE
# ============================================
MONGODB_URI=mongodb://localhost:27017/oceanlinux
# Your MongoDB connection string

# ============================================
# JWT & AUTHENTICATION
# ============================================
JWT_SECRET=your_jwt_secret_here
# Generate a strong random string for JWT token signing

# ============================================
# EMAIL SERVICE (SendGrid)
# ============================================
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@oceanlinux.com

# ============================================
# VIRTUALIZOR API
# ============================================
VIRTUALIZOR_API_KEY=your_virtualizor_api_key
VIRTUALIZOR_API_PASSWORD=your_virtualizor_api_password
VIRTUALIZOR_API_URL=https://your-virtualizor-server.com:4085/index.php

# ============================================
# HOSTYCARE API
# ============================================
HOSTYCARE_API_URL=https://api.hostycare.com
HOSTYCARE_API_KEY=your_hostycare_api_key

# ============================================
# SMARTVPS API
# ============================================
SMARTVPS_API_URL=https://api.smartvps.com
SMARTVPS_API_KEY=your_smartvps_api_key

# ============================================
# OPENAI (for AI features)
# ============================================
OPENAI_API_KEY=your_openai_api_key
# Optional: Only needed if using AI chat features
```

## Important Notes

1. **Never commit** the actual `.env` file to version control
2. Keep your API keys **secure** and rotate them regularly
3. Use **SANDBOX** environment for testing before going live
4. Ensure `NEXT_PUBLIC_BASE_URL` matches your deployment URL
5. Configure Cashfree webhooks to point to: `{NEXT_PUBLIC_BASE_URL}/api/payment/webhook`

## Getting Cashfree Credentials

1. Sign up or log in to [Cashfree Merchant Dashboard](https://merchant.cashfree.com/)
2. Navigate to **Developers** → **API Keys**
3. Click **Generate API Keys**
4. Copy your **App ID** (Client ID) and **Secret Key**
5. For testing, use **SANDBOX** environment with test credentials
6. For production, use **PRODUCTION** environment with live credentials

## Webhook Configuration

After setting up your environment:

1. Go to Cashfree Dashboard → **Developers** → **Webhooks**
2. Add webhook URL: `https://yourdomain.com/api/payment/webhook`
3. Select events:
   - Payment Success
   - Payment Failed
   - Payment User Dropped
4. Save the configuration

