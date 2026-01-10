import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';
import User from '@/models/userModel';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Generate API credentials
const generateCredentials = () => {
    const apiKey = 'rz_' + crypto.randomBytes(16).toString('hex');
    const apiSecret = 'sec_' + crypto.randomBytes(32).toString('hex');
    return { apiKey, apiSecret };
};

export async function GET(request) {
    await connectDB();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const search = searchParams.get('search');

        // Get single reseller
        if (id) {
            const reseller = await Reseller.findById(id).populate('userId', 'name email');
            if (!reseller) {
                return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
            }
            return NextResponse.json({ success: true, reseller });
        }

        // List resellers
        const query = {};
        if (search) {
            query.$or = [
                { businessName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const resellers = await Reseller.find(query)
            .sort({ createdAt: -1 })
            .select('-password -apiSecret'); // Exclude sensitive data

        return NextResponse.json({
            success: true,
            resellers
        });

    } catch (error) {
        console.error('Error fetching resellers:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    await connectDB();

    try {
        const body = await request.json();
        const { businessName, email, password, phone, adminUserId } = body;

        // Check existing
        const existing = await Reseller.findOne({ email });
        if (existing) {
            return NextResponse.json({ success: false, message: 'Email already registered' }, { status: 400 });
        }

        // Generate API keys
        const { apiKey, apiSecret } = generateCredentials();

        // Create Reseller
        const reseller = await Reseller.create({
            businessName,
            email,
            password, // Middleware will hash this
            phone,
            apiKey,
            apiSecret, // Ideally should hash this too, but storing plain for now for display
            status: 'active',
            isVerified: true,
            wallet: {
                balance: 0,
                currency: 'INR'
            }
        });

        // Check or Create User Account
        let user;
        if (adminUserId) {
            user = await User.findById(adminUserId);
        } else {
            user = await User.findOne({ email });
        }

        if (!user) {
            // Create new user for the reseller
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = await User.create({
                name: businessName,
                email,
                password: hashedPassword,
                phone,
                userType: 'reseller',
                isVerified: true
            });
        } else {
            // Update existing user to be a reseller
            user.userType = 'reseller';
            if (!user.resellerId) {
                // Only update if not already linked (or overwrite if needed, but let's be safe)
            }
        }

        // Link them
        reseller.userId = user._id;
        await reseller.save();

        user.resellerId = reseller._id;
        await user.save();

        return NextResponse.json({
            success: true,
            message: 'Reseller created successfully',
            reseller: {
                id: reseller._id,
                businessName: reseller.businessName,
                email: reseller.email,
                apiKey,
                apiSecret
            }
        });

    } catch (error) {
        console.error('Error creating reseller:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
