import os
import google.generativeai as genai

_api_key = os.getenv('GEMINI_API_KEY')
_model_default = os.getenv('GEMINI_MODEL', 'gemini-1.0')
if _api_key:
    genai.configure(api_key=_api_key)


def generate_text(prompt, model=None, temperature=0.2, max_output_tokens=512):
    if not _api_key:
        raise RuntimeError('GEMINI_API_KEY not configured')
    m = model or _model_default
    mdl = genai.GenerativeModel(m)
    resp = mdl.generate_content(prompt, temperature=temperature, max_output_tokens=max_output_tokens)
    # response may include multiple candidates; return text
    if hasattr(resp, 'candidates') and resp.candidates:
        return resp.candidates[0].text
    # fallback
    return getattr(resp, 'output', str(resp))
