import { OAuth2Client } from 'google-auth-library';

function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
}

export function isGoogleAuthConfigured() {
  return Boolean(getGoogleClientId());
}

export async function verifyGoogleIdToken(idToken) {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error('Google Sign-In is not configured');
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Invalid Google account response');
  }

  if (payload.email_verified === false) {
    throw new Error('Google email is not verified');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name?.trim() || payload.email.split('@')[0],
    avatar: payload.picture || '',
  };
}
