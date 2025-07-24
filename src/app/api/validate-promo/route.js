import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import IPStock from '../../../models/ipStockModel';

export async function POST(req) {
    try {
        const { promoCode, ipStockId, productPrice } = await req.json(); // Add productPrice
        
        await connectDB();
        
        const ipStock = await IPStock.findById(ipStockId);
        
        if (!ipStock) {
            return NextResponse.json({ 
                valid: false, 
                message: 'IP Stock not found' 
            }, { status: 404 });
        }
        
        const promo = ipStock.promoCodes.find(
            p => p.code.toLowerCase() === promoCode.toLowerCase() && p.isActive
        );
        
        if (promo) {
            let discountAmount = 0;
            let discountMessage = '';
            
            if (promo.discountType === 'fixed') {
                discountAmount = promo.discount;
                discountMessage = `₹${promo.discount} discount applied!`;
            } else {
                discountAmount = (productPrice * promo.discount) / 100;
                discountMessage = `${promo.discount}% discount applied!`;
            }
            
            return NextResponse.json({ 
                valid: true, 
                discount: promo.discount,
                discountType: promo.discountType,
                discountAmount: discountAmount,
                message: discountMessage
            });
        } else {
            return NextResponse.json({ 
                valid: false, 
                message: 'Invalid or inactive promo code' 
            });
        }
        
    } catch (error) {
        return NextResponse.json({ 
            valid: false, 
            message: 'Error validating promo code' 
        }, { status: 500 });
    }
}