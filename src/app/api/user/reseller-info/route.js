import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/userModel';
import Reseller from '@/models/resellerModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function GET(request) {
    await connectDB();

    try {
        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const user = await User.findById(userId);
        console.log('Reseller Info User:', {
            id: user?._id,
            type: user?.userType,
            resellerId: user?.resellerId
        });

        if (!user) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        if (user.userType !== 'reseller') {
            console.log('User Type mismatch:', user.userType);
        }
        if (!user.resellerId) {
            console.log('Reseller ID missing');
        }

        if (user.userType !== 'reseller' || !user.resellerId) {
            return NextResponse.json({ success: false, message: 'Not a reseller' }, { status: 403 });
        }

        const reseller = await Reseller.findById(user.resellerId).select('+apiSecret');

        return NextResponse.json({
            success: true,
            data: {
                user: {
                    name: user.name,
                    email: user.email
                },
                reseller
            }
        });

    } catch (error) {
        console.error('Error fetching reseller info:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
