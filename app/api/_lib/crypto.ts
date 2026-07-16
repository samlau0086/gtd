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
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost = host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || (isIP(host) > 0 && !isPublicIp(host));
  if (url.protocol !== "https:" || privateHost || url.username || url.password) throw new Error("仅支持公开的 HTTPS 模型地址");
  return url.toString().replace(/\/$/, "");
}

function isPublicIp(address: string) {
  if (isIP(address) === 4) {
    const [a,b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224);
  }
  const value = address.toLowerCase();
  if (value.startsWith("::ffff:")) return isPublicIp(value.slice(7));
  return !(value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("2001:db8:"));
}

export async function assertPublicEndpoint(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("模型地址不能指向私有网络");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !isPublicIp(item.address))) {
    throw new Error("模型地址不能解析到私有网络");
  }
}
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
