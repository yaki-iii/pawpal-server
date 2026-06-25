import { encryptField, decryptField, hashField } from '../src/utils/crypto';

// Mock config to use a stable key for testing
jest.mock('../src/config', () => ({
  config: {
    encryption: {
      key: 'test-encryption-key-32bytes-ok!!!',
    },
  },
}));

describe('Crypto Utils', () => {
  describe('encryptField / decryptField', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = '13800138000';
      const encrypted = encryptField(plaintext);

      // Encrypted should be different from plaintext
      expect(encrypted).not.toBe(plaintext);

      // Decrypted should match original
      const decrypted = decryptField(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'sensitive-data';
      const enc1 = encryptField(plaintext);
      const enc2 = encryptField(plaintext);

      // Due to random IV, ciphertexts should differ
      expect(enc1).not.toBe(enc2);

      // But both should decrypt to the same value
      expect(decryptField(enc1)).toBe(plaintext);
      expect(decryptField(enc2)).toBe(plaintext);
    });

    it('should handle empty string input', () => {
      expect(encryptField('')).toBe('');
      expect(decryptField('')).toBe('');
    });

    it('should handle Unicode characters', () => {
      const plaintext = '张三的电话号码🔒';
      const encrypted = encryptField(plaintext);
      const decrypted = decryptField(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(1000);
      const encrypted = encryptField(plaintext);
      const decrypted = decryptField(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce ciphertext in iv:authTag:data format', () => {
      const encrypted = encryptField('test');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      // IV should be 32 hex chars (16 bytes)
      expect(parts[0].length).toBe(32);
      // AuthTag should be 32 hex chars (16 bytes)
      expect(parts[1].length).toBe(32);
    });

    it('should throw on invalid encrypted format', () => {
      expect(() => decryptField('invalid-data')).toThrow();
      expect(() => decryptField('only:two:parts:extra')).toThrow();
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encryptField('secret');
      const parts = encrypted.split(':');
      // Tamper with the encrypted data
      const tampered = `${parts[0]}:${parts[1]}:ffffffff`;
      expect(() => decryptField(tampered)).toThrow();
    });
  });

  describe('hashField', () => {
    it('should produce a SHA-256 hash', () => {
      const hash = hashField('test-value');
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex chars
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce consistent hashes for same input', () => {
      const hash1 = hashField('test-value');
      const hash2 = hashField('test-value');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashField('value1');
      const hash2 = hashField('value2');
      expect(hash1).not.toBe(hash2);
    });
  });
});
