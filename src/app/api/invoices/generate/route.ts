import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

const ORG = {
  brand: 'Ocean Linux',
  legal: 'Backtick Labs',
  tagline: 'Most Affordable Premium Linux VPS Hosting',
  address: 'Office No.311, Kohinoor Majestic, Pune - 411019',
  email: 'hello@oceanlinux.com',
  web: 'oceanlinux.com',
  showGST: false,
  gstRatePct: 18,
  gstin: '',
};
const ADMIN_KEY = process.env.INVOICE_ADMIN_KEY || '';

// -- Colors --
const C = {
  navy:    [10, 15, 30] as const,
  slate9:  [15, 23, 42] as const,
  slate7:  [51, 65, 85] as const,
  slate5:  [100, 116, 139] as const,
  slate4:  [148, 163, 184] as const,
  slate2:  [226, 232, 240] as const,
  slate1:  [241, 245, 249] as const,
  white:   [255, 255, 255] as const,
  blue:    [59, 130, 246] as const,
  green:   [16, 185, 129] as const,
  amber:   [245, 158, 11] as const,
  red:     [239, 68, 68] as const,
};

const removeEmojis = (t: string) =>
  (t || '').replace(
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
    const p = path.join(process.cwd(), 'public', 'oceanlinux.png');
    return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
  } catch {
    return null;
  }
};

const makeCompliantName = (raw: string) => {
  let s = clean(raw);
  let dcHint = '';
  const dcMatch = s.match(/^\s*([0-9]{1,3}\.[0-9]{1,3}(?:\.[0-9xX]{1,3}){0,2})/);
  if (dcMatch) {
    dcHint = dcMatch[1].toUpperCase();
    s = s.slice(dcMatch[0].length).trim();
  }
  s = s.replace(/[–—]/g, '-');
  const strip = [/\bproxies?\b/gi, /\brotating\b/gi, /\bpremium\b/gi, /\bprime\b/gi,
    /\bhigh\s*demand\b/gi, /\blimited\s*stock\b/gi, /\bseries\b/gi, /\blinux\b/gi, /\bproxy\b/gi];
  for (const re of strip) s = s.replace(re, '');
  let plan = /\bgold\b/i.test(s) ? 'Gold Plan' : 'Plan';
  let out = `Linux VPS Hosting - ${plan}`;
  if (dcHint) out += ` (Data Center ${dcHint})`;
  return out;
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

export async function GET(req: NextRequest) {
  try {
    const txId = req.nextUrl.searchParams.get('txId') || '';
    const key = req.nextUrl.searchParams.get('key') || '';
    if (!txId) return NextResponse.json({ error: 'Query param txId is required' }, { status: 400 });
    if (ADMIN_KEY && key !== ADMIN_KEY) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await connectDB();
    const order = await Order.findOne({ transactionId: txId }).lean();
    if (!order) return NextResponse.json({ error: 'Order not found for this transactionId' }, { status: 404 });

    const productName = makeCompliantName(clean(order.productName || 'N/A'));
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
    const originalPrice = Number(order.originalPrice ?? price);
    const discount = Number(order.promoDiscount ?? 0);
    const taxable = ORG.showGST ? price * (100 / (100 + ORG.gstRatePct)) : price;
    const gstAmt = ORG.showGST ? Math.round(price - taxable) : 0;

    const invoiceNum = `OL-${order._id.toString().slice(-8).toUpperCase()}`;

    const doc = new jsPDF();
    const W = 210;
    const M = 20;
    const R = W - M;

    setFill(doc, C.white);
    doc.rect(0, 0, W, 297, 'F');

    // ── HEADER ───────────────────────────────────────────────────────────
    setFill(doc, C.navy);
    doc.rect(0, 0, W, 52, 'F');
    setFill(doc, C.blue);
    doc.rect(0, 52, W, 1.5, 'F');

    const logo = getLogoBase64();
    if (logo) { try { doc.addImage(logo, 'PNG', M, 12, 26, 26); } catch {} }
    const textX = logo ? 52 : M;

    setColor(doc, C.white);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text(ORG.brand, textX, 26);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    setColor(doc, C.slate4);
    doc.text(ORG.tagline, textX, 33);
    doc.text(`A product by ${ORG.legal}`, textX, 39);

    setColor(doc, C.white);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(28);
    doc.text('INVOICE', R, 30, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    setColor(doc, C.slate4);
    doc.text(invoiceNum, R, 38, { align: 'right' });

    // ── META ROW ─────────────────────────────────────────────────────────
    let y = 62;
    const metaItems = [
      { label: 'Invoice Date', value: fmtDate(createdAt) },
      { label: 'Due Date', value: 'Paid' },
      { label: 'Service Period', value: expiry ? `${fmtDate(createdAt)} — ${fmtDate(expiry)}` : fmtDate(createdAt) },
    ];
    const metaW = (R - M) / metaItems.length;
    metaItems.forEach((m, i) => {
      const mx = M + i * metaW;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      setColor(doc, C.slate5);
      doc.text(m.label.toUpperCase(), mx, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      setColor(doc, C.slate9);
      doc.text(m.value, mx, y + 6);
    });

    const badgeColors: Record<string, readonly number[]> = {
      active: C.green, completed: C.green, confirmed: C.green,
      pending: C.amber, failed: C.red,
    };
    const badgeColor = badgeColors[status] || C.slate5;
    const badgeText = status.toUpperCase();
    const badgeW = doc.getTextWidth(badgeText) + 8;
    setFill(doc, badgeColor);
    doc.roundedRect(R - badgeW, y - 3, badgeW, 7, 2, 2, 'F');
    setColor(doc, C.white);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text(badgeText, R - badgeW + 4, y + 2);

    y = 76; hr(doc, y);

    // ── BILL TO / ISSUED BY ──────────────────────────────────────────────
    y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(doc, C.blue);
    doc.text('BILL TO', M, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setColor(doc, C.slate9);
    doc.text(customerName, M, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(doc, C.slate7);
    doc.text(customerEmail, M, y + 13);

    const col2 = 125;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(doc, C.blue);
    doc.text('ISSUED BY', col2, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setColor(doc, C.slate9);
    doc.text(ORG.brand, col2, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setColor(doc, C.slate7);
    let fy = y + 13;
    doc.text(ORG.legal, col2, fy); fy += 5;
    const addrLines = doc.splitTextToSize(ORG.address, 60);
    doc.text(addrLines, col2, fy); fy += addrLines.length * 4;
    doc.text(ORG.email, col2, fy);

    y += 34; hr(doc, y);

    // ── LINE ITEMS TABLE ─────────────────────────────────────────────────
    y += 8;
    setFill(doc, C.slate1);
    doc.roundedRect(M, y, R - M, 10, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(doc, C.slate5);
    doc.text('DESCRIPTION', M + 4, y + 7);
    doc.text('CONFIGURATION', 110, y + 7);
    doc.text('AMOUNT', R - 4, y + 7, { align: 'right' });
    y += 14;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); setColor(doc, C.slate9);
    const descLines = doc.splitTextToSize(productName, 80);
    doc.text(descLines, M + 4, y);

    doc.setFontSize(9); setColor(doc, C.slate7);
    const cfgParts = [`RAM: ${memory}`];
    if (os) cfgParts.push(`OS: ${os}`);
    const cfgLines = doc.splitTextToSize(cfgParts.join(' · '), 50);
    doc.text(cfgLines, 110, y);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setColor(doc, C.slate9);
    doc.text(`Rs ${formatINR(price)}`, R - 4, y, { align: 'right' });

    y += Math.max(descLines.length, cfgLines.length) * 5 + 4;
    hr(doc, y);

    // ── TOTALS ───────────────────────────────────────────────────────────
    y += 6;
    const totalsX = 135;
    const totalsValX = R - 4;

    if (discount > 0 || ORG.showGST) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(doc, C.slate5);
      doc.text('Subtotal', totalsX, y);
      setColor(doc, C.slate9);
      doc.text(`Rs ${formatINR(originalPrice)}`, totalsValX, y, { align: 'right' });
      y += 6;
    }
    if (discount > 0) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(doc, C.green);
      doc.text(order.promoCode ? `Discount (${clean(order.promoCode)})` : 'Discount', totalsX, y);
      doc.text(`-Rs ${formatINR(discount)}`, totalsValX, y, { align: 'right' });
      y += 6;
    }
    if (ORG.showGST) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(doc, C.slate5);
      doc.text(`GST (${ORG.gstRatePct}%)`, totalsX, y);
      setColor(doc, C.slate9);
      doc.text(`Rs ${formatINR(gstAmt)}`, totalsValX, y, { align: 'right' });
      y += 6;
    }

    y += 2;
    setFill(doc, C.navy);
    doc.roundedRect(totalsX - 4, y - 5, R - totalsX + 8, 12, 2, 2, 'F');
    setColor(doc, C.white); doc.setFont('helvetica', 'bold');
    doc.setFontSize(10); doc.text('TOTAL', totalsX, y + 3);
    doc.setFontSize(11); doc.text(`Rs ${formatINR(price)}`, totalsValX, y + 3, { align: 'right' });
    y += 18;

    // ── SERVICE DETAILS ──────────────────────────────────────────────────
    y = checkPage(doc, y, 55);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(doc, C.blue);
    doc.text('SERVICE DETAILS', M, y); y += 6;

    const serviceRows = [
      ip && ['Server IP', ip],
      uname && ['Username', uname],
      passwd && ['Password', maskSecret(passwd)],
      os && ['Operating System', os],
      ['Provisioning', (order.provisioningStatus !== 'failed' && order.autoProvisioned) ? 'Auto-Provisioned' : 'Manual'],
      expiry && ['Valid Until', fmtDate(expiry)],
      ['Activated On', fmtDate(createdAt)],
    ].filter(Boolean) as [string, string][];

    serviceRows.forEach((row, i) => {
      if (i % 2 === 0) {
        setFill(doc, C.slate1);
        doc.roundedRect(M, y - 3.5, R - M, 9, 0.5, 0.5, 'F');
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(doc, C.slate5);
      doc.text(row[0], M + 4, y + 2);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setColor(doc, C.slate9);
      doc.text(row[1], 85, y + 2);
      y += 9;
    });
    y += 4;

    // ── PAYMENT INFO ─────────────────────────────────────────────────────
    y = checkPage(doc, y, 40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(doc, C.blue);
    doc.text('PAYMENT INFORMATION', M, y); y += 6;

    const payRows = [
      txId && ['Payment ID', txId],
      gatewayOrderId && ['Gateway Order ID', gatewayOrderId],
      clientTxnId && ['Transaction Ref', clientTxnId],
      ['Payment Status', status.charAt(0).toUpperCase() + status.slice(1)],
      ['Payment Date', fmtDate(createdAt)],
    ].filter(Boolean) as [string, string][];

    payRows.forEach((row, i) => {
      if (i % 2 === 0) {
        setFill(doc, C.slate1);
        doc.roundedRect(M, y - 3.5, R - M, 9, 0.5, 0.5, 'F');
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(doc, C.slate5);
      doc.text(row[0], M + 4, y + 2);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setColor(doc, C.slate9);
      doc.text(row[1], 85, y + 2);
      y += 9;
    });
    y += 6;

    // ── TERMS ────────────────────────────────────────────────────────────
    y = checkPage(doc, y, 25);
    hr(doc, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(doc, C.slate4);
    const termsText = `This invoice is issued by ${ORG.brand} (${ORG.legal}). Digital services once provisioned are non-returnable. 7-day money-back guarantee on new orders (subject to eligibility). Disputes: Pune jurisdiction. Support: ${ORG.email}`;
    doc.text(doc.splitTextToSize(termsText, R - M), M, y);

    // ── FOOTER ───────────────────────────────────────────────────────────
    setFill(doc, C.blue); doc.rect(0, 283, W, 1, 'F');
    setFill(doc, C.navy); doc.rect(0, 284, W, 13, 'F');

    setColor(doc, C.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text('Thank you for choosing Ocean Linux!', M, 291);
    setColor(doc, C.slate4); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(`${ORG.web}  ·  ${ORG.email}`, R, 291, { align: 'right' });
    doc.setFontSize(6);
    doc.text('Computer-generated invoice — no signature required', W / 2, 295, { align: 'center' });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const file = `oceanlinux-invoice-${invoiceNum}.pdf`;
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
