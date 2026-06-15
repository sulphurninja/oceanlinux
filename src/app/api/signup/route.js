// src/pages/api/signup.js

import jwt from 'jsonwebtoken';
import User from '../../../models/userModel';
import connectDB from '../../../lib/db';
import { NextRequest, NextResponse } from 'next/server';
import EmailService from '../../../lib/sendgrid';
import { hashUserPassword } from '@/lib/userPassword';
import { findUserByEmail, normalizeEmail } from '@/lib/userEmail';

export async function POST(request) {
    await connectDB();

    try {
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

        const tokenData = {
            id: newUser._id,
            email: newUser.email,
        };
        const token = jwt.sign(tokenData, process.env.TOKEN_SECRET, { expiresIn: "1d" });

        try {
            const emailService = new EmailService();
            await emailService.sendWelcomeEmail(newUser.email, newUser.name);
        } catch (emailError) {
            console.error('Welcome email failed:', emailError);
        }

        return new NextResponse(JSON.stringify({ user: newUser, token }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
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
