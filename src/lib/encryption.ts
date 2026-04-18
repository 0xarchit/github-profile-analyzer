import { sendTelegramAlert } from "./telegram-alert";

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;

if (!ENCRYPTION_SECRET) {
  throw new Error(
    "CRITICAL_SECURITY_FAILURE: ENCRYPTION_SECRET environment variable is missing.",
  );
}

if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_SECRET)) {
  throw new Error(
    "CRITICAL_SECURITY_FAILURE: ENCRYPTION_SECRET must be a 32-byte hex string (64 characters).",
  );
}

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("INVALID_HEX");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const ALGORITHM_NAME = "AES-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

async function getKey(): Promise<CryptoKey> {
  const keyBuffer = hexToUint8Array(ENCRYPTION_SECRET!);
  return crypto.subtle.importKey(
    "raw",
    keyBuffer as unknown as BufferSource,
    ALGORITHM_NAME,
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(text: string): Promise<string> {
  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(text);

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: ALGORITHM_NAME, iv, tagLength: TAG_LENGTH * 8 } as AesGcmParams,
      key,
      encoded as unknown as BufferSource,
    );

    const fullArray = new Uint8Array(encryptedBuffer);
    const ciphertext = fullArray.slice(0, -TAG_LENGTH);
    const authTag = fullArray.slice(-TAG_LENGTH);

    return `${uint8ArrayToHex(iv)}:${uint8ArrayToHex(authTag)}:${uint8ArrayToHex(ciphertext)}`;
  } catch (error) {
    void sendTelegramAlert({
      source: "ENCRYPTION",
      message: "Encryption failed",
      error,
    }).catch(() => null);
    throw error;
  }
}

export async function decrypt(hash: string): Promise<string> {
  if (!hash.includes(":")) {
    throw new Error("DECRYPTION_FAILURE: Expected encrypted payload.");
  }

  try {
    const [ivHex, authTagHex, encryptedTextHex] = hash.split(":");

    if (!ivHex || !authTagHex || !encryptedTextHex) {
      throw new Error("MALFORMED_CIPHERTEXT");
    }

    const key = await getKey();
    const iv = hexToUint8Array(ivHex);
    const authTag = hexToUint8Array(authTagHex);
    const ciphertext = hexToUint8Array(encryptedTextHex);

    const combined = new Uint8Array(ciphertext.length + authTag.length);
    combined.set(ciphertext);
    combined.set(authTag, ciphertext.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: ALGORITHM_NAME, iv, tagLength: TAG_LENGTH * 8 } as AesGcmParams,
      key,
      combined as unknown as BufferSource,
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    void sendTelegramAlert({
      source: "DECRYPTION",
      message: "Decryption failed",
      error,
    }).catch(() => null);
    throw new Error(
      "DECRYPTION_FAILURE: Authentication failed or corrupt payload.",
    );
  }
}
