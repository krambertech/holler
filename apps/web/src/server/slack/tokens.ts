const IV_BYTES = 12;

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("SLACK_TOKEN_KEY must be 32 bytes, base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function encryptToken(token: string, base64Key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importKey(base64Key),
    new TextEncoder().encode(token),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

export async function decryptToken(stored: string, base64Key: string): Promise<string> {
  const [iv, sealed] = stored.split(".");
  if (!iv || !sealed) throw new Error("Stored Slack token is malformed");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await importKey(base64Key),
    fromBase64(sealed),
  );
  return new TextDecoder().decode(plain);
}
