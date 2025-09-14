import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

// ---------- ORG ----------
const ORG = {
  brand: 'Ocean Linux',
  legal: 'Backtick Labs', // not Pvt Ltd
  tagline: 'Most Affordable Premium Linux VPS Hosting',
  address: 'Office No.311, Kohinoor Majestic, Pune - 411019',
  email: 'hello@oceanlinux.com',
  phone: '',
  gstin: '',
  showGST: false,
  gstRatePct: 0,
};
// Optional: protect with key. Call as ...?txId=...&key=XYZ
const ADMIN_KEY = process.env.INVOICE_ADMIN_KEY || '';
// -------------------------

// Emoji-stripper only (do NOT strip general Unicode so ₹ stays)
const removeEmojis = (t: string) =>
  (t || '').replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
    ''
  );
const clean = (t?: string) => removeEmojis(t || '').trim();

// Simple INR with commas, no NBSP
const formatINR = (num: number) => {
  const s = Math.round(num).toString();
  const last3 = s.slice(-3);
  const other = s.slice(0, -3);
  return other ? other.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
};

const maskSecret = (s?: string) => {
  if (!s) return '';
  if (s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0, 2) + '*'.repeat(Math.max(1, s.length - 4)) + s.slice(-2);
};

function loadFontBase64(relPath: string) {
  const abs = path.join(process.cwd(), relPath);
  const buf = fs.readFileSync(abs);
  // jsPDF expects base64 *without* data: url header for VFS
  return buf.toString('base64');
}

function ensureFonts(doc: jsPDF) {
  try {
    const regular = loadFontBase64('public/fonts/NotoSans-Regular.ttf');
    const bold = loadFontBase64('public/fonts/NotoSans-Bold.ttf');
    doc.addFileToVFS('NotoSans-Regular.ttf', regular);
    doc.addFileToVFS('NotoSans-Bold.ttf', bold);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    doc.setFont('NotoSans', 'normal');
  } catch (e) {
    // Fallback (₹ may break in Helvetica)
    doc.setFont('helvetica', 'normal');
  }
}

const getLogoBase64 = () => {
  try {
    const p = path.join(process.cwd(), 'public', 'oceanlinux.png');
    const b = fs.readFileSync(p);
    return `data:image/png;base64,${b.toString('base64')}`;
  } catch {
    return null;
  }
};

// Make product name bank/compliance friendly for invoice display only
const makeCompliantName = (raw: string) => {
  let s = clean(raw);

  // Capture & remove any leading DC/IP hint (e.g., "165.99.xx", "129.227")
  let dcHint = '';
  const dcMatch = s.match(/^\s*([0-9]{1,3}\.[0-9]{1,3}(?:\.[0-9xX]{1,3}){0,2})/);
  if (dcMatch) {
    dcHint = dcMatch[1].toUpperCase();            // "165.99.XX" / "129.227"
    s = s.slice(dcMatch[0].length).trim();        // remove from the visible name
  }

  // Normalize dashes
  s = s.replace(/[–—]/g, '-');

  // De-risking: remove/neutralize marketing/risky terms
  const reps: Array<[RegExp, string]> = [
    /\bproxies?\b/gi, '',          // remove "proxy/proxies"
    /\brotating\b/gi, '',          // remove "rotating"
    /\bpremium\b/gi, '',           // remove "premium"
    /\bprime\b/gi, '',             // remove "prime"
    /\bhigh\s*demand\b/gi, '',     // remove "high demand"
    /\blimited\s*stock\b/gi, '',   // remove "limited stock"
    /\bseries\b/gi, '',            // drop "series"
    /\blinux\b/gi, '',             // drop stray 'linux' from original to avoid duplicates
    /\bproxy\b/gi, '',             // extra safety
  ] as any;
  for (let i = 0; i < reps.length; i += 2) s = s.replace(reps[i] as RegExp, reps[i + 1] as string);

  // Decide plan tier (extend as needed)
  let plan = '';
  if (/\bgold\b/i.test(s)) plan = 'Gold Plan';
  // else if (/\bplatinum\b/i.test(s)) plan = 'Platinum Plan';
  // else if (/\bsilver\b/i.test(s)) plan = 'Silver Plan';
  else plan = 'Plan';

  // Compose final compliant name
  let out = `Linux VPS Hosting - ${plan}`;
  if (dcHint) out += ` (Data Center ${dcHint})`;
  return out;
};




const addFinalFooter = (doc: jsPDF) => {
  const darkBg = [2, 7, 19];
  const primaryBlue = [59, 130, 246];

  doc.setFillColor(...darkBg);
  doc.rect(0, 270, 210, 27, 'F');

  doc.setTextColor(...primaryBlue);
  doc.setFont('NotoSans', 'bold'); doc.setFontSize(10);
  doc.text('Thank you for choosing Ocean Linux!', 20, 280);

  doc.setTextColor(255, 255, 255);
  doc.setFont('NotoSans', 'normal'); doc.setFontSize(8);
  doc.text(ORG.tagline, 20, 286);
  doc.text(`This is a computer-generated invoice. Support: ${ORG.email}`, 20, 291);
};

const checkPageSpace = (doc: jsPDF, y: number, need: number) => {
  const pageH = 297, footer = 30;
  if (y + need > pageH - footer) {
    doc.addPage();
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 297, 'F');
    return 30;
  }
  return y;
};

const drawLabelValue = (
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  labelColor = [71, 85, 105]
) => {
  doc.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
  doc.setFont('NotoSans', 'bold'); doc.setFontSize(9);
  if (label) doc.text(label, x, y);
  doc.setFont('NotoSans', 'normal'); doc.setTextColor(0, 0, 0);
  const lines = doc.splitTextToSize(value, maxWidth);
  doc.text(lines, x, y + (label ? 5 : 0));
  const height = (label ? 5 : 0) + lines.length * 5;
  return y + height;
};

export async function GET(req: NextRequest) {
  try {
    const txId = req.nextUrl.searchParams.get('txId') || '';
    const key = req.nextUrl.searchParams.get('key') || '';
    if (!txId) return NextResponse.json({ error: 'Query param txId is required' }, { status: 400 });
    if (ADMIN_KEY && key !== ADMIN_KEY) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await connectDB();
    const order = await Order.findOne({ transactionId: txId }).lean();
    if (!order) return NextResponse.json({ error: 'Order not found for this transactionId' }, { status: 404 });

    // Pull fields
    const productNameRaw = clean(order.productName || 'N/A');
    const productName = makeCompliantName(productNameRaw);

    const memory = clean(order.memory || 'N/A');
    const customerName = clean(order.customerName || 'N/A');
    const customerEmail = clean(order.customerEmail || 'N/A');
    const ip = clean(order.ipAddress || '');
    const uname = clean(order.username || '');
    const passwd = clean(order.password || '');
    const os = clean(order.os || '');
    const gatewayOrderId = clean(order.gatewayOrderId || '');
    const clientTxnId = clean(order.clientTxnId || '');
    const createdAt = new Date(order.createdAt || new Date());
    const expiry = order.expiryDate ? new Date(order.expiryDate as any) : null;
    const status = (order.status || 'pending').toString();

    const price = Number(order.price ?? order.originalPrice ?? 0);
    const promoDiscount = Number(order.promoDiscount ?? 0);
    const total = price; // No GST

    // Build PDF
    const doc = new jsPDF();
    ensureFonts(doc);

    const darkBg = [2, 7, 19];
    const lightGray = [248, 250, 252];
    const darkGray = [71, 85, 105];
    const green = [34, 197, 94];

    // BG + Header
    doc.setFillColor(...lightGray); doc.rect(0, 0, 210, 297, 'F');
    doc.setFillColor(...darkBg); doc.rect(0, 0, 210, 66, 'F');

    const logo = getLogoBase64();
    if (logo) { try { doc.addImage(logo, 'PNG', 20, 16, 28, 28); } catch { } }

    doc.setTextColor(255, 255, 255);
    doc.setFont('NotoSans', 'bold'); doc.setFontSize(22);
    doc.text(ORG.brand, logo ? 55 : 20, 30);
    doc.setFont('NotoSans', 'normal'); doc.setFontSize(11);
    doc.text(ORG.tagline, logo ? 55 : 20, 38);
    // Corporate subline
    doc.setFont('NotoSans', 'bold');
    doc.text(`A product by ${ORG.legal}`, logo ? 55 : 20, 46);

    // Invoice meta
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, 78, 170, 36, 5, 5, 'F');

    doc.setTextColor(...darkGray);
    doc.setFont('NotoSans', 'bold'); doc.setFontSize(10);
    doc.text('INVOICE DETAILS', 25, 88);

    const invoiceSuffix = order._id.toString().slice(-8).toUpperCase();
    doc.setFont('NotoSans', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);
    doc.text(`Invoice #: OL-${invoiceSuffix}`, 25, 96);
    doc.text(`Invoice Date: ${createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, 25, 102);
    // Avoid Unicode arrow; use "to"
    const servicePeriod = `Service Period: ${createdAt.toLocaleDateString('en-IN')}${expiry ? ` to ${expiry.toLocaleDateString('en-IN')}` : ''}`;
    doc.text(servicePeriod, 25, 108);

    // Status chip
    const statusX = 140;
    if (status === 'completed') doc.setFillColor(...green);
    else if (status === 'pending') doc.setFillColor(255, 193, 7);
    else doc.setFillColor(220, 53, 69);
    doc.roundedRect(statusX, 92, 30, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('NotoSans', 'bold'); doc.setFontSize(8);
    doc.text(status.toUpperCase(), statusX + 3, 98);

    // BILL TO / FROM
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, 122, 80, 48, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('NotoSans', 'bold'); doc.setFontSize(10);
    doc.text('BILL TO', 25, 132);
    doc.setFont('NotoSans', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);
    let yBill = 139;
    yBill = drawLabelValue(doc, '', customerName, 25, yBill, 70);
    yBill = drawLabelValue(doc, '', customerEmail, 25, yBill + 2, 70);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(110, 122, 80, 60, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('NotoSans', 'bold'); doc.setFontSize(10);
    doc.text('FROM', 115, 132);
    doc.setFont('NotoSans', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);
    let yFrom = 139;
    yFrom = drawLabelValue(doc, '', ORG.brand, 115, yFrom, 70);
    yFrom = drawLabelValue(doc, '', ORG.legal, 115, yFrom + 1, 70);
    yFrom = drawLabelValue(doc, '', ORG.address, 115, yFrom + 1, 70);
    yFrom = drawLabelValue(doc, '', `${ORG.email}${ORG.phone ? ` • ${ORG.phone}` : ''}`, 115, yFrom + 1, 70);
    // no GST line (non-GST invoice)

    // Table header
    let y = 188;
    y = checkPageSpace(doc, y, 18);
    doc.setFillColor(...darkBg);
    doc.roundedRect(20, y, 170, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('NotoSans', 'bold'); doc.setFontSize(10);
    doc.text('SERVICE DESCRIPTION', 25, y + 8);
    doc.text('CONFIGURATION', 125, y + 8);
    y += 12;

    // Row
    doc.setFillColor(255, 255, 255);
    doc.rect(20, y, 170, 18, 'F');
    doc.setTextColor(0, 0, 0); doc.setFont('NotoSans', 'normal'); doc.setFontSize(9);

    const descLines = doc.splitTextToSize(productName, 95);
    const cfgText = `RAM: ${memory}${os ? ` • OS: ${os}` : ''}`;
    const cfgLines = doc.splitTextToSize(cfgText, 60);

    doc.text(descLines, 25, y + 6);
    doc.text(cfgLines, 125, y + 6);

    doc.setFont('NotoSans', 'bold');
    doc.text(`Rs ${formatINR(price)}`, 175, y + 6, { align: 'right' });

    const rowHeight = Math.max(descLines.length, cfgLines.length) * 5 + 10;
    y += rowHeight + 6;

    // Promo
    if (promoDiscount > 0 && order.promoCode) {
      doc.setFont('NotoSans', 'normal'); doc.setTextColor(34, 197, 94); doc.setFontSize(9);
      doc.text(`Promo Applied: ${clean(order.promoCode)} (−Rs ${formatINR(promoDiscount)})`, 20, y);
      y += 8;
    }

    // Totals (no GST)
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(120, y, 70, 22, 3, 3, 'F');
    doc.setTextColor(2, 7, 19); doc.setFont('NotoSans', 'bold'); doc.setFontSize(11);
    doc.text('TOTAL', 125, y + 12);
    doc.text(`Rs ${formatINR(total)}`, 185, y + 12, { align: 'right' });
    y += 28;

    // Service & delivery
    y = checkPageSpace(doc, y, 60);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, y, 170, 44, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('NotoSans', 'bold'); doc.setFontSize(10);
    doc.text('SERVICE & DELIVERY DETAILS', 25, y + 10);
    doc.setFont('NotoSans', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);

    let dY = y + 16;
    const deliveryLines = [
      ip ? `Server / IP: ${ip}` : '',
      uname ? `Username: ${uname}` : '',
      passwd ? `Password: ${maskSecret(passwd)} (masked)` : '',
      os ? `OS: ${os}` : '',
      // show provisioning line only if status is not "failed"
      (order.provisioningStatus !== 'failed'
        ? `Provisioning: ${order.autoProvisioned ? 'Auto-Provisioned' : 'Manual'} • Status: ${order.provisioningStatus || order.status || 'N/A'}`
        : 'Provisioning: Manual'),
      `Delivery Note: Service activated on ${createdAt.toLocaleString('en-IN')} and details shared via dashboard/email.`,
      expiry ? `Valid Until: ${expiry.toLocaleDateString('en-IN')}` : '',
    ].filter(Boolean);

    deliveryLines.forEach(line => {
      const lines = doc.splitTextToSize(line, 160);
      doc.text(lines, 25, dY);
      dY += lines.length * 5;
    });

    y = dY + 6;

    // Payment info
    y = checkPageSpace(doc, y, 36);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, y, 170, 30, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('NotoSans', 'bold'); doc.setFontSize(10);
    doc.text('PAYMENT INFORMATION', 25, y + 10);
    doc.setFont('NotoSans', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(8);

    let pY = y + 16;
    const payLines = [
      `Razorpay Payment ID: ${txId}`,
      gatewayOrderId ? `Razorpay Order ID: ${gatewayOrderId}` : '',
      clientTxnId ? `Client Txn ID: ${clientTxnId}` : '',
      `Payment Status: ${status}`,
      `Payment Date: ${createdAt.toLocaleString('en-IN')}`,
    ].filter(Boolean);

    payLines.forEach(line => {
      const lines = doc.splitTextToSize(line, 160);
      doc.text(lines, 25, pY);
      pY += lines.length * 4.6;
    });

    // Notes / Terms (explicitly non-GST)
    y = checkPageSpace(doc, pY + 6, 30);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, y, 170, 26, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('NotoSans', 'bold'); doc.setFontSize(9);
    doc.text('NOTES / TERMS', 25, y + 8);
    doc.setFont('NotoSans', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(8);
    const terms = doc.splitTextToSize(
      `This invoice is issued by Ocean Linux (Backtick Labs). Digital services once provisioned are non-returnable. We offer a 7-day money-back guarantee on new orders (subject to eligibility). Disputes: Pune jurisdiction. For support or refund requests, write to ${ORG.email}.`,
      162
    );

    doc.text(terms, 25, y + 14);

    // Footer
    addFinalFooter(doc);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const file = `oceanlinux-invoice-OL-${invoiceSuffix}.pdf`;
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${file}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (e) {
    console.error('Invoice generation error:', e);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}
