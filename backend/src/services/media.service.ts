import cloudinary from "../libs/cloudinary.js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function parseMedia(value: unknown, kind: "image" | "audio") {
  if (typeof value !== "string") throw new HttpError(400, `Invalid ${kind}`);
  const match =
    /^data:([^;,]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  const allowed =
    kind === "image"
      ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
      : ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"];
  if (!match || !allowed.includes(match[1]))
    throw new HttpError(400, `Unsupported ${kind} format`);
  const data = match[2].replace(/\s/g, "");
  if (Buffer.from(data, "base64").length > 10 * 1024 * 1024)
    throw new HttpError(413, "Maximum attachment size is 10 MB");
  return { mimeType: match[1], data };
}
export async function uploadMedia(value: string, kind: "image" | "audio") {
  const { mimeType, data } = parseMedia(value, kind);
  if (
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET ||
    !process.env.CLOUDINARY_CLOUD_NAME
  )
    throw new HttpError(
      503,
      "Media uploads are not configured. Add Cloudinary settings on the server.",
    );
  // Cloudinary expects a plain MIME data URI, without MediaRecorder codec parameters.
  // Keep the original MIME type and audio bytes; this is not transcoding.
  const source = `data:${mimeType};base64,${data}`;
  const result = await cloudinary.uploader.upload(source, {
    resource_type: kind === "audio" ? "video" : "image",
    folder: "chat",
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: kind === "audio" ? ("video" as const) : ("image" as const),
  };
}
