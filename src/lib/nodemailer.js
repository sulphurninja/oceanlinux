const nodemailer = require('nodemailer');

/**
 * OceanLinux Email Service using Nodemailer
 * 
 * Supports multiple SMTP providers:
 * - Gmail (SMTP)
 * - AWS SES
 * - Mailgun
 * - SendGrid SMTP
 * - Custom SMTP servers
 * - Zoho Mail
 * - Office 365
 */

class EmailService {
  constructor() {
    this.fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'hello@oceanlinux.com';
    this.fromName = process.env.SMTP_FROM_NAME || 'OceanLinux Team';
    this.isConfigured = false;
    this.transporter = null;
    
    this.initializeTransporter();
  }

  initializeTransporter() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpSecure = process.env.SMTP_SECURE === 'true';

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.warn('[EmailService] ⚠️ SMTP not configured - emails will fail!');
      console.warn('[EmailService] Required env vars: SMTP_HOST, SMTP_USER, SMTP_PASS');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: smtpSecure, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        // Connection pool for better performance
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        // Timeout settings
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 30000, // 30 seconds
      });

      this.isConfigured = true;
      console.log(`[EmailService] ✅ Nodemailer configured with ${smtpHost}:${smtpPort}`);

      // Verify connection on startup (async, don't block)
      this.transporter.verify()
        .then(() => console.log('[EmailService] ✅ SMTP connection verified'))
        .catch(err => console.error('[EmailService] ❌ SMTP connection failed:', err.message));

    } catch (error) {
      console.error('[EmailService] ❌ Failed to initialize transporter:', error.message);
    }
  }

  async sendEmail({ to, subject, html, text = null, replyTo = null, attachments = null }) {
    if (!this.isConfigured || !this.transporter) {
      console.error('[EmailService] ❌ Email service not configured');
      console.error('[EmailService] Please configure SMTP settings in your .env file:');
      console.error('[EmailService] SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL');
      return { 
        success: false, 
        error: 'Email service not configured. Please contact support.' 
      };
    }

    try {
      console.log(`[EmailService] 📧 Sending email to: ${to}, subject: ${subject}`);

      const mailOptions = {
        from: {
          name: this.fromName,
          address: this.fromEmail,
        },
        to,
        subject,
        html,
      };

      // Optional fields
      if (text) mailOptions.text = text;
      if (replyTo) mailOptions.replyTo = replyTo;
      if (attachments) mailOptions.attachments = attachments;

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log('[EmailService] ✅ Email sent successfully');
      console.log(`[EmailService]   → Message ID: ${result.messageId}`);
      console.log(`[EmailService]   → Accepted: ${result.accepted?.join(', ') || 'N/A'}`);

      return { success: true, messageId: result.messageId, result };

    } catch (error) {
      console.error('[EmailService] ❌ Email sending failed');
      console.error('[EmailService] Error:', error.message);
      
      if (error.responseCode) {
        console.error('[EmailService] SMTP Response Code:', error.responseCode);
      }

      // Provide user-friendly error messages
      let userMessage = 'Failed to send email. Please try again later.';
      
      if (error.code === 'EAUTH') {
        userMessage = 'Email service authentication failed. Please contact support.';
      } else if (error.code === 'ECONNECTION' || error.code === 'ESOCKET') {
        userMessage = 'Unable to connect to email service. Please try again later.';
      } else if (error.code === 'EENVELOPE') {
        userMessage = 'Invalid email address. Please check and try again.';
      }

      return { success: false, error: userMessage };
    }
  }

  // ============================================================================
  // Email Templates - Same as SendGrid version
  // ============================================================================

  async sendForgotPasswordEmail(email, name, resetToken) {
    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password?token=${resetToken}`;
    const html = this.getPasswordResetTemplate({ name, resetUrl, email });
    return this.sendEmail({
      to: email,
      subject: '🔒 Reset Your OceanLinux Password - Secure & Quick',
      html,
    });
  }

  async sendWelcomeEmail(email, name) {
    const loginUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/login`;
    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`;
    const html = this.getWelcomeTemplate({ name, email, loginUrl, dashboardUrl });
    return this.sendEmail({
      to: email,
      subject: '🌊 Welcome to OceanLinux - Your Linux Journey Begins!',
      html,
    });
  }

  async sendTicketCreatedEmail(email, name, ticketId, subject, category) {
    const ticketUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/support/${ticketId}`;
    const html = this.getTicketCreatedTemplate({ name, ticketId, subject, category, ticketUrl });
    return this.sendEmail({
      to: email,
      subject: `🎫 Support Ticket Created - ${ticketId}`,
      html,
    });
  }

  async sendTicketUpdateEmail(email, name, ticketId, subject, status, lastMessage) {
    const ticketUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/support/${ticketId}`;
    const html = this.getTicketUpdateTemplate({ name, ticketId, subject, status, lastMessage, ticketUrl });
    return this.sendEmail({
      to: email,
      subject: `🔄 Ticket Update - ${ticketId} - ${status.toUpperCase()}`,
      html,
    });
  }

  async sendOrderSuccessEmail(email, name, orderId, productName, price, ipAddress) {
    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`;
    const html = this.getOrderSuccessTemplate({ name, orderId, productName, price, ipAddress, dashboardUrl });
    return this.sendEmail({
      to: email,
      subject: '🚀 Your OceanLinux Server is Ready!',
      html,
    });
  }

  async sendAnnouncementEmail(email, name, announcement) {
    const html = this.getAnnouncementTemplate({ name, ...announcement });
    return this.sendEmail({
      to: email,
      subject: `📢 ${announcement.subject} - OceanLinux`,
      html,
    });
  }

  // ============================================================================
  // Email Templates (copied from sendgrid.js - keeping same styling)
  // ============================================================================

  getPasswordResetTemplate({ name, resetUrl, email }) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; }
            .logo { width: 60px; height: 60px; margin: 0 auto 20px; }
            .header h1 { color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
            .header p { color: rgba(255,255,255,0.9); font-size: 16px; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 20px; font-weight: 600; margin-bottom: 20px; color: #1f2937; }
            .message { font-size: 16px; color: #4b5563; margin-bottom: 30px; line-height: 1.7; }
            .reset-button { display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 20px 0; box-shadow: 0 4px 14px 0 rgba(139, 92, 246, 0.3); }
            .security-info { background: #f3f4f6; padding: 20px; border-radius: 12px; margin: 30px 0; }
            .security-info h3 { color: #1f2937; margin-bottom: 12px; font-size: 16px; }
            .security-info ul { list-style: none; }
            .security-info li { margin: 8px 0; color: #6b7280; font-size: 14px; }
            .security-info li:before { content: "🔒"; margin-right: 8px; }
            .footer { background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; }
            .divider { height: 1px; background: #e5e7eb; margin: 30px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://oceanlinux.com/oceanlinux.png" alt="OceanLinux" class="logo">
                <h1>OceanLinux</h1>
                <p>The Ocean of Linux</p>
            </div>
            <div class="content">
                <div class="greeting">Hi ${name},</div>
                <div class="message">
                    We received a request to reset your password for your OceanLinux account. Don't worry - this happens to the best of us!
                </div>
                <div class="message">
                    Click the button below to create a new password. This link will expire in 1 hour for security reasons.
                </div>
                <div style="text-align: center; color: white">
                    <a href="${resetUrl}" class="reset-button">🔑 Reset My Password</a>
                </div>
                <div class="security-info">
                    <h3>🛡️ Security Information</h3>
                    <ul>
                        <li>This reset link expires in 1 hour</li>
                        <li>The link can only be used once</li>
                        <li>If you didn't request this, ignore this email</li>
                        <li>Your current password remains unchanged until you reset it</li>
                    </ul>
                </div>
                <div class="divider"></div>
                <div class="message" style="font-size: 14px; color: #6b7280;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${resetUrl}" style="color: #8b5cf6; word-break: break-all;">${resetUrl}</a>
                </div>
            </div>
            <div class="footer">
                <strong>OceanLinux</strong><br>The Ocean Of Linux
                <div style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                    This email was sent to ${email}. © ${new Date().getFullYear()} OceanLinux. All rights reserved.
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getWelcomeTemplate({ name, email, loginUrl, dashboardUrl }) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to OceanLinux</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); padding: 50px 30px; text-align: center; }
            .header h1 { color: white; font-size: 32px; font-weight: 700; margin-bottom: 8px; }
            .header p { color: rgba(255,255,255,0.9); font-size: 18px; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1f2937; }
            .message { font-size: 16px; color: #4b5563; margin-bottom: 25px; line-height: 1.7; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 20px 0; }
            .features { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 30px 0; }
            .feature { background: #f8fafc; padding: 25px; border-radius: 12px; border-left: 4px solid #8b5cf6; }
            .feature h3 { color: #1f2937; margin-bottom: 8px; font-size: 16px; }
            .feature p { color: #6b7280; font-size: 14px; }
            .footer { background: #1f2937; color: #9ca3af; padding: 40px 30px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🌊 Welcome to OceanLinux!</h1>
                <p>The Ocean of Linux Hosting</p>
            </div>
            <div class="content">
                <div class="greeting">Hello ${name}! 👋</div>
                <div class="message">
                    Welcome to OceanLinux! We're thrilled to have you join our community. Your account has been created successfully!
                </div>
                <div style="text-align: center; color: white">
                    <a href="${dashboardUrl}" class="cta-button">🚀 Access Your Dashboard</a>
                </div>
                <div class="features">
                    <div class="feature">
                        <h3>🔧 Full Root Access</h3>
                        <p>Complete control over your Linux environment</p>
                    </div>
                    <div class="feature">
                        <h3>⚡ Instant Deployment</h3>
                        <p>Servers deploy in under 60 seconds</p>
                    </div>
                    <div class="feature">
                        <h3>💰 Best Pricing</h3>
                        <p>Premium quality at affordable prices</p>
                    </div>
                    <div class="feature">
                        <h3>🛡️ Enterprise Security</h3>
                        <p>Advanced security and DDoS protection</p>
                    </div>
                </div>
            </div>
            <div class="footer">
                <strong>🌊 OceanLinux</strong><br>Most Affordable Premium Linux VPS Hosting
                <div style="font-size: 12px; margin-top: 20px;">
                    This email was sent to ${email}<br>
                    © ${new Date().getFullYear()} OceanLinux. All rights reserved.
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getTicketCreatedTemplate({ name, ticketId, subject, category, ticketUrl }) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Support Ticket Created</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; }
            .header h1 { color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
            .ticket-info { background: rgba(255,255,255,0.15); padding: 20px; border-radius: 12px; margin: 20px 0; color: white; }
            .content { padding: 40px 30px; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; }
            .footer { background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div style="font-size: 48px; margin-bottom: 16px;">🎫</div>
                <h1>Ticket Created Successfully</h1>
                <p style="color: rgba(255,255,255,0.9);">We've received your support request</p>
                <div class="ticket-info">
                    <div style="margin: 8px 0;"><strong>Ticket ID:</strong> ${ticketId}</div>
                    <div style="margin: 8px 0;"><strong>Subject:</strong> ${subject}</div>
                    <div style="margin: 8px 0;"><strong>Category:</strong> ${category}</div>
                </div>
            </div>
            <div class="content">
                <div style="font-size: 20px; font-weight: 600; margin-bottom: 20px;">Hi ${name},</div>
                <div style="font-size: 16px; color: #4b5563; margin-bottom: 25px;">
                    Thank you for contacting OceanLinux support! Your ticket has been created and our team will respond within 2-4 hours.
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${ticketUrl}" class="cta-button">🔍 View Ticket Details</a>
                </div>
            </div>
            <div class="footer">
                <strong>🌊 OceanLinux Support Team</strong><br>Available 24/7 for your success
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getTicketUpdateTemplate({ name, ticketId, subject, status, lastMessage, ticketUrl }) {
    const statusColors = {
      'open': '#3b82f6',
      'in-progress': '#f59e0b',
      'waiting-response': '#ef4444',
      'resolved': '#10b981'
    };
    const color = statusColors[status] || '#3b82f6';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ticket Update</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, ${color} 0%, #8b5cf6 100%); padding: 40px 30px; text-align: center; }
            .header h1 { color: white; font-size: 28px; margin-bottom: 8px; }
            .content { padding: 40px 30px; }
            .message-box { background: #f8fafc; padding: 20px; border-radius: 12px; border-left: 4px solid ${color}; margin: 20px 0; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, ${color} 0%, #8b5cf6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; }
            .footer { background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div style="font-size: 48px; margin-bottom: 16px;">🔄</div>
                <h1>Ticket Updated</h1>
                <p style="color: rgba(255,255,255,0.9);">Status: ${status.replace('-', ' ').toUpperCase()}</p>
            </div>
            <div class="content">
                <div style="font-size: 20px; font-weight: 600; margin-bottom: 20px;">Hi ${name},</div>
                <div style="font-size: 16px; color: #4b5563; margin-bottom: 25px;">
                    Your support ticket <strong>${ticketId}</strong> has been updated!
                </div>
                <div class="message-box">
                    <h3 style="color: #1f2937; margin-bottom: 12px;">📝 Latest Update:</h3>
                    <div style="color: #4b5563; font-size: 14px;">
                        ${lastMessage || 'Status updated by our support team.'}
                    </div>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${ticketUrl}" class="cta-button">💬 View & Reply</a>
                </div>
            </div>
            <div class="footer">
                <strong>🌊 OceanLinux Support Team</strong>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getOrderSuccessTemplate({ name, orderId, productName, price, ipAddress, dashboardUrl }) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Server Ready!</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #10b981 0%, #8b5cf6 100%); padding: 50px 30px; text-align: center; }
            .header h1 { color: white; font-size: 32px; font-weight: 700; margin-bottom: 8px; }
            .header p { color: rgba(255,255,255,0.9); font-size: 18px; }
            .server-info { background: rgba(255,255,255,0.15); padding: 25px; border-radius: 16px; margin: 25px 0; color: white; }
            .content { padding: 40px 30px; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #8b5cf6 100%); color: white; padding: 18px 36px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 18px; }
            .footer { background: #1f2937; color: #9ca3af; padding: 40px 30px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div style="font-size: 64px; margin-bottom: 20px;">🚀</div>
                <h1>Your Server is Ready!</h1>
                <p>Successfully deployed and configured</p>
                <div class="server-info">
                    <div style="margin: 12px 0;"><strong>🖥️ Server:</strong> ${productName}</div>
                    <div style="margin: 12px 0;"><strong>🌐 IP Address:</strong> <span style="font-family: monospace; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px;">${ipAddress}</span></div>
                    <div style="margin: 12px 0;"><strong>💰 Price:</strong> ₹${price}/month</div>
                    <div style="margin: 12px 0;"><strong>📋 Order ID:</strong> ${orderId}</div>
                </div>
            </div>
            <div class="content">
                <div style="font-size: 24px; font-weight: 600; margin-bottom: 20px;">
                    Congratulations ${name}! 🎉
                </div>
                <div style="font-size: 16px; color: #4b5563; margin-bottom: 25px;">
                    Your Linux VPS server has been deployed and is ready for use! Check your dashboard for SSH credentials.
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${dashboardUrl}" class="cta-button">🎛️ Access Server Dashboard</a>
                </div>
            </div>
            <div class="footer">
                <strong>🌊 Welcome to OceanLinux</strong><br>
                Your journey in the ocean of Linux begins now!
                <div style="font-size: 12px; margin-top: 20px;">
                    Order #${orderId} • Server deployed on ${new Date().toLocaleString()}<br>
                    © ${new Date().getFullYear()} OceanLinux. All rights reserved.
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getAnnouncementTemplate({ name, title, content, type, actionUrl, actionText }) {
    const typeStyles = {
      'promotion': { color: '#dc2626', bg: '#fef2f2', icon: '🎉' },
      'update': { color: '#2563eb', bg: '#eff6ff', icon: '🔄' },
      'maintenance': { color: '#d97706', bg: '#fffbeb', icon: '🔧' },
      'feature': { color: '#059669', bg: '#f0fdf4', icon: '✨' },
      'security': { color: '#7c2d12', bg: '#fef7ed', icon: '🛡️' }
    };
    const style = typeStyles[type] || typeStyles.update;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OceanLinux Announcement</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, ${style.color} 0%, #8b5cf6 100%); padding: 40px 30px; text-align: center; }
            .header h1 { color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
            .content { padding: 40px 30px; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, ${style.color} 0%, #8b5cf6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; }
            .footer { background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div style="font-size: 48px; margin-bottom: 16px;">${style.icon}</div>
                <h1>📢 ${title}</h1>
            </div>
            <div class="content">
                <div style="font-size: 20px; font-weight: 600; margin-bottom: 20px;">Hi ${name},</div>
                <div style="font-size: 16px; color: #4b5563; margin-bottom: 25px; line-height: 1.7;">
                    ${content}
                </div>
                ${actionUrl && actionText ? `
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${actionUrl}" class="cta-button">${actionText}</a>
                </div>
                ` : ''}
            </div>
            <div class="footer">
                <strong>🌊 OceanLinux Team</strong>
                <div style="font-size: 12px; margin-top: 20px;">
                    © ${new Date().getFullYear()} OceanLinux. All rights reserved.
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }
}

module.exports = EmailService;



