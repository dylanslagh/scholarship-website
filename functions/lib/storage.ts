import type { Env } from "./env";

// Allowed upload types by field. Signatures are PNGs produced by the signature pad.
export const DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "image/jpeg",
  "image/png",
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface StoredFile {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

// Sanitize a user-supplied filename to a safe key segment.
function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return cleaned || "file";
}

// Store an uploaded File in R2 under applications/{appId}/{label}-{filename}.
export async function putUpload(
  env: Env,
  appId: string,
  label: string,
  file: File
): Promise<StoredFile> {
  const key = `applications/${appId}/${label}-${safeName(file.name)}`;
  await env.UPLOADS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { originalName: file.name },
  });
  return { key, filename: file.name, contentType: file.type, size: file.size };
}

// Store raw bytes (used for signature PNGs decoded from a data URL).
export async function putBytes(
  env: Env,
  key: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<string> {
  await env.UPLOADS.put(key, bytes, { httpMetadata: { contentType } });
  return key;
}

// Validate a File against type + size limits. Returns an error string or null.
export function validateFile(file: File, allowed: string[] = DOC_TYPES): string | null {
  if (file.size === 0) return "File is empty.";
  if (file.size > MAX_FILE_BYTES) return "File is larger than 10 MB.";
  if (allowed.length && file.type && !allowed.includes(file.type)) {
    return "Unsupported file type. Use PDF, DOCX, JPG, or PNG.";
  }
  return null;
}

// Decode a "data:image/png;base64,...." signature into an ArrayBuffer.
export function decodeDataUrl(dataUrl: string): { bytes: ArrayBuffer; contentType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!match) return null;
  const contentType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes: bytes.buffer, contentType };
}
