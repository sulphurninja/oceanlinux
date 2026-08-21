/**
 * Email Service Test Script
 *
 * Run with: bun scripts/test-email.js your-email@example.com
 *
 * Configure one provider in .env:
 *   ZeptoMail: ZEPTOMAIL_API_KEY (+ EMAIL_FROM verified in ZeptoMail)
 *   Resend:    RESEND_API_KEY
 *   SMTP:      SMTP_HOST, SMTP_USER, SMTP_PASS
 *
 * Optional: EMAIL_PROVIDER=zeptomail|resend|smtp
 */

require('dotenv').config();

const EmailService = require('../src/lib/sendgrid');

async function testEmail() {
  const testEmail = process.argv[2];

  if (!testEmail) {
    console.error('❌ Usage: bun scripts/test-email.js your-email@example.com');
    process.exit(1);
  }

  const emailService = new EmailService();

  console.log('🔍 Email transport:', emailService.transport || 'none');
  if (emailService.transport === 'both') {
    console.log('🔁 Strategy:', process.env.EMAIL_STRATEGY || 'round-robin');
    if ((process.env.EMAIL_STRATEGY || '').includes('quota')) {
      try {
        const q = require('../src/lib/emailProviderQuota');
        const status = await q.getResendQuotaStatus();
        console.log(`📊 Resend today: ${status.count}/${status.limit} (${status.remaining} remaining)`);
      } catch {
        /* quota info optional in test script */
      }
    }
  }
  console.log('📋 From:', `${emailService.fromName} <${emailService.fromEmail}>`);
  console.log('');

  if (!emailService.isConfigured) {
    console.error('❌ Email service not configured!');
    console.error('   Set one of:');
    console.error('   - ZEPTOMAIL_API_KEY (from https://zeptomail.zoho.in → Agent → SMTP/API)');
    console.error('   - RESEND_API_KEY');
    console.error('   - SMTP_HOST + SMTP_USER + SMTP_PASS');
    process.exit(1);
  }

  console.log(`📤 Sending test email to: ${testEmail}`);

  const result = await emailService.sendEmail({
    to: testEmail,
    subject: '🌊 OceanLinux Email Test',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h1 style="color:#8b5cf6;">✅ Email Working!</h1>
        <p>Provider: <strong>${emailService.transport}</strong></p>
        <p>Sent at: ${new Date().toLocaleString('en-IN')}</p>
        <p style="color:#64748b;">OceanLinux transactional email test.</p>
      </div>
    `,
  });

  if (!result.success) {
    console.error('\n❌ Failed:', result.error);
    process.exit(1);
  }

  console.log('\n✅ TEST EMAIL SENT SUCCESSFULLY!');
  console.log(`   Message ID: ${result.messageId}`);
  console.log(`\n📬 Check ${testEmail} inbox (and spam folder).`);
}

testEmail();
