/**
 * Email Service Test Script
 * 
 * Run with: node scripts/test-email.js your-email@example.com
 * 
 * Make sure to set these env vars first:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL
 */

require('dotenv').config();

const nodemailer = require('nodemailer');

async function testEmail() {
  const testEmail = process.argv[2];
  
  if (!testEmail) {
    console.error('❌ Usage: node scripts/test-email.js your-email@example.com');
    process.exit(1);
  }

  console.log('🔍 Checking SMTP Configuration...\n');
  
  const config = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT || '587',
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS ? '***configured***' : '❌ NOT SET',
    SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || 'hello@oceanlinux.com',
  };

  console.log('📋 SMTP Configuration:');
  Object.entries(config).forEach(([key, value]) => {
    console.log(`   ${key}: ${value || '❌ NOT SET'}`);
  });
  console.log('');

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ Missing required SMTP configuration!');
    console.error('   Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file');
    process.exit(1);
  }

  console.log('📧 Creating transporter...');
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  console.log('🔌 Verifying SMTP connection...');
  
  try {
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');
  } catch (error) {
    console.error('❌ SMTP connection failed:', error.message);
    console.error('\nPossible issues:');
    console.error('   - Check SMTP_HOST, SMTP_USER, SMTP_PASS are correct');
    console.error('   - Verify AWS SES credentials are valid');
    console.error('   - Check if your IP is allowed in AWS SES');
    process.exit(1);
  }

  console.log(`📤 Sending test email to: ${testEmail}`);

  try {
    const result = await transporter.sendMail({
      from: {
        name: 'OceanLinux Team',
        address: process.env.SMTP_FROM_EMAIL || 'hello@oceanlinux.com',
      },
      to: testEmail,
      subject: '🌊 OceanLinux Email Test - AWS SES Working!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); padding: 40px; border-radius: 16px 16px 0 0; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; }
            .content { background: white; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px; }
            .success { background: #dcfce7; border: 1px solid #22c55e; padding: 20px; border-radius: 12px; margin: 20px 0; }
            .success h2 { color: #15803d; margin: 0 0 10px 0; }
            .info { background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🌊 OceanLinux</h1>
            </div>
            <div class="content">
              <div class="success">
                <h2>✅ Email Service Working!</h2>
                <p>If you're seeing this, AWS SES is configured correctly and emails are being delivered.</p>
              </div>
              
              <div class="info">
                <strong>📊 Configuration Details:</strong>
                <ul style="margin: 10px 0; padding-left: 20px; color: #4b5563;">
                  <li>SMTP Host: ${process.env.SMTP_HOST}</li>
                  <li>SMTP Port: ${process.env.SMTP_PORT || '587'}</li>
                  <li>From Email: ${process.env.SMTP_FROM_EMAIL || 'hello@oceanlinux.com'}</li>
                  <li>Sent At: ${new Date().toISOString()}</li>
                </ul>
              </div>
              
              <p style="color: #4b5563;">
                Your OceanLinux email service is now ready to send:
              </p>
              <ul style="color: #4b5563;">
                <li>Password reset emails</li>
                <li>Welcome emails</li>
                <li>Order confirmations</li>
                <li>Server provisioning notifications</li>
                <li>Support ticket updates</li>
              </ul>
              
              <div class="footer">
                <p>🌊 OceanLinux - The Ocean of Linux</p>
                <p>Test email sent at ${new Date().toLocaleString()}</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log('\n✅ TEST EMAIL SENT SUCCESSFULLY!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   Accepted: ${result.accepted?.join(', ') || 'N/A'}`);
    console.log(`\n📬 Check ${testEmail} for the test email!`);
    
  } catch (error) {
    console.error('\n❌ Failed to send test email:', error.message);
    
    if (error.responseCode === 554) {
      console.error('\n⚠️  Error 554 usually means:');
      console.error('   - Your SES account is in Sandbox mode');
      console.error('   - The recipient email is not verified');
      console.error('   - Request Production Access in AWS SES Console');
    }
    
    process.exit(1);
  }
}

testEmail();



