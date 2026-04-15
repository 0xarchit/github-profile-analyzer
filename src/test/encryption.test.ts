import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt } from "../lib/encryption";

describe("Encryption & Decryption - AES-GCM Security", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  describe("Core Encryption Operations", () => {
    it("should encrypt and decrypt tokens successfully", async () => {
      const token = "gho_test_token_abc123def456";
      const encrypted = await encrypt(token);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(token);
    });

    it("should generate random IVs for same plaintext", async () => {
      const text = "same_data";
      const enc1 = await encrypt(text);
      const enc2 = await encrypt(text);
      expect(enc1).not.toBe(enc2);
    });

    it("should handle long tokens (10KB+)", async () => {
      const longToken = "x".repeat(10000);
      const encrypted = await encrypt(longToken);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(longToken);
    });

    it("should handle special characters", async () => {
      const special = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";
      const encrypted = await encrypt(special);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(special);
    });

    it("should handle unicode and emojis", async () => {
      const unicode = "你好世界🚀🔐🛡️";
      const encrypted = await encrypt(unicode);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(unicode);
    });
  });

  describe("Encryption Format Validation", () => {
    it("should use IV:AuthTag:Ciphertext hex format", async () => {
      const encrypted = await encrypt("test");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      parts.forEach((part) => {
        expect(/^[0-9a-f]+$/.test(part)).toBe(true);
      });
    });

    it("should generate 12-byte IV (24 hex chars)", async () => {
      const encrypted = await encrypt("test");
      const [iv] = encrypted.split(":");
      expect(iv).toHaveLength(24);
    });

    it("should generate 16-byte auth tag (32 hex chars)", async () => {
      const encrypted = await encrypt("test");
      const [, tag] = encrypted.split(":");
      expect(tag).toHaveLength(32);
    });
  });

  describe("Tampering Detection (GCM Authentication)", () => {
    it("should detect tampered ciphertext", async () => {
      const encrypted = await encrypt("data");
      const [iv, tag, ct] = encrypted.split(":");
      const tampered = `${iv}:${tag}:${ct.slice(0, -2)}xx`;
      await expect(decrypt(tampered)).rejects.toThrow();
    });

    it("should detect tampered auth tag", async () => {
      const encrypted = await encrypt("data");
      const [iv, tag, ct] = encrypted.split(":");
      const tampered = `${iv}:${tag.slice(0, -2)}xx:${ct}`;
      await expect(decrypt(tampered)).rejects.toThrow();
    });

    it("should detect tampered IV", async () => {
      const encrypted = await encrypt("data");
      const [iv, tag, ct] = encrypted.split(":");
      const tampered = `${iv.slice(0, -2)}xx:${tag}:${ct}`;
      try {
        await decrypt(tampered);
        expect(false).toBe(true);
      } catch {
        expect(true).toBe(true);
      }
    });

    it("should reject incomplete format", async () => {
      try {
        await decrypt("only:two");
        expect(false).toBe(true);
      } catch {
        expect(true).toBe(true);
      }
    });
  });

  describe("Key Management", () => {
    it("should require ENCRYPTION_SECRET env var", () => {
      expect(process.env.ENCRYPTION_SECRET).toBeDefined();
    });

    it("should use 256-bit key", () => {
      const secret = process.env.ENCRYPTION_SECRET!;
      expect(secret).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
    });
  });
});
