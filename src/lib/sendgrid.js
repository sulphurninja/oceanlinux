/**
 * OceanLinux Email Service
 * 
 * Modern, clean email templates with professional design.
 * Uses Nodemailer for sending emails via SMTP.
 */

const nodemailer = require('nodemailer');

let transporter = null;
let isConfigured = false;

const BRAND = {
  primary: '#8b5cf6',
  secondary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  dark: '#0f172a',
  light: '#f8fafc',
  muted: '#64748b',
  logo: 'https://oceanlinux.com/ol.png',
  website: 'https://oceanlinux.com',
  supportEmail: 'hello@oceanlinux.com',
};

function initializeTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || 465;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpSecure = process.env.SMTP_SECURE !== 'false';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[EmailService] ⚠️ SMTP not configured');
    return;
  }

  try {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
      pool: true,
      maxConnections: 5,
    });
    isConfigured = true;
    console.log(`[EmailService] ✅ Configured: ${smtpHost}:${smtpPort}`);
    transporter.verify().catch(err => console.error('[EmailService] ❌', err.message));
  } catch (error) {
    console.error('[EmailService] ❌', error.message);
  }
}

initializeTransporter();

function getTemplate(content, preheader = '') {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OceanLinux</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ''}
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#8b5cf6 0%,#3b82f6 100%);padding:32px 40px;text-align:center;">
              <img src="${BRAND.logo}" alt="OceanLinux" width="48" height="48" style="display:block;margin:0 auto 12px;border-radius:12px;">
              <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">OceanLinux</div>
              <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">Premium Linux VPS Hosting</div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:32px 40px;text-align:center;">
              <div style="margin-bottom:16px;">
                <a href="${baseUrl}" style="color:#8b5cf6;text-decoration:none;font-size:13px;margin:0 12px;">Website</a>
                <a href="${baseUrl}/dashboard" style="color:#8b5cf6;text-decoration:none;font-size:13px;margin:0 12px;">Dashboard</a>
                <a href="${baseUrl}/support" style="color:#8b5cf6;text-decoration:none;font-size:13px;margin:0 12px;">Support</a>
              </div>
              <div style="color:#64748b;font-size:12px;line-height:1.6;">
                © ${new Date().getFullYear()} OceanLinux. All rights reserved.<br>
                <a href="mailto:${BRAND.supportEmail}" style="color:#64748b;">${BRAND.supportEmail}</a>
              </div>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

class EmailService {
  constructor() {
    this.fromEmail = process.env.SMTP_FROM_EMAIL || 'hello@oceanlinux.com';
    this.fromName = process.env.SMTP_FROM_NAME || 'OceanLinux';
    this.isConfigured = isConfigured;
    this.baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
  }

  async sendEmail({ to, subject, html }) {
    if (!this.isConfigured || !transporter) {
      return { success: false, error: 'Email service not configured' };
    }
    try {
      const result = await transporter.sendMail({
        from: { name: this.fromName, address: this.fromEmail },
        to, subject, html,
      });
      console.log(`[EmailService] ✅ Email sent - ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('[EmailService] ❌', error.message);
      return { success: false, error: error.message };
    }
  }

  // ========== WELCOME EMAIL ==========
  async sendWelcomeEmail(email, name) {
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#dcfce7,#d1fae5);color:#059669;font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">✨ Account Created</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Welcome to OceanLinux!</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Hey ${name}! 👋 You're now part of the most affordable premium Linux VPS hosting platform. Let's get you started!
      </p>
      
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${this.baseUrl}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">Go to Dashboard →</a>
      </div>
      
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;margin-bottom:24px;">
        <tr>
          <td style="padding:20px;text-align:center;border-right:1px solid #e2e8f0;">
            <div style="font-size:24px;margin-bottom:4px;">⚡</div>
            <div style="font-size:12px;font-weight:600;color:#0f172a;">Instant Setup</div>
          </td>
          <td style="padding:20px;text-align:center;border-right:1px solid #e2e8f0;">
            <div style="font-size:24px;margin-bottom:4px;">🛡️</div>
            <div style="font-size:12px;font-weight:600;color:#0f172a;">DDoS Protected</div>
          </td>
          <td style="padding:20px;text-align:center;">
            <div style="font-size:24px;margin-bottom:4px;">💬</div>
            <div style="font-size:12px;font-weight:600;color:#0f172a;">24/7 Support</div>
          </td>
        </tr>
      </table>
      
      <p style="margin:0;color:#64748b;font-size:13px;text-align:center;">
        Need help? <a href="${this.baseUrl}/live-chat" style="color:#8b5cf6;text-decoration:none;font-weight:500;">Chat with us</a> anytime!
      </p>
    `;
    return this.sendEmail({
      to: email,
      subject: '🌊 Welcome to OceanLinux!',
      html: getTemplate(content, `Welcome ${name}! Your account is ready.`),
    });
  }

  // ========== PASSWORD RESET ==========
  async sendForgotPasswordEmail(email, name, resetToken) {
    const resetUrl = `${this.baseUrl}/reset-password?token=${resetToken}`;
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:#fef3c7;color:#b45309;font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">🔐 Password Reset</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Reset Your Password</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Hi ${name}, we received a request to reset your password. Click below to create a new one.
      </p>
      
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">Reset Password →</a>
      </div>
      
      <div style="background:#fef3c7;border-radius:10px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;color:#92400e;font-size:13px;text-align:center;">
          ⏰ This link expires in <strong>1 hour</strong>. Didn't request this? Ignore this email.
        </p>
      </div>
      
      <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;word-break:break-all;">
        ${resetUrl}
      </p>
    `;
    return this.sendEmail({
      to: email,
      subject: '🔐 Reset Your Password - OceanLinux',
      html: getTemplate(content, 'Reset your OceanLinux password'),
    });
  }

  // ========== ORDER SUCCESS ==========
  async sendOrderSuccessEmail(email, name, orderId, productName, price, ipAddress) {
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#dcfce7,#d1fae5);color:#059669;font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">🚀 Server Ready</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Your VPS is Live!</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Congrats ${name}! 🎉 Your server has been deployed and is ready to use.
      </p>
      
      <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:12px;padding:24px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
              <span style="color:rgba(255,255,255,0.7);font-size:13px;">Server</span>
            </td>
            <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);text-align:right;">
              <span style="color:#ffffff;font-size:13px;font-weight:600;">${productName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
              <span style="color:rgba(255,255,255,0.7);font-size:13px;">IP Address</span>
            </td>
            <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);text-align:right;">
              <span style="color:#a5b4fc;font-size:13px;font-family:monospace;">${ipAddress}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
              <span style="color:rgba(255,255,255,0.7);font-size:13px;">Price</span>
            </td>
            <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);text-align:right;">
              <span style="color:#10b981;font-size:13px;font-weight:600;">₹${price}/mo</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;">
              <span style="color:rgba(255,255,255,0.7);font-size:13px;">Order ID</span>
            </td>
            <td style="padding:8px 0;text-align:right;">
              <span style="color:rgba(255,255,255,0.9);font-size:13px;">#${orderId}</span>
            </td>
          </tr>
        </table>
      </div>
      
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${this.baseUrl}/dashboard/order/${orderId}" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">View Server Dashboard →</a>
      </div>
      
      <p style="margin:0;color:#64748b;font-size:13px;text-align:center;">
        SSH credentials are available in your dashboard. Need setup help? <a href="${this.baseUrl}/live-chat" style="color:#8b5cf6;text-decoration:none;">Chat with us!</a>
      </p>
    `;
    return this.sendEmail({
      to: email,
      subject: '🚀 Your Server is Ready! - OceanLinux',
      html: getTemplate(content, `Your VPS ${productName} is live at ${ipAddress}`),
    });
  }

  // ========== RENEWAL SUCCESS ==========
  async sendRenewalSuccessEmail(email, name, orderId, productName, price, ipAddress, newExpiryDate) {
    const expiry = new Date(newExpiryDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#dcfce7,#d1fae5);color:#059669;font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">✅ Renewed</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Renewal Successful!</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Thanks ${name}! Your server has been renewed and will continue running without interruption.
      </p>
      
      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Server</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#0f172a;font-size:13px;font-weight:600;">${productName}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">IP Address</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#0f172a;font-size:13px;font-family:monospace;">${ipAddress}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Amount Paid</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#10b981;font-size:13px;font-weight:600;">₹${price}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">New Expiry</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#8b5cf6;font-size:13px;font-weight:600;">${expiry}</span></td>
          </tr>
        </table>
      </div>
      
      <div style="text-align:center;">
        <a href="${this.baseUrl}/dashboard/order/${orderId}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">View Server →</a>
      </div>
    `;
    return this.sendEmail({
      to: email,
      subject: '✅ Renewal Successful - OceanLinux',
      html: getTemplate(content, `Your VPS renewed until ${expiry}`),
    });
  }

  // ========== EXPIRY REMINDER ==========
  async sendExpiryReminderEmail(email, name, orderId, productName, ipAddress, expiryDate, daysLeft) {
    const expiry = new Date(expiryDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    const isUrgent = daysLeft <= 1;
    const badgeColor = isUrgent ? 'background:#fef2f2;color:#dc2626;' : 'background:#fef3c7;color:#b45309;';
    const badgeText = isUrgent ? '🚨 Expires Tomorrow' : `⏰ ${daysLeft} Days Left`;
    
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;${badgeColor}font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">${badgeText}</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Renew Your Server</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Hi ${name}, your VPS ${isUrgent ? 'expires tomorrow!' : `will expire in ${daysLeft} days.`} Renew now to keep it running.
      </p>
      
      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Server</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#0f172a;font-size:13px;font-weight:600;">${productName}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">IP Address</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#0f172a;font-size:13px;font-family:monospace;">${ipAddress}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Expires On</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:${isUrgent ? '#dc2626' : '#f59e0b'};font-size:13px;font-weight:600;">${expiry}</span></td>
          </tr>
        </table>
      </div>
      
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${this.baseUrl}/dashboard/order/${orderId}" style="display:inline-block;background:linear-gradient(135deg,${isUrgent ? '#dc2626,#b91c1c' : '#f59e0b,#d97706'});color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">Renew Now →</a>
      </div>
      
      ${isUrgent ? `<p style="margin:0;color:#dc2626;font-size:13px;text-align:center;font-weight:500;">⚠️ Service will be suspended after expiry!</p>` : ''}
    `;
    return this.sendEmail({
      to: email,
      subject: `${isUrgent ? '🚨' : '⏰'} Your VPS ${isUrgent ? 'Expires Tomorrow!' : `Expires in ${daysLeft} Days`}`,
      html: getTemplate(content, `Your VPS expires on ${expiry}`),
    });
  }

  // ========== SERVICE SUSPENDED ==========
  async sendServiceSuspendedEmail(email, name, orderId, productName, ipAddress) {
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:#fef2f2;color:#dc2626;font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">⚠️ Suspended</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Service Suspended</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Hi ${name}, your VPS has been suspended due to non-renewal. Your data is safe during the grace period.
      </p>
      
      <div style="background:#fef2f2;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;"><span style="color:#991b1b;font-size:13px;">Server</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#991b1b;font-size:13px;font-weight:600;">${productName}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#991b1b;font-size:13px;">IP Address</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#991b1b;font-size:13px;font-family:monospace;">${ipAddress}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#991b1b;font-size:13px;">Status</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#dc2626;font-size:13px;font-weight:600;">● Suspended</span></td>
          </tr>
        </table>
      </div>
      
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${this.baseUrl}/dashboard/order/${orderId}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">Renew & Reactivate →</a>
      </div>
      
      <p style="margin:0;color:#dc2626;font-size:13px;text-align:center;font-weight:500;">
        ⚠️ Data will be permanently deleted after grace period ends.
      </p>
    `;
    return this.sendEmail({
      to: email,
      subject: '⚠️ Your VPS Has Been Suspended - OceanLinux',
      html: getTemplate(content, 'Your VPS is suspended. Renew now to restore access.'),
    });
  }

  // ========== TICKET CREATED ==========
  async sendTicketCreatedEmail(email, name, ticketId, subject, category) {
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">🎫 Ticket Created</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">We Got Your Request!</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Hi ${name}, your support ticket has been created. Our team will respond within 2-4 hours.
      </p>
      
      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Ticket ID</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#8b5cf6;font-size:13px;font-weight:600;">#${ticketId}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Subject</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#0f172a;font-size:13px;font-weight:500;">${subject}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Category</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#0f172a;font-size:13px;">${category}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Status</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#2563eb;font-size:13px;font-weight:500;">● Open</span></td>
          </tr>
        </table>
      </div>
      
      <div style="text-align:center;">
        <a href="${this.baseUrl}/dashboard/support/${ticketId}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">View Ticket →</a>
      </div>
    `;
    return this.sendEmail({
      to: email,
      subject: `🎫 Ticket #${ticketId} Created - OceanLinux`,
      html: getTemplate(content, `Your support ticket #${ticketId} has been created`),
    });
  }

  // ========== TICKET UPDATE ==========
  async sendTicketUpdateEmail(email, name, ticketId, subject, status, lastMessage) {
    const statusConfig = {
      'open': { color: '#2563eb', text: 'Open', emoji: '🔵' },
      'in-progress': { color: '#f59e0b', text: 'In Progress', emoji: '🟡' },
      'waiting-response': { color: '#dc2626', text: 'Awaiting Reply', emoji: '🔴' },
      'resolved': { color: '#10b981', text: 'Resolved', emoji: '✅' },
    };
    const s = statusConfig[status] || statusConfig['open'];
    
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:#f8fafc;color:${s.color};font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">${s.emoji} ${s.text}</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Ticket Updated</h1>
      
      <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Hi ${name}, your ticket <strong>#${ticketId}</strong> has been updated.
      </p>
      
      ${lastMessage ? `
      <div style="background:#f8fafc;border-left:3px solid #8b5cf6;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
        <div style="color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:8px;">Latest Response</div>
        <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${lastMessage}</p>
      </div>
      ` : ''}
      
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${this.baseUrl}/dashboard/support/${ticketId}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">View & Reply →</a>
      </div>
      
      ${status === 'waiting-response' ? `<p style="margin:0;color:#f59e0b;font-size:13px;text-align:center;font-weight:500;">⚠️ We're waiting for your response!</p>` : ''}
      ${status === 'resolved' ? `<p style="margin:0;color:#10b981;font-size:13px;text-align:center;font-weight:500;">🎉 Glad we could help!</p>` : ''}
    `;
    return this.sendEmail({
      to: email,
      subject: `${s.emoji} Ticket #${ticketId} - ${s.text}`,
      html: getTemplate(content, `Your ticket #${ticketId} status: ${s.text}`),
    });
  }

  // ========== ANNOUNCEMENT ==========
  async sendAnnouncementEmail(email, name, announcement) {
    const { title, content: body, type = 'update', actionUrl, actionText } = announcement;
    const types = {
      'promotion': { emoji: '🎉', color: '#dc2626' },
      'update': { emoji: '🔄', color: '#2563eb' },
      'maintenance': { emoji: '🔧', color: '#f59e0b' },
      'feature': { emoji: '✨', color: '#8b5cf6' },
      'security': { emoji: '🛡️', color: '#dc2626' },
    };
    const t = types[type] || types['update'];
    
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:#f8fafc;color:${t.color};font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">${t.emoji} ${type.charAt(0).toUpperCase() + type.slice(1)}</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">${title}</h1>
      
      <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-align:center;">Hi ${name},</p>
      
      <div style="color:#475569;font-size:15px;line-height:1.8;margin-bottom:32px;white-space:pre-line;">${body}</div>
      
      ${actionUrl ? `
      <div style="text-align:center;">
        <a href="${actionUrl}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">${actionText || 'Learn More'} →</a>
      </div>
      ` : ''}
    `;
    return this.sendEmail({
      to: email,
      subject: `${t.emoji} ${title} - OceanLinux`,
      html: getTemplate(content, title),
    });
  }

  // ========== EMAIL VERIFICATION ==========
  async sendEmailVerificationCode(email, name, verificationCode) {
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">🔐 Verification</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Verify Your Email</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Hi ${name}, use the code below to verify your new email address.
      </p>
      
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:#f8fafc;border:2px dashed #8b5cf6;border-radius:12px;padding:20px 40px;">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;font-family:monospace;">${verificationCode}</span>
        </div>
      </div>
      
      <div style="background:#fef3c7;border-radius:10px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;color:#92400e;font-size:13px;text-align:center;">
          ⏰ Code expires in <strong>15 minutes</strong>
        </p>
      </div>
      
      <p style="margin:0;color:#64748b;font-size:13px;text-align:center;">
        Didn't request this? You can safely ignore this email.
      </p>
    `;
    return this.sendEmail({
      to: email,
      subject: '🔐 Your Verification Code - OceanLinux',
      html: getTemplate(content, `Your code: ${verificationCode}`),
    });
  }

  // ========== EMAIL CHANGED ==========
  async sendEmailChangedNotification(oldEmail, name, newEmail) {
    const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#dcfce7,#d1fae5);color:#059669;font-size:12px;font-weight:600;padding:6px 16px;border-radius:20px;">✅ Email Changed</div>
      </div>
      
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0f172a;text-align:center;">Email Updated</h1>
      
      <p style="margin:0 0 32px;color:#475569;font-size:15px;line-height:1.7;text-align:center;">
        Hi ${name}, your OceanLinux account email has been changed successfully.
      </p>
      
      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Previous Email</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#64748b;font-size:13px;">${oldEmail}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">New Email</span></td>
            <td style="padding:6px 0;text-align:right;"><span style="color:#10b981;font-size:13px;font-weight:600;">${newEmail}</span></td>
          </tr>
        </table>
      </div>
      
      <div style="background:#fef2f2;border-radius:10px;padding:16px;">
        <p style="margin:0;color:#991b1b;font-size:13px;text-align:center;">
          ⚠️ Didn't make this change? Contact <a href="mailto:${BRAND.supportEmail}" style="color:#dc2626;">${BRAND.supportEmail}</a> immediately.
        </p>
      </div>
    `;
    return this.sendEmail({
      to: oldEmail,
      subject: '✅ Email Address Changed - OceanLinux',
      html: getTemplate(content, `Your email changed to ${newEmail}`),
    });
  }
}

module.exports = EmailService;
