import jwt from 'jsonwebtoken'
import { NextRequest } from "next/server"

// Custom error class for auth errors
export class AuthError extends Error {
    code: string;
    
    constructor(message: string, code: string) {
        super(message);
        this.code = code;
        this.name = 'AuthError';
    }
}

export const getDataFromToken = (request: NextRequest) => {
    try {
        // Retrieve the token from the cookies
        const token = request.cookies.get("token")?.value || '';
        
        // Check if token exists
        if (!token) {
            throw new AuthError(
                'No authentication token found. Please log in.',
                'NO_TOKEN'
            );
        }
        
        // Verify and decode the token using the secret key
        const decodedToken: any = jwt.verify(token, process.env.TOKEN_SECRET!);
        
        // Check if token has user ID
        if (!decodedToken.id) {
            throw new AuthError(
                'Invalid token structure. Please log in again.',
                'INVALID_TOKEN'
            );
        }
        
        // Return the user ID from the decoded token
        return decodedToken.id;

    } catch (error: any) {
        // Handle specific JWT errors with user-friendly messages
        if (error instanceof AuthError) {
            throw error;
        }
        
        if (error.name === 'TokenExpiredError') {
            throw new AuthError(
                'Your session has expired. Please log in again to continue.',
                'SESSION_EXPIRED'
            );
        }
        
        if (error.name === 'JsonWebTokenError') {
            if (error.message.includes('malformed')) {
                throw new AuthError(
                    'Invalid authentication. Please log in again.',
                    'TOKEN_MALFORMED'
                );
            }
            if (error.message.includes('invalid signature')) {
                throw new AuthError(
                    'Authentication error. Please log in again.',
                    'TOKEN_INVALID'
                );
            }
            throw new AuthError(
                'Authentication failed. Please log in again.',
                'TOKEN_ERROR'
            );
        }
        
        if (error.name === 'NotBeforeError') {
            throw new AuthError(
                'Session not yet valid. Please try again.',
                'TOKEN_NOT_ACTIVE'
            );
        }
        
        // Generic error
        throw new AuthError(
            'Authentication error. Please log in again.',
            'AUTH_ERROR'
        );
    }
}

// Helper to check token without throwing (returns null if invalid)
export const getDataFromTokenSafe = (request: NextRequest): string | null => {
    try {
        return getDataFromToken(request);
    } catch {
        return null;
    }
}

// Helper to get detailed auth error response
export const getAuthErrorResponse = (error: any) => {
    const isAuthError = error instanceof AuthError;
    
    return {
        success: false,
        message: isAuthError ? error.message : 'Authentication required',
        code: isAuthError ? error.code : 'AUTH_ERROR',
        requiresLogin: true
    };
}