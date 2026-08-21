import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request) {
    try {
        // Get token from httpOnly cookie
        const token = request.cookies.get('token')?.value;

        if (!token) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        // Verify token
        const decodedToken = jwt.verify(token, process.env.TOKEN_SECRET);

        return NextResponse.json({
            authenticated: true,
            user: {
                id: decodedToken.id,
                email: decodedToken.email
            }
        }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }
}
