/**
 * OceanLinux Email Service
 * 
 * This module now uses Nodemailer instead of SendGrid.
 * For backwards compatibility, it exports the same interface.
 * 
 * Configure these environment variables:
 * - SMTP_HOST: SMTP server hostname (e.g., smtp.gmail.com, email-smtp.us-east-1.amazonaws.com)
 * - SMTP_PORT: SMTP port (default: 587)
 * - SMTP_USER: SMTP username/email
 * - SMTP_PASS: SMTP password or app-specific password
 * - SMTP_SECURE: Use TLS (true for port 465, false for 587)
 * - SMTP_FROM_EMAIL: Sender email address
 * - SMTP_FROM_NAME: Sender name (default: OceanLinux Team)
 * 
 * Legacy SendGrid vars are still checked as fallback:
 * - SENDGRID_FROM_EMAIL (used if SMTP_FROM_EMAIL not set)
 */

const nodemailer = require('nodemailer');

// Create transporter once
let transporter = null;
let isConfigured = false;

function initializeTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpSecure = process.env.SMTP_SECURE === 'true';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[EmailService] ⚠️ SMTP not configured - emails will fail!');
    console.warn('[EmailService] Required: SMTP_HOST, SMTP_USER, SMTP_PASS');
    return;
  }

  try {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      pool: true,
      maxConnections: 5,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    isConfigured = true;
    console.log(`[EmailService] ✅ Nodemailer configured: ${smtpHost}:${smtpPort}`);

    // Verify connection asynchronously
    transporter.verify()
      .then(() => console.log('[EmailService] ✅ SMTP connection verified'))
      .catch(err => console.error('[EmailService] ❌ SMTP verification failed:', err.message));

  } catch (error) {
    console.error('[EmailService] ❌ Failed to initialize:', error.message);
  }
}

// Initialize on module load
initializeTransporter();

class EmailService {
  constructor() {
    this.fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'hello@oceanlinux.com';
    this.fromName = process.env.SMTP_FROM_NAME || 'OceanLinux Team';
    this.isConfigured = isConfigured;
  }

  async sendEmail({ to, subject, html, templateId = null, dynamicTemplateData = null }) {
    if (!this.isConfigured || !transporter) {
      console.error('[EmailService] ❌ SMTP not configured');
      console.error('[EmailService] Set: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL');
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

      const result = await transporter.sendMail(mailOptions);
      
      console.log('[EmailService] ✅ Email sent successfully');
      console.log(`[EmailService]   → Message ID: ${result.messageId}`);

      return { success: true, messageId: result.messageId, result };

    } catch (error) {
      console.error('[EmailService] ❌ Email sending failed');
      console.error('[EmailService] Error:', error.message);
      
      if (error.responseCode) {
        console.error('[EmailService] SMTP Code:', error.responseCode);
      }

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

  // Forgot Password Email
  async sendForgotPasswordEmail(email, name, resetToken) {
    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password?token=${resetToken}`;

    const html = this.getPasswordResetTemplate({
      name,
      resetUrl,
      email,
    });

    return this.sendEmail({
      to: email,
      subject: '🔒 Reset Your OceanLinux Password - Secure & Quick',
      html,
    });
  }

  // Welcome/Signup Email
  async sendWelcomeEmail(email, name) {
    const loginUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/login`;
    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`;

    const html = this.getWelcomeTemplate({
      name,
      email,
      loginUrl,
      dashboardUrl,
    });

    return this.sendEmail({
      to: email,
      subject: '🌊 Welcome to OceanLinux - Your Linux Journey Begins!',
      html,
    });
  }

  // Support Ticket Created
  async sendTicketCreatedEmail(email, name, ticketId, subject, category) {
    const ticketUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/support/${ticketId}`;

    const html = this.getTicketCreatedTemplate({
      name,
      ticketId,
      subject,
      category,
      ticketUrl,
    });

    return this.sendEmail({
      to: email,
      subject: `🎫 Support Ticket Created - ${ticketId}`,
      html,
    });
  }

  // Ticket Status Update
  async sendTicketUpdateEmail(email, name, ticketId, subject, status, lastMessage) {
    const ticketUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/support/${ticketId}`;

    const html = this.getTicketUpdateTemplate({
      name,
      ticketId,
      subject,
      status,
      lastMessage,
      ticketUrl,
    });

    return this.sendEmail({
      to: email,
      subject: `🔄 Ticket Update - ${ticketId} - ${status.toUpperCase()}`,
      html,
    });
  }

  // Order Success
  async sendOrderSuccessEmail(email, name, orderId, productName, price, ipAddress) {
    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`;

    const html = this.getOrderSuccessTemplate({
      name,
      orderId,
      productName,
      price,
      ipAddress,
      dashboardUrl,
    });

    return this.sendEmail({
      to: email,
      subject: '🚀 Your OceanLinux Server is Ready!',
      html,
    });
  }

  // Announcement Email
  async sendAnnouncementEmail(email, name, announcement) {
    const html = this.getAnnouncementTemplate({
      name,
      ...announcement,
    });

    return this.sendEmail({
      to: email,
      subject: `📢 ${announcement.subject} - OceanLinux`,
      html,
    });
  }

  // Email Templates
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
            .reset-button { display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 20px 0; box-shadow: 0 4px 14px 0 rgba(139, 92, 246, 0.3); transition: all 0.2s; }
            .reset-button:hover { transform: translateY(-2px); box-shadow: 0 8px 25px 0 rgba(139, 92, 246, 0.4); }
            .security-info { background: #f3f4f6; padding: 20px; border-radius: 12px; margin: 30px 0; }
            .security-info h3 { color: #1f2937; margin-bottom: 12px; font-size: 16px; }
            .security-info ul { list-style: none; }
            .security-info li { margin: 8px 0; color: #6b7280; font-size: 14px; }
            .security-info li:before { content: "🔒"; margin-right: 8px; }
            .footer { background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; }
            .footer-logo { margin-bottom: 20px; }
            .social-links { margin: 20px 0; }
            .social-links a { color: #8b5cf6; text-decoration: none; margin: 0 15px; }
            .divider { height: 1px; background: #e5e7eb; margin: 30px 0; }
            @media (max-width: 600px) {
                .container { margin: 0; }
                .header, .content { padding: 30px 20px; }
                .reset-button { display: block; text-align: center; }
            }
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

                <div class="message" style="font-size: 14px; color: #6b7280;">
                    Need help? Our support team is available 24/7 at <a href="mailto:hello@oceanlinux.com" style="color: #8b5cf6;">hello@oceanlinux.com</a>
                </div>
            </div>

            <div class="footer">
                <div class="footer-logo">
                    <strong>OceanLinux</strong><br>
                    The Ocean Of Linux
                </div>

                <div class="social-links">
                    <a href="https://oceanlinux.com">Website</a>
                    <a href="mailto:hello@oceanlinux.com">Support</a>
                    <a href="https://oceanlinux.com/live-chat">Live Chat</a>
                </div>

                <div style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                    This email was sent to ${email}. If you didn't request this password reset, please ignore this email.
                    <br><br>
                    © ${new Date().getFullYear()} OceanLinux. All rights reserved.
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
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); padding: 50px 30px; text-align: center; position: relative; overflow: hidden; }
            .header::before { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.1"/><circle cx="50" cy="10" r="1" fill="white" opacity="0.05"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>'); }
            .logo { width: 80px; height: 80px; margin: 0 auto 20px; position: relative; z-index: 2; }
            .header h1 { color: white; font-size: 32px; font-weight: 700; margin-bottom: 8px; position: relative; z-index: 2; }
            .header p { color: rgba(255,255,255,0.9); font-size: 18px; position: relative; z-index: 2; }
            .welcome-badge { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-top: 16px; font-size: 14px; color: white; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1f2937; }
            .message { font-size: 16px; color: #4b5563; margin-bottom: 25px; line-height: 1.7; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 20px 0; box-shadow: 0 4px 14px 0 rgba(139, 92, 246, 0.3); transition: all 0.2s; }
            .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
            .feature { background: #f8fafc; padding: 25px; border-radius: 12px; border-left: 4px solid #8b5cf6; }
            .feature-icon { font-size: 24px; margin-bottom: 12px; }
            .feature h3 { color: #1f2937; margin-bottom: 8px; font-size: 16px; }
            .feature p { color: #6b7280; font-size: 14px; }
            .next-steps { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); padding: 30px; border-radius: 16px; margin: 30px 0; }
            .next-steps h3 { color: #1f2937; margin-bottom: 16px; }
            .step { display: flex; align-items: center; margin: 12px 0; }
            .step-number { background: #8b5cf6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px; }
            .footer { background: #1f2937; color: #9ca3af; padding: 40px 30px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://oceanlinux.com/oceanlinux.png" alt="OceanLinux" class="logo">
                <h1>🌊 Welcome to OceanLinux!</h1>
                <p>The Ocean of Linux Hosting</p>
                <div class="welcome-badge">✨ Account Created Successfully</div>
            </div>

            <div class="content">
                <div class="greeting">Hello ${name}! 👋</div>

                <div class="message">
                    Welcome to OceanLinux! We're absolutely thrilled to have you join our community of Linux enthusiasts and professionals. Your account has been successfully created and you're now part of the most affordable premium VPS hosting platform.
                </div>

                <div style="text-align: center; color: white">
                    <a href="${dashboardUrl}" class="cta-button">🚀 Access Your Dashboard</a>
                </div>

                <div class="features">
                    <div class="feature">
                        <div class="feature-icon">🔧</div>
                        <h3>Full Root Access</h3>
                        <p>Complete control over your Linux environment with sudo privileges</p>
                    </div>
                    <div class="feature">
                        <div class="feature-icon">⚡</div>
                        <h3>Instant Deployment</h3>
                        <p>Your servers deploy in under 60 seconds with our automation</p>
                    </div>
                    <div class="feature">
                        <div class="feature-icon">💰</div>
                        <h3>Best Pricing</h3>
                        <p>Premium quality at the most affordable prices in the market</p>
                    </div>
                    <div class="feature">
                        <div class="feature-icon">🛡️</div>
                        <h3>Enterprise Security</h3>
                        <p>Advanced security features and DDoS protection included</p>
                    </div>
                </div>


                <div class="message">
                    Need help getting started? Our 24/7 support team is here to assist you every step of the way. Don't hesitate to reach out via live chat or email.
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/live-chat" style="color: #8b5cf6; text-decoration: none; font-weight: 600;">💬 Get Live Support</a> |
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/knowledge-base" style="color: #8b5cf6; text-decoration: none; font-weight: 600; margin-left: 15px;">📚 Browse Knowledge Base</a>
                </div>
            </div>

            <div class="footer">
                <div style="margin-bottom: 20px;">
                    <strong>🌊 OceanLinux</strong><br>
                    Most Affordable Premium Linux VPS Hosting
                </div>

                <div style="margin: 20px 0;">
                    <a href="https://oceanlinux.com" style="color: #8b5cf6; text-decoration: none; margin: 0 10px;">Website</a>
                    <a href="mailto:hello@oceanlinux.com" style="color: #8b5cf6; text-decoration: none; margin: 0 10px;">Support</a>
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/live-chat" style="color: #8b5cf6; text-decoration: none; margin: 0 10px;">Live Chat</a>
                </div>

                <div style="font-size: 12px; color: #6b7280; margin-top: 20px;">
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
            .ticket-icon { font-size: 48px; margin-bottom: 16px; }
            .header h1 { color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
            .ticket-info { background: rgba(255,255,255,0.15); padding: 20px; border-radius: 12px; margin: 20px 0; }
            .ticket-detail { display: flex; justify-content: space-between; margin: 8px 0; color: rgba(255,255,255,0.9); }
            .content { padding: 40px 30px; }
            .status-badge { display: inline-block; background: #10b981; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="ticket-icon">🎫</div>
                <h1>Ticket Created Successfully</h1>
                <p style="color: rgba(255,255,255,0.9);">We've received your support request</p>

                <div class="ticket-info">
                    <div class="ticket-detail">
                        <strong>Ticket ID:</strong>
                        <span>${ticketId}</span>
                    </div>
                    <div class="ticket-detail">
                        <strong>Subject:</strong>
                        <span>${subject}</span>
                    </div>
                    <div class="ticket-detail">
                        <strong>Category:</strong>
                        <span>${category}</span>
                    </div>
                    <div class="ticket-detail">
                        <strong>Status:</strong>
                        <span class="status-badge">Open</span>
                    </div>
                </div>
            </div>

            <div class="content">
                <div style="font-size: 20px; font-weight: 600; margin-bottom: 20px; color: #1f2937;">
                    Hi ${name},
                </div>

                <div style="font-size: 16px; color: #4b5563; margin-bottom: 25px; line-height: 1.7;">
                    Thank you for contacting OceanLinux support! Your ticket has been created and our expert team has been notified. We'll review your request and respond as quickly as possible.
                </div>

                <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; border-left: 4px solid #3b82f6; margin: 25px 0;">
                    <h3 style="color: #1f2937; margin-bottom: 12px;">⏰ What to Expect:</h3>
                    <ul style="list-style: none; margin: 0; padding: 0;">
                        <li style="margin: 8px 0; color: #4b5563;">✅ Response within 2-4 hours (usually much faster!)</li>
                        <li style="margin: 8px 0; color: #4b5563;">📧 Email notifications for all updates</li>
                        <li style="margin: 8px 0; color: #4b5563;">🔄 Track progress in your dashboard</li>
                        <li style="margin: 8px 0; color: #4b5563;">👨‍💻 Direct communication with our Linux experts</li>
                    </ul>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="${ticketUrl}" class="cta-button">🔍 View Ticket Details</a>
                </div>

                <div style="font-size: 16px; color: #4b5563; margin-bottom: 20px;">
                    You can always check the status and add additional information by visiting your ticket page or replying to this email.
                </div>

                <div style="background: #fef3c7; padding: 20px; border-radius: 12px; margin: 25px 0;">
                    <div style="color: #92400e; font-weight: 600; margin-bottom: 8px;">🚨 Urgent Issue?</div>
                    <div style="color: #92400e; font-size: 14px;">
                        For critical server issues, use our live chat for immediate assistance at
                        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/live-chat" style="color: #8b5cf6;">oceanlinux.com/live-chat</a>
                    </div>
                </div>
            </div>

            <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center;">
                <div style="margin-bottom: 20px;">
                    <strong>🌊 OceanLinux Support Team</strong><br>
                    Available 24/7 for your success
                </div>
                <div style="font-size: 12px; margin-top: 20px;">
                    Ticket #${ticketId} • Created ${new Date().toLocaleString()}
                </div>
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

    const statusEmojis = {
      'open': '🔵',
      'in-progress': '🟡',
      'waiting-response': '🔴',
      'resolved': '✅'
    };

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
            .header { background: linear-gradient(135deg, ${statusColors[status] || '#3b82f6'} 0%, #8b5cf6 100%); padding: 40px 30px; text-align: center; }
            .update-icon { font-size: 48px; margin-bottom: 16px; }
            .status-badge { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-top: 16px; }
            .content { padding: 40px 30px; }
            .message-box { background: #f8fafc; padding: 20px; border-radius: 12px; border-left: 4px solid ${statusColors[status] || '#3b82f6'}; margin: 20px 0; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, ${statusColors[status] || '#3b82f6'} 0%, #8b5cf6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="update-icon">${statusEmojis[status] || '🔄'}</div>
                <h1 style="color: white; font-size: 28px; margin-bottom: 8px;">Ticket Updated</h1>
                <p style="color: rgba(255,255,255,0.9);">Status: ${status.replace('-', ' ').toUpperCase()}</p>
                <div class="status-badge">
                    <strong>Ticket #${ticketId}</strong>
                </div>
            </div>

            <div class="content">
                <div style="font-size: 20px; font-weight: 600; margin-bottom: 20px; color: #1f2937;">
                    Hi ${name},
                </div>

                <div style="font-size: 16px; color: #4b5563; margin-bottom: 25px;">
                    Your support ticket <strong>${ticketId}</strong> has been updated!
                </div>
<div class="message-box">
                    <h3 style="color: #1f2937; margin-bottom: 12px; font-size: 16px;">📝 Latest Update:</h3>
                    <div style="color: #4b5563; font-size: 14px; line-height: 1.6;">
                        ${lastMessage || 'Status updated by our support team.'}
                    </div>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="${ticketUrl}" class="cta-button">💬 View & Reply</a>
                </div>

                ${status === 'waiting-response' ? `
                <div style="background: #fef3c7; padding: 20px; border-radius: 12px; margin: 25px 0;">
                    <div style="color: #92400e; font-weight: 600; margin-bottom: 8px;">⚠️ Action Required</div>
                    <div style="color: #92400e; font-size: 14px;">
                        We're waiting for your response. Please reply to continue resolving your issue.
                    </div>
                </div>
                ` : ''}

                <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; border-left: 4px solid #3b82f6; margin: 25px 0;">
                    <h3 style="color: #1f2937; margin-bottom: 12px;">📋 Ticket Summary:</h3>
                    <div style="margin: 8px 0; color: #4b5563;"><strong>Subject:</strong> ${subject}</div>
                    <div style="margin: 8px 0; color: #4b5563;"><strong>Status:</strong> ${status.replace('-', ' ').toUpperCase()}</div>
                    <div style="margin: 8px 0; color: #4b5563;"><strong>Updated:</strong> ${new Date().toLocaleString()}</div>
                </div>
            </div>

            <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center;">
                <div style="margin-bottom: 20px;">
                    <strong>🌊 OceanLinux Support Team</strong><br>
                    Here to help you succeed
                </div>
                <div style="font-size: 12px; margin-top: 20px;">
                    Ticket #${ticketId} • ${status.replace('-', ' ').toUpperCase()}
                </div>
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
            .header { background: linear-gradient(135deg, #10b981 0%, #8b5cf6 100%); padding: 50px 30px; text-align: center; position: relative; overflow: hidden; }
            .success-icon { font-size: 64px; margin-bottom: 20px; animation: bounce 2s infinite; }
            @keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-10px); } 60% { transform: translateY(-5px); } }
            .header h1 { color: white; font-size: 32px; font-weight: 700; margin-bottom: 8px; }
            .header p { color: rgba(255,255,255,0.9); font-size: 18px; }
            .server-info { background: rgba(255,255,255,0.15); padding: 25px; border-radius: 16px; margin: 25px 0; }
            .server-detail { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; color: rgba(255,255,255,0.9); padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .server-detail:last-child { border-bottom: none; }
            .server-detail strong { color: white; }
            .content { padding: 40px 30px; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #8b5cf6 100%); color: white; padding: 18px 36px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 18px; margin: 20px 0; box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.3); }
            .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 30px 0; }
            .feature-item { background: #f0fdf4; padding: 20px; border-radius: 12px; text-align: center; border: 2px solid #dcfce7; }
            .feature-item .icon { font-size: 28px; margin-bottom: 8px; }
            .feature-item h4 { color: #15803d; margin-bottom: 4px; font-size: 14px; }
            .feature-item p { color: #166534; font-size: 12px; }
            .next-steps { background: linear-gradient(135deg, #f0fdf4 0%, #ecfccb 100%); padding: 30px; border-radius: 16px; margin: 30px 0; border: 1px solid #dcfce7; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="success-icon">🚀</div>
                <h1>Your Server is Ready!</h1>
                <p>Successfully deployed and configured</p>

                <div class="server-info">
                    <div class="server-detail">
                        <strong>🖥️ Server:</strong>
                        <span>${productName}</span>
                    </div>
                    <div class="server-detail">
                        <strong>🌐 IP Address:</strong>
                        <span style="font-family: monospace; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px;">${ipAddress}</span>
                    </div>
                    <div class="server-detail">
                        <strong>💰 Price:</strong>
                        <span>₹${price}/month</span>
                    </div>
                    <div class="server-detail">
                        <strong>📋 Order ID:</strong>
                        <span>${orderId}</span>
                    </div>
                </div>
            </div>

            <div class="content">
                <div style="font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1f2937;">
                    Congratulations ${name}! 🎉
                </div>

                <div style="font-size: 16px; color: #4b5563; margin-bottom: 25px; line-height: 1.7;">
                    Your Linux VPS server has been successfully deployed and is ready for use! Your server details and access credentials have been sent to your dashboard.
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="${dashboardUrl}" class="cta-button">🎛️ Access Server Dashboard</a>
                </div>

                <div class="feature-grid">
                    <div class="feature-item">
                        <div class="icon">⚡</div>
                        <h4>Instant Access</h4>
                        <p>SSH ready in 60 seconds</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon">🔧</div>
                        <h4>Full Root</h4>
                        <p>Complete control</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon">🛡️</div>
                        <h4>Secured</h4>
                        <p>DDoS protection active</p>
                    </div>
                    <div class="feature-item">
                        <div class="icon">📊</div>
                        <h4>Monitoring</h4>
                        <p>Real-time metrics</p>
                    </div>
                </div>

                <div class="next-steps">
                    <h3 style="color: #15803d; margin-bottom: 16px;">🎯 Quick Start Guide</h3>
                    <div style="display: grid; gap: 12px;">
                        <div style="display: flex; align-items: center;">
                            <span style="background: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px;">1</span>
                            <span style="color: #166534;">Check your dashboard for SSH credentials</span>
                        </div>
                        <div style="display: flex; align-items: center;">
                            <span style="background: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px;">2</span>
                            <span style="color: #166534;">Connect via SSH to your IP address</span>
                        </div>
                        <div style="display: flex; align-items: center;">
                            <span style="background: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px;">3</span>
                            <span style="color: #166534;">Start installing your applications</span>
                        </div>
                        <div style="display: flex; align-items: center;">
                            <span style="background: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px;">4</span>
                            <span style="color: #166534;">Explore our knowledge base for tutorials</span>
                        </div>
                    </div>
                </div>

                <div style="background: #fef3c7; padding: 20px; border-radius: 12px; margin: 25px 0;">
                    <div style="color: #92400e; font-weight: 600; margin-bottom: 8px;">💡 Pro Tip</div>
                    <div style="color: #92400e; font-size: 14px;">
                        Need help setting up your server? Our 24/7 support team offers free server setup assistance for all customers!
                    </div>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/live-chat" style="color: #8b5cf6; text-decoration: none; font-weight: 600; margin: 0 15px;">💬 Get Setup Help</a>
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/knowledge-base" style="color: #8b5cf6; text-decoration: none; font-weight: 600; margin: 0 15px;">📚 View Tutorials</a>
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/support" style="color: #8b5cf6; text-decoration: none; font-weight: 600; margin: 0 15px;">🎫 Create Ticket</a>
                </div>
            </div>

            <div style="background: #1f2937; color: #9ca3af; padding: 40px 30px; text-align: center;">
                <div style="margin-bottom: 20px;">
                    <strong>🌊 Welcome to OceanLinux</strong><br>
                    Your journey in the ocean of Linux begins now!
                </div>
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
            .announcement-icon { font-size: 48px; margin-bottom: 16px; }
            .header h1 { color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
            .content { padding: 40px 30px; }
            .announcement-badge { background: ${style.bg}; color: ${style.color}; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 20px; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, ${style.color} 0%, #8b5cf6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="announcement-icon">${style.icon}</div>
                <h1>📢 Important Announcement</h1>
                <p style="color: rgba(255,255,255,0.9);">From the OceanLinux Team</p>
            </div>

            <div class="content">
                <div class="announcement-badge">${type.toUpperCase()}</div>

                <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1f2937;">
                    ${title}
                </h2>

                <div style="font-size: 20px; font-weight: 600; margin-bottom: 20px; color: #1f2937;">
                    Hi ${name},
                </div>

                <div style="font-size: 16px; color: #4b5563; margin-bottom: 25px; line-height: 1.7;">
                    ${content}
                </div>

                ${actionUrl && actionText ? `
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${actionUrl}" class="cta-button">${actionText}</a>
                </div>
                ` : ''}

                <div style="background: ${style.bg}; padding: 20px; border-radius: 12px; border-left: 4px solid ${style.color}; margin: 25px 0;">
                    <div style="color: ${style.color}; font-weight: 600; margin-bottom: 8px;">Questions?</div>
                    <div style="color: ${style.color}; font-size: 14px;">
                        Our support team is available 24/7 to help you. Reach out via live chat or email anytime.
                    </div>
                </div>
            </div>

            <div style="background: #1f2937; color: #9ca3af; padding: 30px; text-align: center;">
                <div style="margin-bottom: 20px;">
                    <strong>🌊 OceanLinux Team</strong><br>
                    Keeping you informed and ahead
                </div>

                <div style="margin: 20px 0;">
                    <a href="https://oceanlinux.com" style="color: #8b5cf6; text-decoration: none; margin: 0 10px;">Website</a>
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/live-chat" style="color: #8b5cf6; text-decoration: none; margin: 0 10px;">Live Chat</a>
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/support" style="color: #8b5cf6; text-decoration: none; margin: 0 10px;">Support</a>
                </div>

                <div style="font-size: 12px; color: #6b7280; margin-top: 20px;">
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
