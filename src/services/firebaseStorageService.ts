import { ref, uploadBytes, getDownloadURL, type StorageReference } from "firebase/storage";
import { storage, isFirebaseConfigured } from "@/lib/firebase";

export async function uploadEvidenceImage(file: File | Blob, path: string): Promise<string> {
  if (!isFirebaseConfigured || !storage) {
    // Local / Offline fallback: Convert to Data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  try {
    const storageRef: StorageReference = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });
    return await getDownloadURL(snapshot.ref);
  } catch (error) {
    console.warn(
      "[CivicPulse Storage] Firebase Storage upload error, falling back to base64:",
      error,
    );
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
