/**
 * Gemini API client for Cloudflare Workers.
 * Uses the v1beta generateContent endpoint (current Gemini format).
 */
async function callGemini(apiKey, model, prompt, opts = {}) {
  if (!apiKey) throw new Error('GEMINI API key is required');
  const m = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        parts: [{ text: String(prompt) }],
      },
    ],
    generationConfig: {
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
      maxOutputTokens: typeof opts.maxOutputTokens === 'number' ? opts.maxOutputTokens : 1024,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data;
  try { data = await res.json(); } catch (e) { throw new Error('Invalid JSON response from Gemini'); }
  if (!res.ok) throw new Error(data.error?.message || `Gemini API error (${res.status})`);

  // Extract text from Gemini generateContent response
  function extractText(d) {
    if (!d) return '';
    // Standard Gemini response: candidates[0].content.parts[0].text
    if (Array.isArray(d.candidates) && d.candidates.length) {
      const c = d.candidates[0];
      if (c.content && c.content.parts && Array.isArray(c.content.parts)) {
        const texts = c.content.parts
          .filter(p => typeof p.text === 'string')
          .map(p => p.text);
        if (texts.length) return texts.join('');
      }
      // Fallback: direct text on candidate
      if (typeof c.text === 'string') return c.text;
    }
    // Fallback: top-level text
    if (typeof d.text === 'string') return d.text;
    return JSON.stringify(d);
  }

  return { raw: data, text: extractText(data) };
}

export { callGemini };
