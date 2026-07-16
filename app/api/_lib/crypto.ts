const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getKey() {
  const raw = process.env.AI_ENCRYPTION_KEY;
  if (!raw) throw new Error("AI_ENCRYPTION_KEY is not configured");
  const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
  if (bytes.byteLength !== 32) throw new Error("AI_ENCRYPTION_KEY must decode to 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), encoder.encode(value));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
}

export async function decryptSecret(value: string) {
  const [ivPart, dataPart] = value.split(".");
  const iv = Uint8Array.from(atob(ivPart), (char) => char.charCodeAt(0));
  const data = Uint8Array.from(atob(dataPart), (char) => char.charCodeAt(0));
  return decoder.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await getKey(), data));
}

export function validateBaseUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const privateHost = host === "localhost" || host === "::1" || host === "0.0.0.0" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local");
  if (url.protocol !== "https:" || privateHost || url.username || url.password) throw new Error("仅支持公开的 HTTPS 模型地址");
  return url.toString().replace(/\/$/, "");
}
