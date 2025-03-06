import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function POST(request) {
  await connectDB();

  try {
    // 1. Check which user is making this purchase
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Read request data
    const reqBody = await request.json();
    const { productName, memory, price, transactionId } = reqBody;

    // 3. Basic validation
    if (!productName || !memory || !price || !transactionId) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 4. Create a new order
    const newOrder = await Order.create({
      user: userId,
      productName,
      memory,
      price,
      transactionId,      // Store user-entered transaction reference
      status: 'pending',   // Pending until admin verifies
    });

    // 5. Return success
    return NextResponse.json(
      {
        message: 'Order created successfully',
        order: newOrder
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}
