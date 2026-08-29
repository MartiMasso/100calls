const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"];

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function required(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function gmailOAuthConfig() {
  return {
    clientId: required("GOOGLE_GMAIL_CLIENT_ID"),
    clientSecret: required("GOOGLE_GMAIL_CLIENT_SECRET"),
    redirectUri: env("GOOGLE_GMAIL_REDIRECT_URI") || "https://www.100calls.co/api/auth/gmail/callback",
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(value, "base64url"));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createOAuthState(userId: string, nonce: string): Promise<string> {
  const { clientSecret } = gmailOAuthConfig();
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ userId, nonce, exp: Date.now() + 10 * 60 * 1000 })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(clientSecret), new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyOAuthState(state: string, expectedNonce: string): Promise<{ userId: string } | null> {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const { clientSecret } = gmailOAuthConfig();
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(clientSecret), base64UrlToBytes(signature), new TextEncoder().encode(payload));
  if (!valid) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { userId?: unknown; nonce?: unknown; exp?: unknown };
    return typeof parsed.userId === "string" && parsed.nonce === expectedNonce && typeof parsed.exp === "number" && parsed.exp > Date.now()
      ? { userId: parsed.userId }
      : null;
  } catch {
    return null;
  }
}

export function googleAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = gmailOAuthConfig();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${query}`;
}

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export async function exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = gmailOAuthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const result = await response.json() as GoogleTokenResponse & { error?: string };
  if (!response.ok) throw new Error(`Google token exchange failed: ${result.error || response.status}`);
  return result;
}

export async function verifyGoogleIdentity(idToken: string): Promise<{ email: string } | null> {
  const { clientId } = gmailOAuthConfig();
  const response = await fetch(`${GOOGLE_TOKEN_INFO_URL}?${new URLSearchParams({ id_token: idToken })}`, { cache: "no-store" });
  if (!response.ok) return null;
  const result = await response.json() as { aud?: unknown; email?: unknown; email_verified?: unknown };
  return result.aud === clientId && result.email_verified === "true" && typeof result.email === "string"
    ? { email: result.email }
    : null;
}

async function encryptionKey(): Promise<CryptoKey> {
  const { clientSecret } = gmailOAuthConfig();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`100calls:gmail:v1:${clientSecret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptRefreshToken(refreshToken: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(refreshToken));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptRefreshToken(value: string): Promise<string> {
  const [version, iv, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("The stored Gmail credential is invalid.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(iv) }, await encryptionKey(), base64UrlToBytes(ciphertext));
  return new TextDecoder().decode(plaintext);
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = gmailOAuthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const result = await response.json() as { access_token?: unknown; error?: unknown };
  if (!response.ok || typeof result.access_token !== "string") throw new Error(`Gmail access refresh failed: ${String(result.error || response.status)}`);
  return result.access_token;
}

export async function revokeGoogleToken(refreshToken: string): Promise<void> {
  const response = await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
    cache: "no-store",
  });
  if (!response.ok) console.error("Google did not confirm Gmail token revocation", { status: response.status });
}

function encodeHeader(value: string): string {
  return /[^\x20-\x7E]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=` : value;
}

export async function sendGmailMessage(accessToken: string, fromEmail: string, to: string, subject: string, body: string): Promise<string> {
  const raw = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject.replace(/[\r\n]+/g, " "))}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body.replace(/\r?\n/g, "\r\n"),
  ].join("\r\n");
  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(raw, "utf8").toString("base64url") }),
    cache: "no-store",
  });
  const result = await response.json() as { id?: unknown; error?: { message?: unknown } };
  if (!response.ok || typeof result.id !== "string") throw new Error(typeof result.error?.message === "string" ? result.error.message : "Gmail rejected the message.");
  return result.id;
}
