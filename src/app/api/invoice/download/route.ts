import { NextRequest, NextResponse } from 'next/server';
import { getDataFromToken } from '@/helper/getDataFromToken';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

// Function to remove emojis from text
const removeEmojis = (text: string) => {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
};

// Function to clean text for PDF rendering
const cleanTextForPDF = (text: string) => {
  if (!text) return '';
  return removeEmojis(text)
    .replace(/[^\x00-\x7F]/g, '')
    .trim();
};

// Function to load and convert image to base64
const getLogoBase64 = () => {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'oceanlinux.png');
    const logoBuffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch (error) {
    console.log('Logo not found, proceeding without logo');
    return null;
  }
};

// Function to add final footer (only for the last page)
const addFinalFooter = (doc: jsPDF) => {
  const primaryBlue = [59, 130, 246];
  const darkGray = [71, 85, 105];
  const darkBg = [2, 7, 19]; // #020713

  // Modern footer with dark background
  doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
  doc.rect(0, 270, 210, 27, 'F');

  doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Thank you for choosing Ocean Linux!', 20, 280);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Most Affordable Premium Linux VPS Hosting | Enterprise Quality at Budget Prices', 20, 286);
  doc.text('This is a computer-generated invoice. For support: hello@oceanlinux.com', 20, 291);
};

// Function to check if content fits on current page, if not create new page
const checkPageSpace = (doc: jsPDF, currentY: number, requiredSpace: number) => {
  const pageHeight = 297; // A4 height
  const footerSpace = 30; // Space reserved for footer
  
  if (currentY + requiredSpace > pageHeight - footerSpace) {
    // Add new page without footer
    doc.addPage();
    
    // Add light background to new page
    const lightGray = [248, 250, 252];
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.rect(0, 0, 210, 297, 'F');
    
    return 30; // Return new Y position for new page
  }
  return currentY;
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

    // Generate modern PDF invoice
    const doc = new jsPDF();
    
    // Color scheme with updated dark background
    const primaryBlue = [59, 130, 246]; // Blue-500
    const darkBlue = [30, 58, 138]; // Blue-800
    const lightGray = [248, 250, 252]; // Slate-50
    const darkGray = [71, 85, 105]; // Slate-600
    const green = [34, 197, 94]; // Green-500
    const darkBg = [2, 7, 19]; // #020713

    // Modern gradient background effect
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.rect(0, 0, 210, 297, 'F'); // A4 background

    // Header section with dark background (#020713)
    doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
    doc.rect(0, 0, 210, 60, 'F');

    // Add logo if available
    const logoBase64 = getLogoBase64();
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 20, 15, 30, 30);
      } catch (error) {
        console.log('Error adding logo to PDF');
      }
    }

    // Company branding
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Ocean Linux', logoBase64 ? 60 : 20, 30);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Most Affordable Premium Linux VPS Hosting', logoBase64 ? 60 : 20, 38);
    doc.text('A Product of Backtick Labs Private Limited', logoBase64 ? 60 : 20, 45);

    // Modern invoice badge
    // doc.setFillColor(255, 255, 255);
    // doc.roundedRect(140, 15, 50, 30, 5, 5, 'F');
    // doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    // doc.setFontSize(20);
    // doc.setFont('helvetica', 'bold');
    // doc.text('INVOICE', 145, 32);

    // Invoice details in modern card style
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, 75, 170, 35, 5, 5, 'F');
    
    // Invoice meta information
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE DETAILS', 25, 85);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const invoiceId = order._id.toString().substring(order._id.toString().length - 8).toUpperCase();
    doc.text(`Invoice #: OL-${invoiceId}`, 25, 92);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 25, 98);
    doc.text(`Due Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 25, 104);

    // Status badge
    const statusX = 140;
    if (order.status === 'completed') {
      doc.setFillColor(green[0], green[1], green[2]);
    } else if (order.status === 'pending') {
      doc.setFillColor(255, 193, 7); // Yellow
    } else {
      doc.setFillColor(220, 53, 69); // Red
    }
    doc.roundedRect(statusX, 87, 25, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(order.status.toUpperCase(), statusX + 2, 92);

    // Customer details section
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(20, 125, 80, 40, 5, 5, 'F');
    
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL TO', 25, 135);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(cleanUserName, 25, 145);
    doc.setFontSize(9);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(cleanUserEmail, 25, 152);

    // Company details section
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(110, 125, 80, 40, 5, 5, 'F');
    
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('FROM', 115, 135);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Ocean Linux', 115, 145);
    doc.text('hello@oceanlinux.com', 115, 152);
    // doc.text('+91 XXX XXX XXXX', 115, 159);

    // Services table with modern design
    let currentY = 180;
    
    // Check if table fits on current page
    currentY = checkPageSpace(doc, currentY, 50);
    
    // Table header with dark background
    doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
    doc.roundedRect(20, currentY, 170, 12, 2, 2, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('SERVICE DESCRIPTION', 25, currentY + 8);
    doc.text('CONFIGURATION', 90, currentY + 8);
    doc.text('AMOUNT', 155, currentY + 8);

    // Table content
    currentY += 12;
    doc.setFillColor(255, 255, 255);
    doc.rect(20, currentY, 170, 15, 'F');

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // Truncate long product names
    const maxProductNameLength = 20;
    const displayProductName = cleanProductName.length > maxProductNameLength
      ? cleanProductName.substring(0, maxProductNameLength) + '...'
      : cleanProductName;

    doc.text(displayProductName, 25, currentY + 8);
    doc.text(cleanMemory, 90, currentY + 8);
    doc.text(`Rs ${order.price.toLocaleString('en-IN')}`, 155, currentY + 8);

    // Move to next section
    currentY += 25;

    // Check space for promo/total section
    currentY = checkPageSpace(doc, currentY, 40);
    
    // Promo discount section (if applicable)
    if (order.promoCode && order.promoDiscount > 0) {
      doc.setTextColor(green[0], green[1], green[2]);
      doc.setFontSize(9);
      doc.text(`Promo Applied: ${cleanPromoCode}`, 120, currentY);
      doc.text(`- Rs ${order.promoDiscount.toLocaleString('en-IN')}`, 155, currentY);
      currentY += 10;
    }

    // Total section with modern styling
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(120, currentY, 70, 20, 3, 3, 'F');
    
    doc.setTextColor(darkBg[0], darkBg[1], darkBg[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL AMOUNT', 125, currentY + 8);
    doc.text(`Rs ${order.price.toLocaleString('en-IN')}`, 155, currentY + 15);

    currentY += 35;

    // Service details section
    if (order.ipAddress || order.username || order.os) {
      // Calculate required space for service details
      let serviceDetailsCount = 0;
      if (order.ipAddress) serviceDetailsCount++;
      if (order.username) serviceDetailsCount++;
      if (order.os) serviceDetailsCount++;
      
      const requiredSpace = 50 + (serviceDetailsCount * 7);
      currentY = checkPageSpace(doc, currentY, requiredSpace);
      
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(20, currentY, 170, 40, 5, 5, 'F');
      
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('SERVICE DETAILS', 25, currentY + 12);

      let detailY = currentY + 20;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      if (order.ipAddress) {
        doc.text(`Server IP: ${cleanTextForPDF(order.ipAddress)}`, 25, detailY);
        detailY += 7;
      }

      if (order.username) {
        doc.text(`Username: ${cleanTextForPDF(order.username)}`, 25, detailY);
        detailY += 7;
      }

      if (order.os) {
        doc.text(`OS: ${cleanTextForPDF(order.os)}`, 25, detailY);
        detailY += 7;
      }

      currentY += 50;
    }

    // Payment details
    if (order.transactionId || order.gatewayOrderId) {
      currentY = checkPageSpace(doc, currentY, 35);
      
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(20, currentY, 170, 30, 5, 5, 'F');
      
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('PAYMENT INFORMATION', 25, currentY + 12);

      let payDetailY = currentY + 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      if (order.transactionId) {
        doc.text(`Transaction ID: ${cleanTextForPDF(order.transactionId)}`, 25, payDetailY);
        payDetailY += 6;
      }

      if (order.gatewayOrderId) {
        doc.text(`Gateway Order ID: ${cleanTextForPDF(order.gatewayOrderId)}`, 25, payDetailY);
      }

      currentY += 40;
    }

    // Check space before adding final footer
    currentY = checkPageSpace(doc, currentY, 30);

    // Add final footer ONLY to the last page
    addFinalFooter(doc);

    // Convert PDF to buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="oceanlinux-invoice-${invoiceId}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}