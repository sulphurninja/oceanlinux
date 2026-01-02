// src/pages/api/signup.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../../models/userModel'; // Adjust the import path to your User model
import connectDB from '../../../lib/db'; // Adjust the import path for database connection
import { NextRequest, NextResponse } from 'next/server';
import EmailService from '../../../lib/sendgrid';

export async function POST(request) {
    await connectDB();

    try {
        const reqBody = await request.json();
        const { name, email, password } = reqBody;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return new NextResponse(JSON.stringify({ message: 'User already exists' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Hash password before storing
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create new user
        const newUser = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        const tokenData = {
            id: newUser._id,
            email: newUser.email,
        };
        // Generate the JWT token
        const token = jwt.sign(tokenData, process.env.TOKEN_SECRET, { expiresIn: "1d" });

        // Send welcome email
        try {
            const emailService = new EmailService();
            await emailService.sendWelcomeEmail(newUser.email, newUser.name);
        } catch (emailError) {
            // Don't fail signup if email fails
            console.error('Welcome email failed:', emailError);
        }


        // Send success response
        return new NextResponse(JSON.stringify({ user: newUser, token }), {
            status: 201,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        return new NextResponse(JSON.stringify({ message: 'Something went wrong.' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}
