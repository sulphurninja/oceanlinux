// src/pages/api/signup.js

import jwt from 'jsonwebtoken';
import User from '../../../models/userModel';
import connectDB from '../../../lib/db';
import { NextRequest, NextResponse } from 'next/server';
import EmailService from '../../../lib/sendgrid';
import { hashUserPassword } from '@/lib/userPassword';
import { findUserByEmail, normalizeEmail } from '@/lib/userEmail';
import { enforceRateLimit } from '@/lib/rateLimit';

export async function POST(request) {
    const rateLimited = enforceRateLimit(request, {
        max: 5,
        windowMs: 10 * 60_000,
        scope: 'ip',
        message: 'Too many signup attempts. Please wait a few minutes and try again.',
    });
    if (rateLimited) return rateLimited;

    try {
        await connectDB();

        const reqBody = await request.json();
        const { name, email, password } = reqBody;

        const trimmedName = String(name || '').trim();
        const normalizedEmail = normalizeEmail(email);

        if (!trimmedName || !normalizedEmail || !password) {
            return new NextResponse(JSON.stringify({ message: 'Name, email and password are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (String(password).length < 8) {
            return new NextResponse(JSON.stringify({ message: 'Password must be at least 8 characters' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Block only when email already exists (case-insensitive)
        const existingUser = await findUserByEmail(User, normalizedEmail);
        if (existingUser) {
            return new NextResponse(JSON.stringify({ message: 'An account with this email already exists' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const hashedPassword = await hashUserPassword(password);

        const newUser = await User.create({
            name: trimmedName,
            email: normalizedEmail,
            password: hashedPassword,
        });

        const token = jwt.sign(
            { id: newUser._id, email: newUser.email },
            process.env.TOKEN_SECRET,
            { expiresIn: '1d' }
        );

        try {
            const emailService = new EmailService();
            await emailService.sendWelcomeEmail(newUser.email, newUser.name);
        } catch (emailError) {
            console.error('Welcome email failed:', emailError);
        }

        const safeUser = {
            _id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            userType: newUser.userType,
        };

        const response = new NextResponse(JSON.stringify({ result: safeUser }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

        response.cookies.set('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
        });

        return response;
    } catch (error) {
        if (error?.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || 'field';
            const message =
                field === 'email'
                    ? 'An account with this email already exists'
                    : `Registration failed: duplicate ${field}`;
            return new NextResponse(JSON.stringify({ message }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.error('Signup error:', error);
        return new NextResponse(JSON.stringify({ message: 'Something went wrong.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
