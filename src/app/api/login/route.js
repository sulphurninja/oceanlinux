// src/pages/api/login.js

import User from '../../../models/userModel'
import connectDB from '../../../lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyUserPassword } from '@/lib/userPassword';
import { findUserByEmail } from '@/lib/userEmail';
import { sanitizeAuthUser, setAuthCookie } from '@/lib/authSession';
import { enforceRateLimit } from '@/lib/rateLimit';

const INVALID_CREDENTIALS = 'Invalid email or password.';

export async function POST(request) {
    const rateLimited = enforceRateLimit(request, {
        max: 10,
        windowMs: 5 * 60_000,
        scope: 'ip',
        message: 'Too many login attempts. Please wait a few minutes and try again.',
    });
    if (rateLimited) return rateLimited;

    try {
        await connectDB();

        const reqBody = await request.json();
        const { email, password } = reqBody;

        const existingUser = await findUserByEmail(User, email);
        if (!existingUser) {
            return new NextResponse(JSON.stringify({ message: INVALID_CREDENTIALS }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        if (!existingUser.password && existingUser.googleId) {
            return new NextResponse(JSON.stringify({
                message: 'This account uses Google Sign-In. Please continue with Google.',
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        const isPasswordValid = await verifyUserPassword(password, existingUser.password);

        if (!isPasswordValid) {
            return new NextResponse(JSON.stringify({ message: INVALID_CREDENTIALS }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        const response = new NextResponse(JSON.stringify({ result: sanitizeAuthUser(existingUser) }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return setAuthCookie(response, existingUser);
    } catch (error) {
        console.error('[login]', error);
        const message = error?.message?.includes('MongoDB') || error?.code === 'ECONNREFUSED'
            ? 'Database connection failed. Please try again later.'
            : 'Something went wrong.';
        return new NextResponse(JSON.stringify({ message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}
