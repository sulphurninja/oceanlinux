import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import APIKey from '@/models/apiKeyModel';
import { generateAPIKey } from '@/lib/api-utils';

export async function GET(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const apiKeys = await APIKey.find({ userId })
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json({ keys: apiKeys });
    } catch (error) {
        console.error('Error fetching API keys:', error);
        return NextResponse.json(
            { message: 'Failed to fetch API keys', error: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { name, description, permissions, expiresIn } = await request.json();

        if (!name || !permissions || permissions.length === 0) {
            return NextResponse.json(
                { message: 'Name and permissions are required' },
                { status: 400 }
            );
        }

        // Check if user already has maximum number of API keys (e.g., 10)
        const existingKeysCount = await APIKey.countDocuments({ userId });
        if (existingKeysCount >= 10) {
            return NextResponse.json(
                { message: 'Maximum number of API keys reached (10)' },
                { status: 400 }
            );
        }

        // Calculate expiration date
        let expiresAt = null;
        if (expiresIn && expiresIn !== 'never') {
            if (expiresIn.includes('d')) {
                const days = parseInt(expiresIn.replace('d', ''));
                expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
            } else if (expiresIn.includes('y')) {
                const years = parseInt(expiresIn.replace('y', ''));
                expiresAt = new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000);
            } else {
                // Custom date
                expiresAt = new Date(expiresIn);
            }
        }

        // Generate unique API key
        const apiKey = generateAPIKey();

        const newKey = new APIKey({
            userId,
            name,
            description,
            key: apiKey,
            permissions,
            expiresAt,
            isActive: true,
            usageCount: 0
        });

        await newKey.save();

        return NextResponse.json({
            message: 'API key created successfully',
            key: newKey
        });
    } catch (error) {
        console.error('Error creating API key:', error);
        return NextResponse.json(
            { message: 'Failed to create API key', error: error.message },
            { status: 500 }
        );
    }
}
