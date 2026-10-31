import { NextRequest, NextResponse } from 'next/server';
import { getDataFromToken } from '@/helper/getDataFromToken';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import type { LeanDoc } from '@/types/lean';
import { jsPDF } from 'jspdf';
import { getOrdersPageStatus } from '@/lib/orderDeliveryStatus';
import { getOrAssignInvoiceNumber, getOrAssignRenewalInvoiceNumber } from '@/lib/invoiceNumber';
import fs from 'fs';
import path from 'path';

const ORG = {
  brand: 'Ocean Linux',
  legal: 'Backtick Labs',
  tagline: 'Most Affordable Premium Linux VPS Hosting',
  address: 'Pune, Maharashtra - 411057',
  email: 'hello@oceanlinux.com',
  web: 'oceanlinux.com',
  showGST: true,
  gstRatePct: 18,
  gstin: '27OHIPS9274R1ZO',
  state: 'Maharashtra', // seller's state — drives CGST+SGST vs IGST
  sac: '998315', // SAC code — hosting & IT infrastructure provisioning services
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
    const renewalTxnId = new URL(request.url).searchParams.get('renewalTxnId');
    if (!orderId) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const order = await Order.findOne({ _id: orderId, user: userId }).lean<LeanDoc>();
    const user = await User.findById(userId).lean<LeanDoc>();
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const renewal = renewalTxnId
      ? ((order as any).renewalPayments || []).find((row: any) => row.renewalTxnId === renewalTxnId)
      : null;
    if (renewalTxnId && !renewal) {
      return NextResponse.json({ error: 'Renewal not found' }, { status: 404 });
    }

    const productName = clean(renewal ? `${order.productName || 'VPS'} Renewal` : (order.productName || 'N/A'));
    const memory = clean(order.memory || 'N/A');
    const customerName = clean(order.customerName || (user as any).name || 'N/A');
    const customerEmail = clean(order.customerEmail || (user as any).email || 'N/A');
    const ip = clean(order.ipAddress || '');
    const uname = clean(order.username || '');
    const passwd = clean(order.password || '');
    const os = clean(order.os || '');
    const txId = clean(renewal ? (renewal.paymentId || '') : (order.transactionId || ''));
    const gwOrderId = clean(renewal ? (renewal.gatewayOrderId || '') : (order.gatewayOrderId || ''));
    const clientTxnId = clean(renewal ? (renewal.renewalTxnId || '') : (order.clientTxnId || ''));
    const createdAt = new Date(renewal ? (renewal.paidAt || new Date()) : (order.createdAt || new Date()));
    const periodStart = renewal
      ? new Date(renewal.previousExpiry || renewal.paidAt || new Date())
      : createdAt;
    const expiry = renewal
      ? (renewal.newExpiry ? new Date(renewal.newExpiry) : null)
      : (order.expiryDate ? new Date(order.expiryDate as any) : null);
    const status = (order.status || 'pending').toString();

    const price = Number(renewal ? renewal.amount : (order.price ?? order.originalPrice ?? 0));
    const originalPrice = Number(renewal ? price : (order.originalPrice ?? price));
    const discount = renewal ? 0 : Number(order.promoDiscount ?? 0);
    const taxable = ORG.showGST ? price * (100 / (100 + ORG.gstRatePct)) : price;
    const gstAmt = ORG.showGST ? Math.round(price - taxable) : 0;
    const cgst = Math.round(gstAmt / 2);
    const sgst = gstAmt - cgst;

    // Customer billing address (snapshot from order, else current profile).
    const billing: any = (order as any).billingAddress || (user as any).billingAddress || {};
    const custState = clean(billing.state || '');
    const custCity = clean(billing.city || '');
    const custPin = clean(billing.pincode || '');
    const custLine = clean(billing.line || '');
    // Intra-state (same as seller) => CGST + SGST, otherwise IGST.
    const isIntraState = !!custState && custState.trim().toLowerCase() === ORG.state.toLowerCase();

    const invoiceNum = renewal
      ? await getOrAssignRenewalInvoiceNumber(order._id, renewal)
      : await getOrAssignInvoiceNumber(order);

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
    doc.text(renewal ? 'RENEWAL' : 'INVOICE', R, 24, { align: 'right' });

    // Invoice number
    setColor(doc, C.greenLt);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(invoiceNum, R, 32, { align: 'right' });

    // Status badge (inside header, below invoice number)
    // A delivered order means payment is settled → PAID invoice. Every other
    // state (awaiting payment, processing, failed, cancelled) produces a
    // provisional PENDING invoice that clearly shows payment is not yet done.
    const isPaid = renewal ? true : getOrdersPageStatus(order as any) === 'delivered';
    const badgeColor = isPaid ? C.green : C.amber;
    const badgeText = isPaid ? 'PAID' : 'PENDING';
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
      { label: 'PAYMENT STATUS', value: isPaid ? 'Paid' : 'Pending' },
      { label: 'SERVICE PERIOD', value: expiry ? `${fmtDate(periodStart)} to ${fmtDate(expiry)}` : fmtDate(periodStart) },
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
    // Customer address + place of supply (under BILL TO).
    let billY = y + 13;
    const custParts: string[] = [];
    if (custLine) custParts.push(custLine);
    const cityPin = [custCity, custPin].filter(Boolean).join(' - ');
    if (cityPin) custParts.push(cityPin);
    if (custState) custParts.push(custState);
    if (custParts.length) {
      billY += 5;
      doc.setFontSize(8.5);
      setColor(doc, C.slate7);
      const custAddrLines = doc.splitTextToSize(custParts.join(', '), col2 - M - 8) as string[];
      doc.text(custAddrLines, M, billY);
      billY += custAddrLines.length * 4.2;
    }
    if (custState) {
      billY += 4.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setColor(doc, C.slate9);
      doc.text(`Place of Supply: ${custState}`, M, billY);
    }
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
    doc.setFontSize(8);
    const addrLines = doc.splitTextToSize(ORG.address, R - col2) as string[];
    doc.text(addrLines, col2, fy);
    fy += addrLines.length * 4.2 + 1;
    doc.setFontSize(8.5);
    doc.text(ORG.email, col2, fy);
    if (ORG.gstin) {
      fy += 5;
      doc.setFont('helvetica', 'bold');
      setColor(doc, C.slate9);
      doc.text(`GSTIN: ${ORG.gstin}`, col2, fy);
    }

    y = Math.max(fy, billY) + 6;
    hr(doc, y);

    // ══════════════════════════════════════════════════════════════════════
    // LINE ITEMS TABLE
    // ══════════════════════════════════════════════════════════════════════
    y += 8;

    // Table header (dark background to match theme)
    setFill(doc, C.dark);
    doc.roundedRect(M, y, R - M, 10, 1.5, 1.5, 'F');

    const periodColX = 122;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(doc, C.slate4);
    doc.text('DESCRIPTION', M + 4, y + 7);
    doc.text('BILLING PERIOD', periodColX, y + 7);
    setColor(doc, C.greenLt);
    doc.text('AMOUNT', R - 4, y + 7, { align: 'right' });

    y += 15;

    // Description (bold) + spec sub-line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, C.slate9);
    const descLines = doc.splitTextToSize(productName, 90) as string[];
    doc.text(descLines, M + 4, y);
    let descBottom = y + descLines.length * 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(doc, C.slate5);
    const configParts = [`RAM: ${memory}`];
    if (os) configParts.push(`OS: ${os}`);
    configParts.push(`SAC: ${ORG.sac}`);
    doc.text(configParts.join('   ·   '), M + 4, descBottom);
    descBottom += 5;

    // Billing period column
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setColor(doc, C.slate7);
    const periodLines = expiry
      ? [fmtDate(periodStart), `to ${fmtDate(expiry)}`]
      : [fmtDate(periodStart)];
    doc.text(periodLines, periodColX, y);

    // Amount
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, C.dark);
    doc.text(`Rs ${formatINR(price)}`, R - 4, y, { align: 'right' });

    y = Math.max(descBottom, y + periodLines.length * 5) + 2;

    hr(doc, y);

    // ══════════════════════════════════════════════════════════════════════
    // TOTALS (right-aligned, wider area to prevent overlap)
    // ══════════════════════════════════════════════════════════════════════
    y += 6;

    const totalsLabelX = 115;
    const totalsValX = R - 4;

    const totalsRow = (label: string, value: string, labelColor: readonly number[] = C.slate5, valueColor: readonly number[] = C.slate9) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setColor(doc, labelColor);
      doc.text(label, totalsLabelX, y);
      setColor(doc, valueColor);
      doc.text(value, totalsValX, y, { align: 'right' });
      y += 7;
    };

    if (discount > 0) {
      totalsRow('Subtotal', `Rs ${formatINR(originalPrice)}`);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setColor(doc, C.green);
      doc.text('Discount', totalsLabelX, y);
      if (order.promoCode) {
        doc.setFontSize(7.5);
        doc.text(`(${clean(order.promoCode)})`, totalsLabelX + doc.getTextWidth('Discount') + 3, y);
      }
      doc.setFontSize(9);
      doc.text(`-Rs ${formatINR(discount)}`, totalsValX, y, { align: 'right' });
      y += 7;
    }

    if (ORG.showGST) {
      // Prices are GST-inclusive — break the paid amount into taxable value plus
      // tax. Same-state (intra-state) supply splits into CGST+SGST; otherwise a
      // single IGST line is shown.
      totalsRow('Taxable Value', `Rs ${formatINR(taxable)}`);
      if (isIntraState) {
        totalsRow(`CGST (${ORG.gstRatePct / 2}%)`, `Rs ${formatINR(cgst)}`);
        totalsRow(`SGST (${ORG.gstRatePct / 2}%)`, `Rs ${formatINR(sgst)}`);
      } else {
        totalsRow(`IGST (${ORG.gstRatePct}%)`, `Rs ${formatINR(gstAmt)}`);
      }
    }

    // Total pill
    y += 2;
    setFill(doc, C.dark);
    doc.roundedRect(totalsLabelX - 4, y - 5, R - totalsLabelX + 8, 13, 2, 2, 'F');

    setColor(doc, C.greenLt);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(ORG.showGST ? 9 : 10);
    doc.text(ORG.showGST ? 'TOTAL (incl. GST)' : 'TOTAL', totalsLabelX, y + 3.5);
    setColor(doc, C.white);
    doc.setFontSize(12);
    doc.text(`Rs ${formatINR(price)}`, totalsValX, y + 3.5, { align: 'right' });

    // Decorative status seal in the empty left area next to the total —
    // green PAID when delivered, amber PENDING otherwise.
    {
      const sealX = 48;
      const sealY = y - 1;
      const sealColor = isPaid ? C.green : C.amber;
      const sealInk = isPaid ? C.greenDk : [180, 83, 9] as const;
      const sealText = isPaid ? 'PAID' : 'PENDING';
      setDraw(doc, sealColor);
      doc.setLineWidth(1.3);
      doc.circle(sealX, sealY, 12, 'S');
      doc.setLineWidth(0.4);
      doc.circle(sealX, sealY, 14, 'S');
      setColor(doc, sealInk);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isPaid ? 13 : 10);
      doc.text(sealText, sealX, sealY + 1, { align: 'center', angle: 14 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.text(isPaid ? fmtDate(createdAt) : 'Payment due', sealX, sealY + 6, { align: 'center', angle: 14 });
    }

    // Amount Paid — standard on hosting invoices.
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setColor(doc, C.slate5);
    doc.text('Amount Paid', totalsLabelX, y);
    setColor(doc, isPaid ? C.greenDk : C.slate9);
    doc.text(`Rs ${formatINR(isPaid ? price : 0)}`, totalsValX, y, { align: 'right' });

    y += 12;

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
      ['Payment Status', isPaid ? 'Paid' : 'Pending'],
      ['Payment Date', isPaid ? fmtDate(createdAt) : 'Not paid yet'],
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
    // PENDING PAYMENT NOTICE (only for unpaid / undelivered orders)
    // ══════════════════════════════════════════════════════════════════════
    if (!isPaid) {
      const noticeText =
        'This is a provisional invoice. Payment for this order has not been received yet, ' +
        'so the service is not active. Please complete the payment to activate your order.';
      const noticeLines = doc.splitTextToSize(noticeText, R - M - 8) as string[];
      const noticeBoxH = noticeLines.length * 3.8 + 11;
      y = checkPage(doc, y, noticeBoxH + 6);
      setFill(doc, [254, 226, 226]);
      setDraw(doc, C.red);
      doc.setLineWidth(0.4);
      doc.roundedRect(M, y, R - M, noticeBoxH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setColor(doc, [185, 28, 28]);
      doc.text('PAYMENT PENDING', M + 4, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      setColor(doc, C.slate7);
      doc.text(noticeLines, M + 4, y + 10.5);
      y += noticeBoxH + 6;
    }

    // ══════════════════════════════════════════════════════════════════════
    // IMPORTANT NOTE / DISCLAIMER
    // ══════════════════════════════════════════════════════════════════════
    const disclaimerText =
      'The customer is solely responsible for all activities carried out using the purchased ' +
      `service/product. ${ORG.brand} (${ORG.legal}) does not take any responsibility, guarantee, ` +
      'or liability for any illegal, fraudulent, abusive, or unauthorized activity performed using ' +
      "this product. Any such misuse is entirely the customer's responsibility.";
    const discLines = doc.splitTextToSize(disclaimerText, R - M - 8) as string[];
    const discBoxH = discLines.length * 3.8 + 11;
    y = checkPage(doc, y, discBoxH + 6);
    setFill(doc, [254, 243, 199]);
    setDraw(doc, C.amber);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, R - M, discBoxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setColor(doc, [180, 83, 9]);
    doc.text('IMPORTANT NOTE', M + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setColor(doc, C.slate7);
    doc.text(discLines, M + 4, y + 10.5);
    y += discBoxH + 6;

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
    const fileName = renewal
      ? `oceanlinux-renewal-${invoiceNum}.pdf`
      : `oceanlinux-invoice-${invoiceNum}.pdf`;

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
