import { NextRequest, NextResponse } from 'next/server';
import { getDataFromToken } from '@/helper/getDataFromToken';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

const ORG = {
  brand: 'Ocean Linux',
  legal: 'Backtick Labs',
  tagline: 'Most Affordable Premium Linux VPS Hosting',
  address: 'Salt Lake City, Kolkata',
  email: 'hello@oceanlinux.com',
  web: 'oceanlinux.com',
  showGST: false,
  gstRatePct: 18,
  gstin: '',
};

const C = {
  dark:    [12, 12, 12] as const,
  dark2:   [24, 24, 27] as const,
  slate9:  [15, 23, 42] as const,
  slate7:  [51, 65, 85] as const,
  slate5:  [100, 116, 139] as const,
  slate4:  [148, 163, 184] as const,
  slate2:  [226, 232, 240] as const,
  slate1:  [241, 245, 249] as const,
  white:   [255, 255, 255] as const,
  green:   [16, 185, 129] as const,
  greenLt: [52, 211, 153] as const,
  greenDk: [5, 150, 105] as const,
  amber:   [245, 158, 11] as const,
  red:     [239, 68, 68] as const,
};

const removeEmojis = (text: string) =>
  (text || '').replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]/gu,
    ''
  );

const clean = (t?: string) => removeEmojis(t || '').trim();

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

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const getLogoBase64 = () => {
  try {
    const p = path.join(process.cwd(), 'public', 'ol.png');
    return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
  } catch {
    return null;
  }
};

const setColor = (doc: jsPDF, c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (doc: jsPDF, c: readonly number[]) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: readonly number[]) => doc.setDrawColor(c[0], c[1], c[2]);

const checkPage = (doc: jsPDF, y: number, need: number): number => {
  if (y + need > 272) { doc.addPage(); return 25; }
  return y;
};

const hr = (doc: jsPDF, y: number, x1 = 20, x2 = 190) => {
  setDraw(doc, C.slate2); doc.setLineWidth(0.3); doc.line(x1, y, x2, y);
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

    const orderId = new URL(request.url).searchParams.get('orderId');
    if (!orderId) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const order = await Order.findOne({ _id: orderId, user: userId }).lean();
    const user = await User.findById(userId).lean();
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const productName = clean(order.productName || 'N/A');
    const memory = clean(order.memory || 'N/A');
    const customerName = clean(order.customerName || (user as any).name || 'N/A');
    const customerEmail = clean(order.customerEmail || (user as any).email || 'N/A');
    const ip = clean(order.ipAddress || '');
    const uname = clean(order.username || '');
    const passwd = clean(order.password || '');
    const os = clean(order.os || '');
    const txId = clean(order.transactionId || '');
    const gwOrderId = clean(order.gatewayOrderId || '');
    const clientTxnId = clean(order.clientTxnId || '');
    const createdAt = new Date(order.createdAt || new Date());
    const expiry = order.expiryDate ? new Date(order.expiryDate as any) : null;
    const status = (order.status || 'pending').toString();

    const price = Number(order.price ?? order.originalPrice ?? 0);
    const originalPrice = Number(order.originalPrice ?? price);
    const discount = Number(order.promoDiscount ?? 0);
    const taxable = ORG.showGST ? price * (100 / (100 + ORG.gstRatePct)) : price;
    const gstAmt = ORG.showGST ? Math.round(price - taxable) : 0;

    const invoiceNum = `OL-${order._id.toString().slice(-8).toUpperCase()}`;

    const doc = new jsPDF();
    const W = 210;
    const M = 20;
    const R = W - M;

    // ── Page background ──────────────────────────────────────────────────
    setFill(doc, C.white);
    doc.rect(0, 0, W, 297, 'F');

    // ══════════════════════════════════════════════════════════════════════
    // HEADER (0 → 56)
    // ══════════════════════════════════════════════════════════════════════
    setFill(doc, C.dark);
    doc.rect(0, 0, W, 54, 'F');

    // Green accent stripe
    setFill(doc, C.green);
    doc.rect(0, 54, W, 2, 'F');

    // Logo
    const logo = getLogoBase64();
    if (logo) {
      try { doc.addImage(logo, 'PNG', M, 12, 26, 26); } catch {}
    }
    const textX = logo ? 52 : M;

    // Brand text
    setColor(doc, C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(ORG.brand, textX, 24);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setColor(doc, C.slate4);
    doc.text(ORG.tagline, textX, 31);
    doc.setFontSize(8);
    doc.text(`A product by ${ORG.legal}`, textX, 37);

    // INVOICE title (right)
    setColor(doc, C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.text('INVOICE', R, 24, { align: 'right' });

    // Invoice number
    setColor(doc, C.greenLt);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(invoiceNum, R, 32, { align: 'right' });

    // Status badge (inside header, below invoice number)
    const badgeColors: Record<string, readonly number[]> = {
      active: C.green, completed: C.green, confirmed: C.green,
      pending: C.amber, failed: C.red,
    };
    const badgeColor = badgeColors[status] || C.slate5;
    const badgeText = status.toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const badgeW = doc.getTextWidth(badgeText) + 10;
    setFill(doc, badgeColor);
    doc.roundedRect(R - badgeW, 36, badgeW, 8, 2, 2, 'F');
    setColor(doc, C.white);
    doc.text(badgeText, R - badgeW + 5, 41.5);

    // ══════════════════════════════════════════════════════════════════════
    // META ROW (60 → 74)
    // ══════════════════════════════════════════════════════════════════════
    let y = 64;

    const metaItems = [
      { label: 'INVOICE DATE', value: fmtDate(createdAt) },
      { label: 'DUE DATE', value: 'Paid' },
      { label: 'SERVICE PERIOD', value: expiry ? `${fmtDate(createdAt)} to ${fmtDate(expiry)}` : fmtDate(createdAt) },
    ];

    // Uneven columns: give service period more room
    const colStarts = [M, M + 50, M + 100];
    metaItems.forEach((m, i) => {
      const mx = colStarts[i];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      setColor(doc, C.slate5);
      doc.text(m.label, mx, y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setColor(doc, C.slate9);
      doc.text(m.value, mx, y + 6);
    });

    y = 78;
    hr(doc, y);

    // ══════════════════════════════════════════════════════════════════════
    // BILL TO / ISSUED BY
    // ══════════════════════════════════════════════════════════════════════
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(doc, C.green);
    doc.text('BILL TO', M, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, C.slate9);
    doc.text(customerName, M, y + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setColor(doc, C.slate7);
    doc.text(customerEmail, M, y + 13);

    const col2 = 125;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(doc, C.green);
    doc.text('ISSUED BY', col2, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, C.slate9);
    doc.text(ORG.brand, col2, y + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setColor(doc, C.slate7);
    let fy = y + 13;
    doc.text(ORG.legal, col2, fy);
    fy += 5;
    doc.text(ORG.address, col2, fy);
    fy += 5;
    doc.text(ORG.email, col2, fy);

    y += 34;
    hr(doc, y);

    // ══════════════════════════════════════════════════════════════════════
    // LINE ITEMS TABLE
    // ══════════════════════════════════════════════════════════════════════
    y += 8;

    // Table header (dark background to match theme)
    setFill(doc, C.dark);
    doc.roundedRect(M, y, R - M, 10, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(doc, C.slate4);
    doc.text('DESCRIPTION', M + 4, y + 7);
    doc.text('CONFIGURATION', 110, y + 7);
    setColor(doc, C.greenLt);
    doc.text('AMOUNT', R - 4, y + 7, { align: 'right' });

    y += 14;

    // Table row
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setColor(doc, C.slate9);
    const descLines = doc.splitTextToSize(productName, 80);
    doc.text(descLines, M + 4, y);

    doc.setFontSize(9);
    setColor(doc, C.slate7);
    const configParts = [`RAM: ${memory}`];
    if (os) configParts.push(`OS: ${os}`);
    const cfgLines = doc.splitTextToSize(configParts.join(' · '), 50);
    doc.text(cfgLines, 110, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, C.dark);
    doc.text(`Rs ${formatINR(price)}`, R - 4, y, { align: 'right' });

    const rowH = Math.max(descLines.length, cfgLines.length) * 5 + 4;
    y += rowH;

    hr(doc, y);

    // ══════════════════════════════════════════════════════════════════════
    // TOTALS (right-aligned, wider area to prevent overlap)
    // ══════════════════════════════════════════════════════════════════════
    y += 6;

    const totalsLabelX = 115;
    const totalsValX = R - 4;

    if (discount > 0 || ORG.showGST) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setColor(doc, C.slate5);
      doc.text('Subtotal', totalsLabelX, y);
      setColor(doc, C.slate9);
      doc.text(`Rs ${formatINR(originalPrice)}`, totalsValX, y, { align: 'right' });
      y += 7;
    }

    if (discount > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setColor(doc, C.green);
      doc.text('Discount', totalsLabelX, y);
      if (order.promoCode) {
        doc.setFontSize(7.5);
        doc.text(`(${clean(order.promoCode)})`, totalsLabelX + doc.getTextWidth('Discount  '), y);
      }
      doc.setFontSize(9);
      doc.text(`-Rs ${formatINR(discount)}`, totalsValX, y, { align: 'right' });
      y += 7;
    }

    if (ORG.showGST) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setColor(doc, C.slate5);
      doc.text(`GST (${ORG.gstRatePct}%)`, totalsLabelX, y);
      setColor(doc, C.slate9);
      doc.text(`Rs ${formatINR(gstAmt)}`, totalsValX, y, { align: 'right' });
      y += 7;
    }

    // Total pill
    y += 2;
    setFill(doc, C.dark);
    doc.roundedRect(totalsLabelX - 4, y - 5, R - totalsLabelX + 8, 13, 2, 2, 'F');

    setColor(doc, C.greenLt);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('TOTAL', totalsLabelX, y + 3.5);
    setColor(doc, C.white);
    doc.setFontSize(12);
    doc.text(`Rs ${formatINR(price)}`, totalsValX, y + 3.5, { align: 'right' });

    y += 20;

    // ══════════════════════════════════════════════════════════════════════
    // SERVICE DETAILS
    // ══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 55);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(doc, C.green);
    doc.text('SERVICE DETAILS', M, y);
    y += 6;

    const serviceRows = [
      ip && ['Server IP', ip],
      uname && ['Username', uname],
      passwd && ['Password', maskSecret(passwd)],
      os && ['Operating System', os],
      ['Provisioning', order.autoProvisioned ? 'Auto-Provisioned' : 'Manual'],
      expiry && ['Valid Until', fmtDate(expiry)],
      ['Activated On', fmtDate(createdAt)],
    ].filter(Boolean) as [string, string][];

    serviceRows.forEach((row, i) => {
      if (i % 2 === 0) {
        setFill(doc, C.slate1);
        doc.roundedRect(M, y - 3.5, R - M, 9, 0.5, 0.5, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setColor(doc, C.slate5);
      doc.text(row[0], M + 4, y + 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      setColor(doc, C.slate9);
      doc.text(row[1], 85, y + 2);
      y += 9;
    });
    y += 4;

    // ══════════════════════════════════════════════════════════════════════
    // PAYMENT INFORMATION
    // ══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 40);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(doc, C.green);
    doc.text('PAYMENT INFORMATION', M, y);
    y += 6;

    const payRows = [
      txId && ['Payment ID', txId],
      gwOrderId && ['Gateway Order ID', gwOrderId],
      clientTxnId && ['Transaction Ref', clientTxnId],
      ['Payment Status', status.charAt(0).toUpperCase() + status.slice(1)],
      ['Payment Date', fmtDate(createdAt)],
    ].filter(Boolean) as [string, string][];

    payRows.forEach((row, i) => {
      if (i % 2 === 0) {
        setFill(doc, C.slate1);
        doc.roundedRect(M, y - 3.5, R - M, 9, 0.5, 0.5, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setColor(doc, C.slate5);
      doc.text(row[0], M + 4, y + 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      setColor(doc, C.slate9);
      doc.text(row[1], 85, y + 2);
      y += 9;
    });
    y += 6;

    // ══════════════════════════════════════════════════════════════════════
    // TERMS
    // ══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 25);
    hr(doc, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setColor(doc, C.slate4);
    const termsText = [
      `This invoice is issued by ${ORG.brand} (${ORG.legal}).`,
      'Digital services once provisioned are non-returnable.',
      '7-day money-back guarantee on new orders (subject to eligibility).',
      `Disputes: Kolkata / West Bengal jurisdiction. Support: ${ORG.email}`,
    ].join(' ');
    doc.text(doc.splitTextToSize(termsText, R - M), M, y);

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════════
    setFill(doc, C.green);
    doc.rect(0, 283, W, 1, 'F');

    setFill(doc, C.dark);
    doc.rect(0, 284, W, 13, 'F');

    setColor(doc, C.greenLt);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Thank you for choosing Ocean Linux!', M, 291);

    setColor(doc, C.slate4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`${ORG.web}  ·  ${ORG.email}`, R, 291, { align: 'right' });

    doc.setFontSize(6);
    doc.text('Computer-generated invoice — no signature required', W / 2, 295, { align: 'center' });

    // ── Output ───────────────────────────────────────────────────────────
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const fileName = `oceanlinux-invoice-${invoiceNum}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Invoice generation error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}
