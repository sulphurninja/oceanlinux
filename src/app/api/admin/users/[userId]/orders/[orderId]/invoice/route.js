import connectDB from "@/lib/db";
import Order from "@/models/orderModel";
import User from "@/models/userModel";
import { getDataFromToken } from "@/helper/getDataFromToken";
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
    try {
        await connectDB();

        // Check if user is admin
        const adminId = getDataFromToken(request);
        if (!adminId) {
            return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
        }

        const order = await Order.findOne({
            _id: params.orderId,
            user: params.userId
        }).lean();

        if (!order) {
            return NextResponse.json({ message: 'Order not found' }, { status: 404 });
        }

        const user = await User.findById(params.userId).lean();
        if (!user) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        // Redirect to the invoice generation endpoint with transaction ID
        const invoiceUrl = `/api/invoices/generate?txId=${order.transactionId}&key=${process.env.INVOICE_ADMIN_KEY || ''}`;

        return NextResponse.redirect(new URL(invoiceUrl, request.url));

    } catch (error) {
        console.error('Error generating invoice:', error);
        return NextResponse.json({ message: 'Failed to generate invoice' }, { status: 500 });
    }
}
