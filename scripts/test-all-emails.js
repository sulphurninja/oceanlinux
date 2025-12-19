/**
 * OceanLinux Email Templates Test Script
 * 
 * Tests ALL email templates by sending them to a specified email address.
 * 
 * Usage: node scripts/test-all-emails.js [email]
 * Default: sulphurninja@gmail.com
 * 
 * Make sure SMTP is configured in .env:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL
 */

require('dotenv').config();

const EmailService = require('../src/lib/sendgrid');

const TEST_EMAIL = process.argv[2] || 'sulphurninja@gmail.com';
const TEST_NAME = 'Aditya';

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testAllEmails() {
  console.log('\n' + '='.repeat(60));
  console.log('🌊 OceanLinux Email Templates Test Suite');
  console.log('='.repeat(60));
  console.log(`📧 Sending all emails to: ${TEST_EMAIL}`);
  console.log(`👤 Test name: ${TEST_NAME}`);
  console.log('='.repeat(60) + '\n');

  const emailService = new EmailService();

  if (!emailService.isConfigured) {
    console.error('❌ Email service not configured!');
    console.error('   Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    process.exit(1);
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;

  // Test data
  const testOrder = {
    _id: 'TEST123456789',
    productName: '🌊 OceanLinux Premium VPS (4GB RAM)',
    price: 949,
    ipAddress: '103.101.116.203',
    expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
  };

  const testTicket = {
    ticketId: 'TKT-2024-001',
    subject: 'Need help setting up proxy on my VPS',
    category: 'Technical Support',
    status: 'in-progress',
  };

  const testAnnouncement = {
    title: '🎉 New Feature: One-Click Proxy Setup',
    content: `We're excited to announce our new Proxy Setup Tool! 

Now you can set up a Squid proxy on your VPS with just a few clicks - no command line required.

Features:
✅ Automatic OS detection (Ubuntu & CentOS)
✅ Secure authentication setup
✅ Firewall configuration included
✅ Works on all OceanLinux VPS plans

Try it now in your dashboard under "Scripts & Tools"!`,
    type: 'feature',
    actionUrl: 'https://oceanlinux.com/dashboard/scripts',
    actionText: '🚀 Try Proxy Setup Tool',
  };

  // ==================== TEST 1: Welcome Email ====================
  console.log('📨 [1/10] Testing Welcome Email...');
  try {
    const result = await emailService.sendWelcomeEmail(TEST_EMAIL, TEST_NAME);
    if (result.success) {
      console.log('   ✅ Welcome email sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Welcome', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Welcome', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 2: Password Reset Email ====================
  console.log('📨 [2/10] Testing Password Reset Email...');
  try {
    const result = await emailService.sendForgotPasswordEmail(
      TEST_EMAIL, 
      TEST_NAME, 
      'test-reset-token-abc123xyz'
    );
    if (result.success) {
      console.log('   ✅ Password reset email sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Password Reset', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Password Reset', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 3: Order Success Email ====================
  console.log('📨 [3/10] Testing Order Success Email...');
  try {
    const result = await emailService.sendOrderSuccessEmail(
      TEST_EMAIL,
      TEST_NAME,
      testOrder._id,
      testOrder.productName,
      testOrder.price,
      testOrder.ipAddress,
      { username: 'root', password: 'TestPass@123' }
    );
    if (result.success) {
      console.log('   ✅ Order success email sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Order Success', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Order Success', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 4: Renewal Success Email ====================
  console.log('📨 [4/10] Testing Renewal Success Email...');
  try {
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = await emailService.sendRenewalSuccessEmail(
      TEST_EMAIL,
      TEST_NAME,
      testOrder._id,
      testOrder.productName,
      testOrder.price,
      testOrder.ipAddress,
      newExpiry
    );
    if (result.success) {
      console.log('   ✅ Renewal success email sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Renewal Success', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Renewal Success', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 5: Expiry Reminder (7 days) ====================
  console.log('📨 [5/10] Testing Expiry Reminder (7 days)...');
  try {
    const result = await emailService.sendExpiryReminderEmail(
      TEST_EMAIL,
      TEST_NAME,
      testOrder._id,
      testOrder.productName,
      testOrder.ipAddress,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      7
    );
    if (result.success) {
      console.log('   ✅ Expiry reminder (7 days) sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Expiry (7 days)', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Expiry (7 days)', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 6: Expiry Reminder (1 day - URGENT) ====================
  console.log('📨 [6/10] Testing Expiry Reminder (1 day - URGENT)...');
  try {
    const result = await emailService.sendExpiryReminderEmail(
      TEST_EMAIL,
      TEST_NAME,
      testOrder._id,
      testOrder.productName,
      testOrder.ipAddress,
      new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      1
    );
    if (result.success) {
      console.log('   ✅ Expiry reminder (1 day) sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Expiry (1 day)', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Expiry (1 day)', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 7: Service Suspended ====================
  console.log('📨 [7/10] Testing Service Suspended Email...');
  try {
    const result = await emailService.sendServiceSuspendedEmail(
      TEST_EMAIL,
      TEST_NAME,
      testOrder._id,
      testOrder.productName,
      testOrder.ipAddress
    );
    if (result.success) {
      console.log('   ✅ Service suspended email sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Service Suspended', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Service Suspended', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 8: Ticket Created ====================
  console.log('📨 [8/10] Testing Ticket Created Email...');
  try {
    const result = await emailService.sendTicketCreatedEmail(
      TEST_EMAIL,
      TEST_NAME,
      testTicket.ticketId,
      testTicket.subject,
      testTicket.category
    );
    if (result.success) {
      console.log('   ✅ Ticket created email sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Ticket Created', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Ticket Created', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 9: Ticket Update ====================
  console.log('📨 [9/10] Testing Ticket Update Email...');
  try {
    const result = await emailService.sendTicketUpdateEmail(
      TEST_EMAIL,
      TEST_NAME,
      testTicket.ticketId,
      testTicket.subject,
      'in-progress',
      'Hi Aditya, I\'ve looked into your request. To set up the proxy, please go to Dashboard > Scripts & Tools > Proxy Setup. Enter your server credentials and click "Setup Proxy". Let me know if you need any help! - OceanLinux Support'
    );
    if (result.success) {
      console.log('   ✅ Ticket update email sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Ticket Update', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Ticket Update', success: false });
    failCount++;
  }
  await delay(2000);

  // ==================== TEST 10: Announcement ====================
  console.log('📨 [10/10] Testing Announcement Email...');
  try {
    const result = await emailService.sendAnnouncementEmail(
      TEST_EMAIL,
      TEST_NAME,
      testAnnouncement
    );
    if (result.success) {
      console.log('   ✅ Announcement email sent successfully!');
      successCount++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failCount++;
    }
    results.push({ type: 'Announcement', success: result.success });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.push({ type: 'Announcement', success: false });
    failCount++;
  }

  // ==================== SUMMARY ====================
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  results.forEach((r, i) => {
    console.log(`   ${r.success ? '✅' : '❌'} ${r.type}`);
  });
  
  console.log('='.repeat(60));
  console.log(`📈 Success: ${successCount}/10 | Failed: ${failCount}/10`);
  console.log('='.repeat(60));
  
  if (successCount === 10) {
    console.log('\n🎉 ALL EMAILS SENT SUCCESSFULLY!');
    console.log(`📬 Check your inbox at: ${TEST_EMAIL}`);
    console.log('   (Also check spam/promotions folder)\n');
  } else if (successCount > 0) {
    console.log('\n⚠️ Some emails failed. Check the errors above.');
    console.log(`📬 Check your inbox at: ${TEST_EMAIL} for the ones that succeeded.\n`);
  } else {
    console.log('\n❌ All emails failed! Check your SMTP configuration.');
    console.log('   Make sure SMTP_HOST, SMTP_USER, SMTP_PASS are correct.\n');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

// Run the tests
testAllEmails().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
