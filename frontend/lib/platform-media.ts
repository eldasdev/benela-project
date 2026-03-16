import { authFetch } from "@/lib/auth-fetch";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

export type UploadedPlatformImage = {
  url: string;
  asset_type: string;
  width: number;
  height: number;
  content_type: string;
  size_bytes: number;
  file_name: string;
};

async function parseError(res: Response, fallback: string): Promise<string> {
  const payload = await res.json().catch(() => null);
  return payload?.detail || fallback;
}

export async function uploadAdminPlatformImage(file: File, assetType = "general"): Promise<UploadedPlatformImage> {
  const formData = new FormData();
  formData.append("asset_type", assetType);
  formData.append("file", file);
  const res = await authFetch(`${API}/admin/media/images`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not upload image."));
  return (await res.json()) as UploadedPlatformImage;
}
