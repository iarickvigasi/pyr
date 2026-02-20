import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT = 'pyr-email-enc';
const KEY_LENGTH = 32;

/**
 * Derive a 256-bit encryption key from JWT_SECRET via scrypt.
 * Cached per process to avoid redundant key derivation.
 */
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for encryption');
  }
  cachedKey = scryptSync(secret, SALT, KEY_LENGTH) as Buffer;
  return cachedKey;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns `iv:authTag:ciphertext` as hex-encoded string.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string produced by `encrypt()`.
 * Splits on `:` to extract iv, authTag, and ciphertext.
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Invalid encrypted string format');
  }

  const ivHex: string = parts[0];
  const authTagHex: string = parts[1];
  const ciphertext: string = parts[2];

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');

  return decrypted;
}
