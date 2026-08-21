require('dotenv').config();

const EmailService = require('../src/lib/sendgrid');

const TO = process.argv[2] || 'oceanlinux1102@gmail.com';

async function main() {
  const svc = new EmailService();
  console.log('transport:', svc.transport, '| from:', svc.fromEmail);

  let result = await svc.sendAnnouncementEmail(
    TO,
    'OceanLinux User',
    {
      title: '🚀 10 Websites Par VPS Search Karna Band Karo! Sab Kuch Ek Hi Jagah 🌊',
      content:
        'OceanLinux ab sab providers ek hi dashboard par — ADVPS, SmartVps, Netbay aur bhi. Yeh test announcement email hai.',
      type: 'feature',
      actionUrl: 'https://oceanlinux.com/dashboard',
      actionText: 'Visit Dashboard',
    }
  );

  if (!result.success && process.env.EMAIL_SMTP_FALLBACK !== 'false') {
    console.log('Announcement path failed, retrying with SMTP allowed...');
    result = await svc.sendEmail({
      to: TO,
      subject: '🚀 10 Websites Par VPS Search Karna Band Karo! Sab Kuch Ek Hi Jagah 🌊 - OceanLinux',
      allowSmtpFallback: true,
      html: '<p>Test fallback — check inbox</p>',
    });
  }

  if (!result.success) {
    console.error('FAILED:', result.error);
    process.exit(1);
  }

  console.log('SUCCESS via', result.provider || 'unknown', '| id:', result.messageId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
