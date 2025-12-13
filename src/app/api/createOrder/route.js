import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
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
    const { productName, memory, transactionId, ipStockId, promoCode } = reqBody;

    // 3. Basic validation
    if (!productName || !memory || !transactionId || !ipStockId) {
      return NextResponse.json(
        { message: 'Missing required fields (productName, memory, transactionId, ipStockId)' },
        { status: 400 }
      );
    }

    // 4. SERVER-SIDE PRICE VALIDATION - Fetch actual price from database
    const ipStock = await IPStock.findById(ipStockId);
    if (!ipStock) {
      console.error(`[CreateOrder] IPStock not found: ${ipStockId}`);
      return NextResponse.json(
        { message: 'Product not found' },
        { status: 404 }
      );
    }

    // Check if product is available
    if (!ipStock.available) {
      return NextResponse.json(
        { message: 'This product is currently unavailable' },
        { status: 400 }
      );
    }

    // Get the actual price from the database for this memory option
    const memoryOption = ipStock.memoryOptions.get(memory);
    if (!memoryOption || !memoryOption.price) {
      console.error(`[CreateOrder] Memory option ${memory} not found for IPStock ${ipStockId}`);
      return NextResponse.json(
        { message: `Memory option ${memory} is not available for this product` },
        { status: 400 }
      );
    }

    // Server-validated price (from database, NOT from frontend)
    const originalPrice = memoryOption.price;
    let price = originalPrice;
    let promoDiscount = 0;

    // Validate promo code if provided
    if (promoCode) {
      const validPromo = ipStock.promoCodes.find(
        p => p.code.toUpperCase() === promoCode.toUpperCase() && p.isActive
      );

      if (validPromo) {
        if (validPromo.discountType === 'percentage') {
          promoDiscount = Math.round((originalPrice * validPromo.discount) / 100);
        } else {
          promoDiscount = validPromo.discount;
        }
        price = Math.max(1, originalPrice - promoDiscount);
        console.log(`[CreateOrder] Applied promo code ${promoCode}: ${originalPrice} - ${promoDiscount} = ${price}`);
      }
    }

    console.log(`[CreateOrder] Server-validated price: originalPrice=${originalPrice}, discount=${promoDiscount}, finalPrice=${price}`);

    // 5. Create a new order with server-validated price
    const newOrder = await Order.create({
      user: userId,
      productName,
      memory,
      price: Math.round(price),
      originalPrice: originalPrice,
      promoCode: promoDiscount > 0 ? promoCode : null,
      promoDiscount: promoDiscount,
      ipStockId: ipStockId,
      transactionId,      // Store user-entered transaction reference
      status: 'pending',   // Pending until admin verifies
    });

    // 6. Return success
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
