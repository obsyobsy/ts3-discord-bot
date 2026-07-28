function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyDiscordRequest(
  request: Request,
  publicKeyHex: string
): Promise<{ ok: boolean; body: string }> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();

  if (!signature || !timestamp || !publicKeyHex) {
    return { ok: false, body };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(publicKeyHex),
    "Ed25519",
    false,
    ["verify"]
  );

  const data = new TextEncoder().encode(`${timestamp}${body}`);
  const ok = await crypto.subtle.verify(
    "Ed25519",
    key,
    hexToBytes(signature),
    data
  );

  return { ok, body };
}
