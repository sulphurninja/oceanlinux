# AWS SES Production Access Request - Response Template

## Use Case Overview

OceanLinux is a Linux VPS hosting platform (oceanlinux.com) with 2,000+ active registered users. We operate as a SaaS (Software-as-a-Service) provider delivering virtual private servers and related infrastructure services to customers globally.

---

## Email Sending Frequency & Volume

### Current Volume
- **Daily transactional emails:** 50-200 emails per day (varies by user activity)
- **Monthly average:** ~3,000-5,000 emails
- **Peak scenarios:** During promotional campaigns or platform-wide announcements: up to 500 emails/day

### Types of Emails Sent
1. **Critical Transactional** (80% of volume)
   - Order confirmations (when users purchase VPS services)
   - Payment receipts and invoices
   - Server provisioning notifications
   - Service expiry reminders (24 hours before renewal)
   - Password reset requests

2. **Operational** (15% of volume)
   - Account verification emails
   - Email address change confirmations
   - Support ticket updates and replies
   - Server status notifications (maintenance alerts, incidents)

3. **Informational** (5% of volume)
   - Optional marketing emails (only to opted-in users)
   - Newsletter with platform updates
   - Feature announcements

---

## Recipient List Management

### How We Maintain Lists
- **Source:** Only users who actively register and create accounts on oceanlinux.com
- **Validation:** Emails are verified during registration via confirmation link
- **Consent:** All users explicitly consent to transactional emails during signup
- **Opt-out:** Users can manage email preferences in their account dashboard
- **Database:** Emails stored in MongoDB with user consent flags and subscription preferences

### List Quality Practices
- Invalid/bounced emails are automatically flagged and removed after 3 bounces
- No purchased email lists or third-party data sources
- No spam signup campaigns
- Regular audits to remove unengaged/inactive users
- GDPR compliant data retention policies

---

## Bounce & Complaint Management

### Bounce Handling
- **Hard Bounces:** Automatically unsubscribe user immediately, flag account as "invalid email"
- **Soft Bounces:** Retry up to 3 times over 72 hours, then manual review
- **Monitoring:** Bounce rates tracked via SES metrics and dashboards
- **Action:** If bounce rate exceeds 5%, immediate investigation and list cleanup

### Complaint Handling (Spam Reports)
- **Monitoring:** Set up SNS notifications for complaint feedback loops
- **Action:** Immediate unsubscribe from mailing list, flag account
- **Investigation:** Review email content and reason for complaint
- **Prevention:** Maintain complaint rate below 0.1% (industry standard: <0.5%)
- **Escalation:** If complaint rate exceeds threshold, pause mailings and investigate

### Unsubscribe Requests
- **Mechanism:** "Unsubscribe" link in every email footer
- **Processing:** Automatic immediate removal from mailing lists
- **Verification:** User confirmation before removal
- **Retention:** Unsubscribed emails stored but never contacted again
- **Compliance:** Respect user preferences within 24 hours

---

## Email Content Quality

### Sample Email Templates

#### Example 1: Order Confirmation
```
Subject: ✅ Your OceanLinux VPS Order Confirmed - Order #12345

From: hello@oceanlinux.com
To: customer@example.com

Body:
Hi [Customer Name],

Thank you for your order! Your Linux VPS is being provisioned now.

📋 Order Details:
- Product: 🌊 OceanLinux VPS (4GB RAM, 2vCPU, Ubuntu 22.04)
- Order ID: #12345
- Price: ₹949/month
- Expiry: January 17, 2026

🚀 Your VPS will be ready in 5-10 minutes!
Access details will be sent to this email shortly.

Questions? Reply to this email or visit: https://oceanlinux.com/support

Best regards,
OceanLinux Team
https://oceanlinux.com
```

#### Example 2: Password Reset
```
Subject: 🔐 Reset Your OceanLinux Password

From: hello@oceanlinux.com
To: customer@example.com

Body:
Hi [Customer Name],

We received a request to reset your OceanLinux password. 
Click the link below to set a new password:

[Reset Link with 1-hour expiration]

This link expires in 1 hour for security.

If you didn't request this, ignore this email. Your password will remain unchanged.

Security tip: Never share this link with anyone.

Best regards,
OceanLinux Team
https://oceanlinux.com
```

#### Example 3: Service Expiry Reminder
```
Subject: ⏰ Your OceanLinux VPS Expires in 24 Hours

From: hello@oceanlinux.com
To: customer@example.com

Body:
Hi [Customer Name],

Your VPS service expires tomorrow (January 17, 2026).

To prevent service interruption, please renew now:
[Renewal Link]

VPS Details:
- IP: 103.101.116.203
- RAM: 4GB
- Renewal Price: ₹949/month

[Renew Now Button]

Questions? Contact support@oceanlinux.com

Best regards,
OceanLinux Team
```

### Content Quality Standards
- ✅ **Professional design** with clear branding
- ✅ **Plain-text alternative** for accessibility
- ✅ **No misleading subject lines** or phishing-like content
- ✅ **Unsubscribe/preference links** in every email footer
- ✅ **No spam trigger words** or excessive promotional language
- ✅ **Authentication:** DKIM, SPF, DMARC configured
- ✅ **Single Sign-On:** Users can verify sender with company branding
- ✅ **Mobile-responsive design** for all templates

---

## Sending Procedures & Best Practices

### Our Sending Infrastructure
1. **Application:** Next.js backend (Node.js runtime)
2. **Email Service:** Nodemailer with Amazon SES SMTP
3. **Rate Limiting:** 10 emails per second (within SES limits)
4. **Queue System:** Async job queue for bulk sends (optional enhancement)
5. **Monitoring:** Real-time email delivery status dashboard

### Compliance & Best Practices
- ✅ SPF record configured for oceanlinux.com
- ✅ DKIM signing enabled for all outgoing emails
- ✅ DMARC policy: quarantine (p=quarantine)
- ✅ List-Unsubscribe headers in all emails
- ✅ Sender authentication (DKIM signatures)
- ✅ Reply-to address clearly specified
- ✅ No image-only emails (always include text)
- ✅ No hidden tracking pixels without disclosure
- ✅ Bounce/complaint feedback loops set up
- ✅ Regular monitoring of sender reputation

### Volume Growth Plan
- **Month 1-2:** 2,000-5,000 emails/month (transactional only)
- **Month 3-6:** 10,000-20,000 emails/month (adding opt-in newsletters)
- **Year 1+:** Up to 50,000 emails/month (as user base grows)
- **Increase plan:** Request limit increases as needed, maintain <0.5% bounce rate

---

## User Consent & Privacy

### How Users Consent
1. Checkbox on registration: "I agree to receive transactional emails"
2. Checkbox on registration: "I'd like to receive marketing emails (optional)"
3. Explicit opt-in for newsletter/announcements
4. Email preferences dashboard where users control what they receive

### Privacy Policy
- All data handled per GDPR, CCPA, and DPA regulations
- Privacy policy: https://oceanlinux.com/privacy
- Data retention: 3 years after account deletion
- No data sharing with third parties

---

## Anti-Spam Measures

### Prevention
- ✅ No purchased email lists
- ✅ No dictionary attacks or address harvesting
- ✅ Verified registration process with CAPTCHA
- ✅ Rate limiting on signup/login (prevent brute force)
- ✅ Email verification link on registration
- ✅ No automated bulk signup

### Monitoring
- ✅ Complaint rate tracked daily (<0.1% target)
- ✅ Bounce rate tracked daily (<5% target)
- ✅ Sender reputation score monitored
- ✅ Recipient engagement metrics reviewed weekly
- ✅ Manual review of complaint patterns

### User Education
- ✅ Clear "From" address and company identification
- ✅ Professional email design (not phishing-like)
- ✅ Easy unsubscribe option in every email
- ✅ No clickbait subject lines

---

## Business Context

### Company
- **Name:** OceanLinux
- **Website:** https://oceanlinux.com
- **Industry:** Cloud Infrastructure / VPS Hosting
- **Founded:** 2024
- **Active Users:** 2,000+
- **Region:** Primarily India and South Asia, growing globally

### Revenue Model
- Monthly VPS subscription fees
- One-time setup fees
- Premium support plans
- Transactional emails critical to business operations

### Use of SES
Amazon SES is essential for:
1. **Customer notifications** (order confirmations, status updates)
2. **Security** (password resets, account verification)
3. **Retention** (expiry reminders, renewal notices)
4. **Support** (ticket updates, responses)

---

## Additional Information

### Email Frequency Per User
- **Average user:** 2-5 emails per month (order confirmation, expiry reminder)
- **Active user:** 5-10 emails per month (multiple orders, support tickets)
- **Inactive user:** 0-1 emails per month (expiry reminder only)

### Why Amazon SES
- Reliable, scalable infrastructure
- Cost-effective for transactional emails
- Excellent deliverability rates
- Compliance with industry standards
- Perfect for our use case

---

## Contact & Support

**Company Contact:**
- Email: hello@oceanlinux.com
- Website: https://oceanlinux.com
- Support: support@oceanlinux.com

---

## Summary

OceanLinux is a legitimate SaaS VPS hosting platform with 2,000+ verified user accounts. We send only transactional and consent-based emails with high engagement rates. Our sending practices follow industry best practices, and we maintain robust bounce/complaint management. We request production access to scale our email infrastructure reliably for our growing customer base.
