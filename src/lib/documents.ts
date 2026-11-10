import type { ChefDocumentKind, DocumentKind, Vehicle } from "@/lib/types";

export const DOCUMENT_KINDS: DocumentKind[] = ["cin_front", "cin_back", "license", "vehicle_papers"];

export const requiredChefDocuments: ChefDocumentKind[] = ["cin_front"];

export const MIN_SHARP_PHOTO_BYTES = 100 * 1024;
export const MAX_SHARP_PHOTO_BYTES = 5 * 1024 * 1024;

export function sharpPhotoSize(size: number): boolean {
  return size >= MIN_SHARP_PHOTO_BYTES && size <= MAX_SHARP_PHOTO_BYTES;
}

export const SHARP_PHOTO_ERROR = "Please upload a clear, high-quality photo.";

export function requiredDocumentKinds(vehicle: Vehicle): DocumentKind[] {
  if (vehicle === "bike") return ["cin_front", "cin_back"];
  return ["license", "vehicle_papers"];
}

export function verificationRequired(email: string): boolean {
  return Boolean(email) && !email.endsWith("@drivers.wajbati.local") && !email.endsWith("@customers.wajbati.local");
}

export function documentsAreReady(vehicle: Vehicle, email: string, kinds: Iterable<DocumentKind>): boolean {
  if (!verificationRequired(email)) return true;
  const present = new Set(kinds);
  return requiredDocumentKinds(vehicle).every((kind) => present.has(kind));
}

export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionFor(contentType: "image/jpeg" | "image/png" | "image/webp"): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
