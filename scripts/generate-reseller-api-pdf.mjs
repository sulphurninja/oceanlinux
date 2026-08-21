/**
 * Generate OceanLinux Reseller API PDF — run: node scripts/generate-reseller-api-pdf.mjs
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'OCEANLINUX_RESELLER_API.pdf');

function section(doc, title, bodyLines = []) {
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor('#0050a0').font('Helvetica-Bold').text(title);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#1e1e1e').font('Helvetica');
  for (const line of bodyLines) {
    if (line.startsWith('```')) continue;
    doc.text(line, { lineGap: 3 });
  }
}

function code(doc, text) {
  doc.moveDown(0.2);
  doc.fontSize(8.5).fillColor('#222').font('Courier');
  doc.text(text.trim(), { lineGap: 2 });
  doc.font('Helvetica').fontSize(10);
  doc.moveDown(0.3);
}

const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
const stream = fs.createWriteStream(OUT);
doc.pipe(stream);

// Title page
doc.fontSize(28).fillColor('#0050a0').font('Helvetica-Bold').text('OceanLinux', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(20).fillColor('#1e1e1e').text('Reseller API Documentation', { align: 'center' });
doc.moveDown(1);
doc.fontSize(12).fillColor('#444').font('Helvetica').text('Partner Integration Guide  |  Version 1.0  |  June 2025', { align: 'center' });
doc.moveDown(2);
doc.fontSize(11).text(
  'Integrate VPS hosting into your website or billing panel.\nBuy servers, manage power, sync credentials, and renew — all via REST API.',
  { align: 'center', lineGap: 4 }
);

doc.addPage();

section(doc, '1. Base URL & Authentication', [
  'Base URL: https://oceanlinux.com/api/v1/reseller',
  '',
  'Required headers on EVERY request:',
]);
code(doc, `x-api-key:    rz_YOUR_API_KEY\nx-api-secret: sec_YOUR_API_SECRET`);
doc.text('IMPORTANT: Never expose API Secret in frontend JavaScript. Call API from backend only.', { lineGap: 3 });

section(doc, '2. Quick Start Flow', [
  'GET  /products                 → Stock + your prices',
  'POST /orders                   → Buy server',
  'GET  /orders/{orderId}         → IP + password (poll 15 sec)',
  'GET  /orders/{orderId}/status  → Online / offline',
  'POST /orders/manage            → Start / stop / restart / reinstall',
  'POST /orders/{orderId}/sync    → Sync IP, password, validity',
  'POST /orders/{orderId}/renew   → Renew service',
]);

section(doc, '3. Account & Wallet', [
  'GET /account — business info, balance, totalRecharged, totalSpent, totalOrders',
  'GET /wallet  — balance + transaction history with rates',
]);

section(doc, '4. Products', [
  'GET /products — all products with YOUR custom prices',
  'GET /products?id=PRODUCT_ID — single product',
  '"price" = your rate | "basePrice" = reference only',
]);

doc.addPage();

section(doc, '5. Buy Server — POST /orders', []);
code(doc, `{
  "productId": "65a1b2c3...",
  "memoryOption": "4GB",
  "userEmail": "customer@yourdomain.com",
  "os": "Ubuntu 22"
}`);
doc.text('OS: Ubuntu 22 | CentOS 7 | Windows 2022 64. Poll GET /orders/{id} until IP + password ready (2-5 min).', { lineGap: 3 });

section(doc, '6. Orders', [
  'GET /orders — list all orders with price, IP, credentials',
  'GET /orders/{orderId} — detail + management.supportedActions',
]);

section(doc, '7. Status — GET /orders/{orderId}/status', []);
code(doc, `{ "online": true, "powerState": "running" }`);
doc.text('running = ON | stopped = OFF (same as OceanLinux panel)', { lineGap: 3 });

section(doc, '8. Sync — POST /orders/{orderId}/sync', [
  'Pull latest IP, username, password, validity from OceanLinux.',
  'Use after reinstall or credential change.',
]);
code(doc, `{
  "ipAddress": "103.179.xx.xx",
  "username": "root",
  "password": "NewPass123",
  "validity": {
    "expiryDate": "2025-08-20T00:00:00.000Z",
    "daysRemaining": 28,
    "status": "active"
  }
}`);

doc.addPage();

section(doc, '9. Manage — POST /orders/manage', []);
code(doc, `{ "orderId": "65b...", "action": "start" }`);
section(doc, 'Actions:', [
  'start | stop | restart | status | sync',
  'reinstall — format/rebuild (osType: ubuntu/centos/windows)',
  'changeos — change OS (SmartVPS products)',
]);
doc.text('After reinstall: wait 3-5 min → POST /orders/{id}/sync for new password.', { lineGap: 3 });

section(doc, '10. Renew', [
  'GET  /orders/{orderId}/renew — check price & eligibility',
  'POST /orders/{orderId}/renew — wallet deduct + extend expiry',
]);

section(doc, '11. Error Codes', [
  '200 Success | 201 Order created | 401 Invalid credentials',
  '402 Insufficient balance | 403 Suspended | 404 Not found | 409 Out of stock',
]);

doc.addPage();

section(doc, '12. cURL Examples', []);

doc.fontSize(11).fillColor('#0050a0').font('Helvetica-Bold').text('Buy server');
code(doc, `curl -X POST "https://oceanlinux.com/api/v1/reseller/orders" \\
  -H "x-api-key: rz_YOUR_KEY" \\
  -H "x-api-secret: sec_YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"productId":"ID","memoryOption":"4GB","userEmail":"client@mail.com"}'`);

doc.fontSize(11).fillColor('#0050a0').font('Helvetica-Bold').text('Check status');
code(doc, `curl "https://oceanlinux.com/api/v1/reseller/orders/ORDER_ID/status" \\
  -H "x-api-key: rz_YOUR_KEY" \\
  -H "x-api-secret: sec_YOUR_SECRET"`);

doc.fontSize(11).fillColor('#0050a0').font('Helvetica-Bold').text('Sync credentials');
code(doc, `curl -X POST "https://oceanlinux.com/api/v1/reseller/orders/ORDER_ID/sync" \\
  -H "x-api-key: rz_YOUR_KEY" \\
  -H "x-api-secret: sec_YOUR_SECRET"`);

doc.fontSize(11).fillColor('#0050a0').font('Helvetica-Bold').text('Stop server');
code(doc, `curl -X POST "https://oceanlinux.com/api/v1/reseller/orders/manage" \\
  -H "x-api-key: rz_YOUR_KEY" \\
  -H "x-api-secret: sec_YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"orderId":"ORDER_ID","action":"stop"}'`);

doc.moveDown(2);
doc.fontSize(12).fillColor('#0050a0').font('Helvetica-Bold').text('Support');
doc.fontSize(10).fillColor('#1e1e1e').font('Helvetica').text('Email: support@oceanlinux.com', { lineGap: 4 });
doc.fontSize(9).fillColor('#666').font('Helvetica-Oblique').text('© OceanLinux — Reseller Partner API v1.0', { align: 'center' });

// Page numbers
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor('#888').text(
    `Page ${i + 1} of ${range.count}  |  support@oceanlinux.com`,
    50,
    doc.page.height - 40,
    { align: 'center', width: doc.page.width - 100 }
  );
}

doc.end();

stream.on('finish', () => {
  console.log('PDF created:', OUT);
});

stream.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
