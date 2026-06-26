import jwt from 'jsonwebtoken';

export function createAuthToken(user) {
  return jwt.sign(
    { email: user.email, id: user._id },
    process.env.TOKEN_SECRET,
    { expiresIn: '1h' }
  );
}

export function setAuthCookie(response, user) {
  const token = createAuthToken(user);
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  return response;
}

export function sanitizeAuthUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    userType: user.userType,
    avatar: user.avatar || '',
    authProvider: user.authProvider || 'local',
  };
}
