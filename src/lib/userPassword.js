import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export function isBcryptHash(password) {
  return typeof password === 'string' && /^\$2[aby]\$\d{2}\$/.test(password);
}

export async function hashUserPassword(plainPassword) {
  return bcrypt.hash(String(plainPassword), BCRYPT_ROUNDS);
}

/** Verify login/current password — supports bcrypt and legacy plain text. */
export async function verifyUserPassword(plainPassword, storedPassword) {
  if (!storedPassword) return false;

  if (isBcryptHash(storedPassword)) {
    try {
      return await bcrypt.compare(String(plainPassword), storedPassword);
    } catch {
      return false;
    }
  }

  return String(plainPassword) === String(storedPassword);
}
