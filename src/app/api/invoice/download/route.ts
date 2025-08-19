import { NextRequest, NextResponse } from 'next/server';
import { getDataFromToken } from '@/helper/getDataFromToken';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { jsPDF } from 'jspdf';

// Function to remove emojis from text
const removeEmojis = (text: string) => {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
};

// Function to clean text for PDF rendering
const cleanTextForPDF = (text: string) => {
  if (!text) return '';
  // Remove emojis and other problematic Unicode characters
  return removeEmojis(text)
    .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
    .trim();
};

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Check authentication
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let userId;
    try {
      userId = getDataFromToken(request);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // Find the order and verify ownership
    const order = await Order.findOne({ _id: orderId, user: userId }).lean();
    const user = await User.findById(userId).lean();

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Clean text fields
    const cleanProductName = cleanTextForPDF(order.productName || 'N/A');
    const cleanMemory = cleanTextForPDF(order.memory || 'N/A');
    const cleanUserName = cleanTextForPDF(user.name || 'N/A');
    const cleanUserEmail = cleanTextForPDF(user.email || 'N/A');
    const cleanPromoCode = order.promoCode ? cleanTextForPDF(order.promoCode) : '';

    // Generate PDF invoice
    const doc = new jsPDF();

    // Header
    doc.setFontSize(24);
    doc.setTextColor(59, 130, 246); // Blue color
    doc.text('INVOICE', 20, 30);

    // Company details
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Ocean Linux', 20, 45);
    doc.text('A Product of Backtick Labs Private Limited', 20, 52);
    doc.text('support@oceanlinux.in', 20, 59);

    // Invoice details
    doc.setFontSize(10);
    doc.text(`Invoice #: ${order._id}`, 140, 45);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 140, 52);
    doc.text(`Status: ${order.status.toUpperCase()}`, 140, 59);

    // Customer details
    doc.setFontSize(14);
    doc.setTextColor(59, 130, 246);
    doc.text('Bill To:', 20, 80);

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(cleanUserName, 20, 90);
    doc.text(cleanUserEmail, 20, 97);

    // Service details table header
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(59, 130, 246);
    doc.rect(20, 115, 170, 10, 'F');
    doc.text('Description', 25, 122);
    doc.text('Configuration', 80, 122);
    doc.text('Amount', 150, 122);

    // Service details
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 245, 245);
    doc.rect(20, 125, 170, 15, 'F');

    // Truncate long product names if needed
    const maxProductNameLength = 25;
    const displayProductName = cleanProductName.length > maxProductNameLength
      ? cleanProductName.substring(0, maxProductNameLength) + '...'
      : cleanProductName;

    doc.text(displayProductName, 25, 132);
    doc.text(cleanMemory, 80, 132);
    doc.text(`Rs ${order.price}`, 150, 132);

    // Promo code discount (if applicable)
    let yPosition = 140;
    if (order.promoCode && order.promoDiscount > 0) {
      yPosition += 10;
      doc.text(`Promo Code (${cleanPromoCode}):`, 25, yPosition);
      doc.text(`-Rs ${order.promoDiscount}`, 150, yPosition);
    }

    // Total
    yPosition += 15;
    doc.setFontSize(14);
    doc.setTextColor(59, 130, 246);
    doc.text('Total Amount:', 25, yPosition);
    doc.text(`Rs ${order.price}`, 150, yPosition);

    // Payment details
    yPosition += 20;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Payment Details:', 20, yPosition);
    yPosition += 7;
    doc.setFontSize(10);
    if (order.transactionId) {
      const cleanTransactionId = cleanTextForPDF(order.transactionId);
      doc.text(`Transaction ID: ${cleanTransactionId}`, 20, yPosition);
      yPosition += 7;
    }
    if (order.gatewayOrderId) {
      const cleanGatewayOrderId = cleanTextForPDF(order.gatewayOrderId);
      doc.text(`Gateway Order ID: ${cleanGatewayOrderId}`, 20, yPosition);
      yPosition += 7;
    }

    // Additional service details if available
    if (order.ipAddress) {
      const cleanIpAddress = cleanTextForPDF(order.ipAddress);
      doc.text(`IP Address: ${cleanIpAddress}`, 20, yPosition);
      yPosition += 7;
    }

    if (order.username) {
      const cleanUsername = cleanTextForPDF(order.username);
      doc.text(`Username: ${cleanUsername}`, 20, yPosition);
      yPosition += 7;
    }

    if (order.os) {
      const cleanOs = cleanTextForPDF(order.os);
      doc.text(`Operating System: ${cleanOs}`, 20, yPosition);
      yPosition += 7;
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('Thank you for your business!', 20, 280);
    doc.text('This is a computer-generated invoice.', 20, 285);

    // Convert PDF to buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${order._id}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}
