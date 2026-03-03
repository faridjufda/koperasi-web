// Simple Gemini client (server-side proxy)
// Expects an API key and forwards a generate request to Google Generative Language REST endpoint.
async function callGemini(apiKey, model, prompt, opts = {}) {
  if (!apiKey) throw new Error('GEMINI API key is required');
  const m = model || 'gemini-1.0';
  const url = `https://generativelanguage.googleapis.com/v1beta2/models/${encodeURIComponent(m)}:generate?key=${encodeURIComponent(apiKey)}`;
  const body = {
    prompt: { text: String(prompt) },
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
    maxOutputTokens: typeof opts.maxOutputTokens === 'number' ? opts.maxOutputTokens : 512,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data;
  try { data = await res.json(); } catch (e) { throw new Error('Invalid JSON response from Gemini'); }
  if (!res.ok) throw new Error(data.error?.message || 'Gemini API error');
  // Try to extract a simple text answer from common response shapes
  function extractText(d) {
    if (!d) return '';
    // v1beta2: candidates[].output or candidates[].content
    if (Array.isArray(d.candidates) && d.candidates.length) {
      const c = d.candidates[0];
      if (c.output && Array.isArray(c.output) && c.output.length) {
        // output pieces may have text
        for (const piece of c.output) {
          if (piece.content) {
            for (const p of piece.content) {
              if (p.text) return p.text;
            }
          }
        }
      }
      if (c.content && Array.isArray(c.content) && c.content.length) {
        for (const p of c.content) if (p.text) return p.text;
      }
      if (typeof c.text === 'string') return c.text;
    }
    // Some responses put text in output[0].content[0].text
    if (Array.isArray(d.output) && d.output.length) {
      for (const piece of d.output) {
        if (piece.content && Array.isArray(piece.content)) {
          for (const p of piece.content) if (p.text) return p.text;
        }
      }
    }
    // fallback: try top-level text
    if (typeof d.text === 'string') return d.text;
    return JSON.stringify(d);
  }

  return { raw: data, text: extractText(data) };
}

export { callGemini };
