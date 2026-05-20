let cachedFont: string | null = null;

export async function loadTurkishPdfFont(): Promise<string | null> {
  if (cachedFont) return cachedFont;
  try {
    const url = 'https://cdn.jsdelivr.net/npm/roboto-font@0.1.0/fonts/Roboto/roboto-regular-webfont.ttf';
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.byteLength; i += chunk) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
    }
    cachedFont = btoa(binary);
    return cachedFont;
  } catch {
    return null;
  }
}
