import os
import base64
from openai import OpenAI

"""test.py

Provides a helper function `generate_captions(image_bytes, vibe)` that returns
an array of captions. The API key is read from the OPENROUTER_API_KEY
environment variable so secrets are not committed to source control.

Usage (from Python):
  from test import generate_captions
  with open('photo.jpg','rb') as f:
      captions = generate_captions(f.read(), 'Simple')

"""

API_KEY = os.getenv('OPENROUTER_API_KEY')
# Optional: override the provider/base model spec via OPENROUTER_BASE_URL
BASE_URL = os.getenv('OPENROUTER_BASE_URL', 'nvidia/nemotron-3-ultra-550b-a55b:free')  # default to free tier

if not API_KEY:
    # Do not exit on import; allow the caller to handle missing key.
    pass


def _make_client():
    if not API_KEY:
        raise RuntimeError('OPENROUTER_API_KEY environment variable is not set')
    return OpenAI(base_url=BASE_URL, api_key=API_KEY)


def generate_captions(image_bytes: bytes, vibe: str = 'Simple'):
    """Generate up to 3 captions for the provided image bytes using the
    configured OpenRouter/OpenAI-compatible client.

    Returns a list of caption strings. Raises RuntimeError on missing key or
    Exception on request failures.
    """
    client = _make_client()

    # Encode image as data URL so the model can (optionally) inspect it in-text.
    b64 = base64.b64encode(image_bytes).decode('ascii')
    data_url = f"data:image/jpeg;base64,{b64}"

    prompt = (
        f"Generate exactly 3 unique social media captions for this image. Identify the core subject, action, and overall atmosphere of this image. Based on your analysis, provide three different caption styles "
        f"Vibe: {vibe}. Make them natural, engaging, and highly relevant to the image. "
        f"Return valid JSON in this format: {{\"captions\":[\"caption 1\",\"caption 2\",\"caption 3\"]}}."
    )

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    ]

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        extra_body={"reasoning": {"enabled": False}},
    )

    # Response formats vary; try to extract captions robustly
    choice = response.choices[0].message
    content = getattr(choice, 'content', '') or ''

    # Several providers return content as plain JSON or as parts; try to parse
    raw = ''
    if isinstance(content, str):
        raw = content
    else:
        try:
            # If content is structured like parts array
            parts = content.get('parts') if isinstance(content, dict) else None
            if parts:
                raw = ''.join(p.get('text', '') for p in parts)
            else:
                raw = str(content)
        except Exception:
            raw = str(content)

    # Basic recovery: remove ```json blocks and parse
    import json
    cleaned = raw.replace('```json', '').replace('```', '').strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed][:3]
        if isinstance(parsed, dict) and 'captions' in parsed and isinstance(parsed['captions'], list):
            return [str(x).strip() for x in parsed['captions']][:3]
    except Exception:
        # Fall through to line-based fallback
        pass

    lines = cleaned.splitlines()
    candidates = [l.strip(' -\t\n\r') for l in lines if l.strip()]
    return candidates[:3]


if __name__ == '__main__':
    # Quick manual test (requires OPENROUTER_API_KEY set)
    import sys
    if len(sys.argv) < 2:
        print('Usage: python test.py <image-file> [vibe]')
        sys.exit(1)
    path = sys.argv[1]
    vibe = sys.argv[2] if len(sys.argv) > 2 else 'Simple'
    with open(path, 'rb') as f:
        caps = generate_captions(f.read(), vibe)
    print(caps)
