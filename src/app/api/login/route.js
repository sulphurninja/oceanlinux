// src/pages/api/login.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../../models/userModel'
import connectDB from '../../../lib/db'; // Make sure to implement dbConnect to handle your database connection
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request) {
    await connectDB();

    try {
        const reqBody = await request.json();
        const { email, password } = reqBody;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
            return new NextResponse(JSON.stringify({ message: "User doesn't exist." }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Verify password using bcrypt
        let isPasswordValid = false;
        let needsPasswordUpgrade = false;

        try {
            // Try bcrypt comparison first (for properly hashed passwords)
            isPasswordValid = await bcrypt.compare(password, existingUser.password);
        } catch (bcryptError) {
            // If bcrypt fails, password might be plain text (legacy users)
            console.log('Bcrypt comparison failed, checking plain text fallback');
        }

        // Fallback: Check if it's a plain text password (for users created before bcrypt implementation)
        if (!isPasswordValid && password === existingUser.password) {
            console.log('Plain text password match - will upgrade to bcrypt');
            isPasswordValid = true;
            needsPasswordUpgrade = true;
        }

        if (!isPasswordValid) {
            return new NextResponse(JSON.stringify({ message: 'Invalid credentials.' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // If user had plain text password, upgrade it to bcrypt hash
        if (needsPasswordUpgrade) {
            console.log('Upgrading plain text password to bcrypt hash');
            const hashedPassword = await bcrypt.hash(password, 12);
            existingUser.password = hashedPassword;
            await existingUser.save();
            console.log('Password upgraded successfully');
        }

        // Generate token
        const token = jwt.sign({ email: existingUser.email, id: existingUser._id }, process.env.TOKEN_SECRET, { expiresIn: '1h' });

        // Set cookie with the token
        const response = new NextResponse(JSON.stringify({ result: existingUser }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',  // Ensure secure flag in production for HTTPS
            sameSite: 'strict',  // Cross-site cookie sending protection
            path: '/'  // Make the cookie available across the entire site
        });

        // Send success response
        return response;
    } catch (error) {
        return new NextResponse(JSON.stringify({ message: 'Something went wrong.' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}
