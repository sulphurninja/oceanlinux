import connectDB from "@/lib/db";
import Order from "@/models/orderModel";
import User from "@/models/userModel";
import { requireAdmin } from "@/lib/adminAuth";
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
    try {
        await connectDB();

        const admin = await requireAdmin(request);
        if (!admin) {
            return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
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

        if (!order.transactionId) {
            return NextResponse.json({ message: 'Order has no transaction ID for invoice' }, { status: 400 });
        }

        const invoiceUrl = `/api/invoices/generate?txId=${encodeURIComponent(order.transactionId)}`;

        return NextResponse.redirect(new URL(invoiceUrl, request.url));

    } catch (error) {
        console.error('Error generating invoice:', error);
        return NextResponse.json({ message: 'Failed to generate invoice' }, { status: 500 });
    }
}
