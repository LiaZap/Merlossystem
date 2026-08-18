import { v2 as cloudinary } from "cloudinary"

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export interface UploadResult {
  url: string
  publicId: string
  thumbnailUrl?: string
  width?: number
  height?: number
  duration?: number
  bytes: number
  format: string
  resourceType: string
}

export async function uploadToCloudinary(
  buffer: Buffer,
  options: {
    folder?: string
    resourceType?: "image" | "video" | "raw" | "auto"
    filename?: string
  } = {}
): Promise<UploadResult> {
  const { folder = "merlos-store", resourceType = "auto", filename } = options

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: filename
          ? filename.replace(/\.[^.]+$/, "")
          : undefined,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Upload failed"))
          return
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          thumbnailUrl:
            result.resource_type === "image"
              ? cloudinary.url(result.public_id, {
                  width: 200,
                  height: 200,
                  crop: "fill",
                  quality: "auto",
                  format: "webp",
                })
              : result.resource_type === "video"
                ? cloudinary.url(result.public_id, {
                    width: 200,
                    height: 200,
                    crop: "fill",
                    resource_type: "video",
                    format: "jpg",
                    start_offset: "1",
                  })
                : undefined,
          width: result.width,
          height: result.height,
          duration: result.duration,
          bytes: result.bytes,
          format: result.format,
          resourceType: result.resource_type,
        })
      }
    )

    uploadStream.end(buffer)
  })
}

export async function uploadFromUrl(
  url: string,
  options: {
    folder?: string
    resourceType?: "image" | "video" | "raw" | "auto"
  } = {}
): Promise<UploadResult> {
  const { folder = "merlos-store", resourceType = "auto" } = options

  const result = await cloudinary.uploader.upload(url, {
    folder,
    resource_type: resourceType,
  })

  return {
    url: result.secure_url,
    publicId: result.public_id,
    thumbnailUrl:
      result.resource_type === "image"
        ? cloudinary.url(result.public_id, {
            width: 200,
            height: 200,
            crop: "fill",
            quality: "auto",
            format: "webp",
          })
        : undefined,
    width: result.width,
    height: result.height,
    duration: result.duration,
    bytes: result.bytes,
    format: result.format,
    resourceType: result.resource_type,
  }
}

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: string = "image"
): Promise<void> {
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  })
}

export function getFileTypeFromMime(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  return "document"
}

export function getCloudinaryResourceType(
  fileType: string
): "image" | "video" | "raw" {
  if (fileType === "image") return "image"
  if (fileType === "video" || fileType === "audio") return "video"
  return "raw"
}
