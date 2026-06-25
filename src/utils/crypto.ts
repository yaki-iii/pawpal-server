import crypto from 'crypto';
import { config } from '../config';

/**
 * AES-256-GCM encryption/decryption utility.
 * Used for encrypting sensitive fields (e.g., phone numbers) at rest.
 *
 * Format: iv:authTag:encryptedData (all hex-encoded)
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key as a 32-byte buffer.
 */
function getKey(): Buffer {
  const keyString = config.encryption.key;
  // Pad or hash to ensure 32 bytes
  if (keyString.length === 32) {
    return Buffer.from(keyString, 'utf8');
  }
  return crypto.createHash('sha256').update(keyString).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @returns Formatted string: iv:authTag:encryptedData
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return '';

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * @param encrypted - Formatted string: iv:authTag:encryptedData
 * @returns Original plaintext
 */
export function decryptField(encrypted: string): string {
  if (!encrypted) return '';

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, dataHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(dataHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Hash a value using SHA-256 (for non-reversible hashing like search indices).
 */
export function hashField(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
