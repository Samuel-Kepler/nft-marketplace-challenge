export const AVATAR_MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_SIDE = 256;
/** Teto da data URL (o schema aceita até 200 000 caracteres; ~150 KB deixa folga e protege a quota do localStorage). */
export const AVATAR_MAX_OUTPUT_CHARS = 150_000;

/** Valida o arquivo escolhido antes de decodificar; devolve a mensagem de erro ou `null`. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return 'Escolha um arquivo de imagem.';
  if (file.size > AVATAR_MAX_INPUT_BYTES) return 'A imagem deve ter no máximo 2 MB.';
  return null;
}

/** Reduz proporcionalmente para caber em `max`×`max`, sem ampliar. */
export function fitWithin(width: number, height: number, max = AVATAR_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Redimensiona via `<canvas>` e devolve uma data URL JPEG dentro do limite; reduz a qualidade até caber. */
export async function resizeAvatar(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.5, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= AVATAR_MAX_OUTPUT_CHARS) return url;
  }
  throw new Error('Não foi possível reduzir a imagem o bastante.');
}
