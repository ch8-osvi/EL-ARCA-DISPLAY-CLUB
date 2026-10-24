export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 180;
export type VoiceAudio = { data: string; mimeType: string; seconds?: number };
const allowed = new Set([
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/flac",
  "audio/aac",
]);
export function validateAudio(input: unknown): VoiceAudio | undefined {
  if (input == null) return undefined;
  const a = input as VoiceAudio;
  if (
    !a ||
    typeof a !== "object" ||
    typeof a.data !== "string" ||
    typeof a.mimeType !== "string"
  )
    throw new Error("Audio inválido");
  const mimeType = a.mimeType.split(";")[0].trim().toLowerCase();
  if (
    !allowed.has(mimeType) ||
    !a.data ||
    a.data.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(a.data)
  )
    throw new Error("Formato o tamaño de audio inválido");
  const bytes = Buffer.from(a.data, "base64");
  if (bytes.length > MAX_AUDIO_BYTES || bytes.toString("base64") !== a.data)
    throw new Error("Audio inválido");
  if (
    a.seconds != null &&
    (!Number.isFinite(a.seconds) ||
      a.seconds < 0 ||
      a.seconds > MAX_AUDIO_SECONDS)
  )
    throw new Error("La nota de voz supera tres minutos");
  return {
    data: a.data,
    mimeType,
    ...(a.seconds != null ? { seconds: a.seconds } : {}),
  };
}
