import { NextRequest, NextResponse } from 'next/server';
import { getDataFromToken } from '@/helper/getDataFromToken';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

// -------- ORG CONSTANTS (edit as needed) ----------
const ORG = {
  brand: 'Ocean Linux',
  legal: 'Backtick Labs',
  tagline: 'Most Affordable Premium Linux VPS Hosting',
  address: 'Office No.311, Kohinoor Majestic, Pune - 411019',
  email: 'hello@oceanlinux.com',
  phone: '', // optional
  gstin: '', // e.g. '27ABCDE1234F1Z5' or leave empty
  showGST: false, // flip to true if you want GST lines calculated/shown
  gstRatePct: 18, // if showGST=true, apply CGST/SGST/IGST as per your state rules
};
// --------------------------------------------------

// Remove emojis (keep full text otherwise)
const removeEmojis = (text: string) =>
  (text || '').replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
    ''
  );

const clean = (t?: string) => removeEmojis(t || '').trim();

// Load logo from /public/oceanlinux.png (optional)
const getLogoBase64 = () => {
  try {
    const p = path.join(process.cwd(), 'public', 'oceanlinux.png');
    const b = fs.readFileSync(p);
    return `data:image/png;base64,${b.toString('base64')}`;
  } catch {
    return null;
  }
};

// Add final footer on last page
const addFinalFooter = (doc: jsPDF) => {
  const darkBg = [2, 7, 19];
  const primaryBlue = [59, 130, 246];

  doc.setFillColor(...darkBg);
  doc.rect(0, 270, 210, 27, 'F');

  doc.setTextColor(...primaryBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Thank you for choosing Ocean Linux!', 20, 280);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(ORG.tagline, 20, 286);
  const support = `This is a computer-generated invoice. Support: ${ORG.email}`;
  doc.text(support, 20, 291);
};

// Paging helper
const checkPageSpace = (doc: jsPDF, y: number, need: number) => {
  const pageH = 297, footer = 30;
  if (y + need > pageH - footer) {
    doc.addPage();
    // light background
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 297, 'F');
    return 30;
  }
  return y;
};

// Multi-line draw
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
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const lines = doc.splitTextToSize(value, maxWidth);
  doc.text(lines, x, y + 5);
  const height = 5 + lines.length * 5;
  return y + height;
};

// Mask secrets safely
const maskSecret = (s?: string) => {
  if (!s) return '';
  if (s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0, 2) + '*'.repeat(Math.max(1, s.length - 4)) + s.slice(-2);
};

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const token = request.cookies.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let userId: string;
    try {
      userId = getDataFromToken(request);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const order = await Order.findOne({ _id: orderId, user: userId }).lean();
    const user = await User.findById(userId).lean();
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Gather fields (full text kept, no truncation)
    const productName = clean(order.productName || 'N/A');
    const memory = clean(order.memory || 'N/A');
    const customerName = clean(order.customerName || user.name || 'N/A');
    const customerEmail = clean(order.customerEmail || user.email || 'N/A');
    const ip = clean(order.ipAddress || '');
    const uname = clean(order.username || '');
    const passwd = clean(order.password || '');
    const os = clean(order.os || '');
    const txId = clean(order.transactionId || '');
    const gwOrderId = clean(order.gatewayOrderId || '');
    const clientTxnId = clean(order.clientTxnId || '');
    const createdAt = new Date(order.createdAt || new Date());
    const expiry = order.expiryDate ? new Date(order.expiryDate as any) : null;

    // Amounts
    const gross = Number(order.originalPrice ?? order.price ?? 0);
    const discount = Number(order.promoDiscount ?? 0);
    const netBeforeTax = Number(order.price ?? gross) - (ORG.showGST ? 0 : 0); // when GST shown, compute below
    const taxable = ORG.showGST ? (Number(order.price ?? gross)) * (100 / (100 + ORG.gstRatePct)) : Number(order.price ?? gross);
    const gstAmt = ORG.showGST ? Math.round((taxable * ORG.gstRatePct) / 100) : 0;
    const total = ORG.showGST ? Math.round(taxable + gstAmt) : Number(order.price ?? gross);

    // Start PDF
    const doc = new jsPDF();
    const darkBg = [2, 7, 19];
    const lightGray = [248, 250, 252];
    const darkGray = [71, 85, 105];
    const green = [34, 197, 94];

    // Background
    doc.setFillColor(...lightGray);
    doc.rect(0, 0, 210, 297, 'F');

    // Header
    doc.setFillColor(...darkBg);
    doc.rect(0, 0, 210, 62, 'F');

    const logo = getLogoBase64();
    if (logo) {
      try { doc.addImage(logo, 'PNG', 20, 15, 28, 28); } catch {}
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text(ORG.brand, logo ? 55 : 20, 28);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(ORG.tagline, logo ? 55 : 20, 36);
    doc.text(`A Product of ${ORG.legal}`, logo ? 55 : 20, 43);

    // Invoice meta card
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, 74, 170, 36, 5, 5, 'F');

    doc.setTextColor(...darkGray);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('INVOICE DETAILS', 25, 84);

    // Invoice number = suffix of _id
    const invoiceSuffix = order._id.toString().slice(-8).toUpperCase();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    doc.text(`Invoice #: OL-${invoiceSuffix}`, 25, 92);
    doc.text(`Invoice Date: ${createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, 25, 98);
    doc.text(`Service Period: ${createdAt.toLocaleDateString('en-IN')} ${expiry ? `→ ${expiry.toLocaleDateString('en-IN')}` : ''}`, 25, 104);

    // Status badge
    const statusX = 140;
    const status = (order.status || 'pending').toString();
    if (status === 'completed') doc.setFillColor(...green);
    else if (status === 'pending') doc.setFillColor(255, 193, 7);
    else doc.setFillColor(220, 53, 69);
    doc.roundedRect(statusX, 88, 30, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text(status.toUpperCase(), statusX + 3, 94);

    // BILL TO / FROM cards
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, 118, 80, 46, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('BILL TO', 25, 128);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);
    const billY1 = drawLabelValue(doc, '', `${customerName}`, 25, 135, 70);
    drawLabelValue(doc, '', `${customerEmail}`, 25, billY1 + 2, 70);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(110, 118, 80, 46, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('FROM', 115, 128);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);
    let fromY = 135;
    fromY = drawLabelValue(doc, '', ORG.brand, 115, fromY, 70);
    fromY = drawLabelValue(doc, '', ORG.legal, 115, fromY + 1, 70);
    fromY = drawLabelValue(doc, '', ORG.address, 115, fromY + 1, 70);
    fromY = drawLabelValue(doc, '', `${ORG.email}${ORG.phone ? ` • ${ORG.phone}` : ''}`, 115, fromY + 1, 70);
    if (ORG.showGST && ORG.gstin) drawLabelValue(doc, '', `GSTIN: ${ORG.gstin}`, 115, fromY + 1, 70);

    // Services table header
    let y = 172;
    y = checkPageSpace(doc, y, 18);
    doc.setFillColor(...darkBg);
    doc.roundedRect(20, y, 170, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('SERVICE DESCRIPTION', 25, y + 8);
    doc.text('CONFIGURATION', 125, y + 8);
    y += 12;

    // Services row (full wrap; no truncation)
    doc.setFillColor(255, 255, 255);
    doc.rect(20, y, 170, 18, 'F');
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);

    const desc = `${productName}`;
    const descLines = doc.splitTextToSize(desc, 95);
    const cfg = `RAM: ${memory}${os ? ` • OS: ${os}` : ''}`;
    const cfgLines = doc.splitTextToSize(cfg, 60);

    // Draw description and config
    const baseY = y + 6;
    doc.text(descLines, 25, baseY);
    doc.text(cfgLines, 125, baseY);

    // Amount at far right (top aligned)
    doc.setFont('helvetica', 'bold');
    doc.text(`₹ ${Number(order.price ?? 0).toLocaleString('en-IN')}`, 175, baseY, { align: 'right' });

    // Increase y to max of lines
    const rowHeight = Math.max(descLines.length, cfgLines.length) * 5 + 10;
    y += rowHeight;

    // Promo / totals box
    y = checkPageSpace(doc, y + 6, 50);
    if (order.promoCode && (order.promoDiscount ?? 0) > 0) {
      doc.setFont('helvetica', 'normal'); doc.setTextColor(34, 197, 94); doc.setFontSize(9);
      const promo = `Promo Applied: ${clean(order.promoCode)} (−₹ ${Number(order.promoDiscount).toLocaleString('en-IN')})`;
      doc.text(promo, 20, y + 4);
    }

    // Totals card
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(120, y, 70, ORG.showGST ? 30 : 22, 3, 3, 'F');
    doc.setTextColor(2, 7, 19);
    doc.setFont('helvetica', 'bold');

    // When GST shown
    if (ORG.showGST) {
      doc.setFontSize(9); doc.text('Subtotal', 125, y + 8);
      doc.setFont('helvetica', 'normal'); doc.text(`₹ ${Math.round(taxable).toLocaleString('en-IN')}`, 185, y + 8, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.text(`GST (${ORG.gstRatePct}%)`, 125, y + 16);
      doc.setFont('helvetica', 'normal'); doc.text(`₹ ${gstAmt.toLocaleString('en-IN')}`, 185, y + 16, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('TOTAL', 125, y + 26);
      doc.text(`₹ ${total.toLocaleString('en-IN')}`, 185, y + 26, { align: 'right' });
      y += 36;
    } else {
      doc.setFontSize(11); doc.text('TOTAL', 125, y + 12);
      doc.text(`₹ ${total.toLocaleString('en-IN')}`, 185, y + 12, { align: 'right' });
      y += 28;
    }

    // Service details / delivery proof (password masked)
    y = checkPageSpace(doc, y, 60);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, y, 170, 42, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('SERVICE & DELIVERY DETAILS', 25, y + 10);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);

    let dY = y + 16;
    const deliveryLines = [
      ip ? `Server / IP: ${ip}` : '',
      uname ? `Username: ${uname}` : '',
      passwd ? `Password: ${maskSecret(passwd)} (masked)` : '',
      os ? `OS: ${os}` : '',
      `Provisioning: ${order.autoProvisioned ? 'Auto-Provisioned' : 'Manual'} • Status: ${order.provisioningStatus || order.status || 'N/A'}`,
      `Delivery Note: Service activated on ${createdAt.toLocaleString('en-IN')} and details shared via dashboard/email.`,
      expiry ? `Valid Until: ${expiry.toLocaleDateString('en-IN')}` : '',
    ].filter(Boolean);

    deliveryLines.forEach(line => {
      const lines = doc.splitTextToSize(line, 160);
      doc.text(lines, 25, dY);
      dY += lines.length * 5;
    });

    y = dY + 6;

    // Payment information
    y = checkPageSpace(doc, y, 36);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, y, 170, 30, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('PAYMENT INFORMATION', 25, y + 10);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(8);

    let pY = y + 16;
    const payLines = [
      txId ? `Razorpay Payment ID: ${txId}` : '',
      gwOrderId ? `Razorpay Order ID: ${gwOrderId}` : '',
      clientTxnId ? `Client Txn ID: ${clientTxnId}` : '',
      `Payment Status: ${status}`,
      `Payment Date: ${createdAt.toLocaleString('en-IN')}`,
    ].filter(Boolean);

    payLines.forEach(line => {
      const lines = doc.splitTextToSize(line, 160);
      doc.text(lines, 25, pY);
      pY += lines.length * 4.6;
    });

    // Terms (optional)
    y = checkPageSpace(doc, pY + 6, 30);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, y, 170, 24, 5, 5, 'F');
    doc.setTextColor(...darkGray); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('NOTES / TERMS', 25, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(8);
    const terms = doc.splitTextToSize(
      'This invoice is issued by Ocean Linux (Backtick Labs). Digital services once provisioned are non-returnable. Disputes: Pune jurisdiction. For support or clarifications, write to hello@oceanlinux.com.',
      162
    );
    doc.text(terms, 25, y + 14);

    // Footer on last page
    addFinalFooter(doc);

    // Send buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const invoiceFile = `oceanlinux-invoice-OL-${invoiceSuffix}.pdf`;
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceFile}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Invoice generation error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}
