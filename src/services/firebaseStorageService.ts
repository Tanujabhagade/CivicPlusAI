import { ref, uploadBytes, getDownloadURL, type StorageReference } from "firebase/storage";
import { storage, isFirebaseConfigured } from "@/lib/firebase";

/**
 * Checks if an image URL is a persistent reference (HTTPS or data URL),
 * strictly rejecting temporary browser session `blob:` URLs.
 */
export function isDurableImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("blob:")) return false;
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("gs://")
  );
}

/**
 * Sanitizes an image reference from Firestore or state.
 * Returns undefined for temporary or invalid `blob:` URLs to handle missing
 * images gracefully without inventing replacement URLs.
 */
export function sanitizeImageUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("blob:")) return undefined;
  if (!isDurableImageUrl(trimmed)) return undefined;
  return trimmed;
}

/**
 * Converts a base64 data URL string into a native binary Blob for Firebase Storage upload.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const bstr = atob(parts[1] || "");
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Uploads an image file, blob, or data URL to Firebase Storage and returns its permanent HTTPS download URL.
 * Throws on failure to ensure upload errors are handled clearly and never masked with temporary URLs.
 */
export async function uploadEvidenceImage(
  input: File | Blob | string,
  path: string,
): Promise<string> {
  if (!input) {
    throw new Error("No image data provided for upload.");
  }

  // If already a durable HTTPS URL, return as-is
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("blob:")) {
      throw new Error(
        "Temporary browser blob URLs cannot be uploaded without the underlying File or Blob reference.",
      );
    }
  }

  // Convert data URL to Blob if necessary
  let fileOrBlob: File | Blob;
  if (typeof input === "string") {
    if (input.startsWith("data:")) {
      fileOrBlob = dataUrlToBlob(input);
    } else {
      throw new Error("Unrecognized image data format for upload.");
    }
  } else {
    fileOrBlob = input;
  }

  // Ensure clean storage path without leading slashes
  const cleanPath = path.replace(/^\/+/, "");

  if (!isFirebaseConfigured || !storage) {
    // Local / Offline demo fallback: convert to Data URL for in-memory persistence
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to process image locally."));
      reader.readAsDataURL(fileOrBlob);
    });
  }

  try {
    const storageRef: StorageReference = ref(storage, cleanPath);
    const contentType = fileOrBlob.type || "image/jpeg";
    const snapshot = await uploadBytes(storageRef, fileOrBlob, {
      contentType,
      customMetadata: {
        uploadedAt: new Date().toISOString(),
      },
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CivicPulse Storage] Firebase Storage upload failed:", message);
    throw new Error(`Firebase Storage upload failed: ${message}`);
  }
}

export const uploadStorageImage = uploadEvidenceImage;

