const vibeLabels = {
  'glass-silver': 'Simple',
  'glass-gold': 'Bold',
  'glass-platinum': 'Professional'
};

const AI_KEYS = {
  gemini: '',
  openai: ''
};

const state = {
  file: null,
  captions: [],
  activeIndex: 0,
  provider: 'gemini'
};

const fileInput = document.getElementById('imageUpload');
const vibeInputs = Array.from(document.querySelectorAll('input[name="plan"]'));
const promptText = document.getElementById('promptText');
const captionGrid = document.getElementById('captionGrid');
const generateBtn = document.getElementById('generateBtn');
const shareBtn = document.querySelector('.share');
const copyBtn = document.querySelector('.copy');
const regenBtn = document.querySelector('.regen');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSelectedVibe() {
  const selected = vibeInputs.find((input) => input.checked);
  return vibeLabels[selected?.id] || 'Simple';
}

function getSelectedCaption() {
  return state.captions[state.activeIndex] || '';
}

function setPrompt(message) {
  promptText.innerHTML = message;
}

function getApiKey(provider) {
  return AI_KEYS[provider] || AI_KEYS.gemini;
}

function renderCaptions() {
  if (!state.captions.length) {
    captionGrid.innerHTML = '';
    return;
  }

  captionGrid.innerHTML = state.captions
    .map((caption, index) => {
      const isActive = index === state.activeIndex;
      return `
        <button class="caption-card ${isActive ? 'active' : ''}" type="button" data-index="${index}">
          <span class="caption-badge">Caption ${index + 1}</span>
          <p>${escapeHtml(caption)}</p>
        </button>
      `;
    })
    .join('');

  captionGrid.querySelectorAll('.caption-card').forEach((card) => {
    card.addEventListener('click', () => {
      state.activeIndex = Number(card.dataset.index);
      renderCaptions();
    });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function parseJsonCaptions(rawText) {
  if (!rawText) return [];

  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const captions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.captions)
        ? parsed.captions
        : null;

    if (Array.isArray(captions) && captions.length) {
      return captions
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch (error) {
    console.warn('JSON parse failed, trying to recover from text result.', error);
  }

  const lines = cleaned
    .split(/\n|\r/)
    .map((line) => line.replace(/^\s*[-*\d.]+\s*/, '').trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().includes('caption'));

  if (lines.length) {
    return lines.slice(0, 3);
  }

  return [];
}

async function callGemini(file, vibe) {
  const apiKey = getApiKey('gemini');
  if (!apiKey) {
    return [];
  }

  const imageData = await readFileAsDataUrl(file);
  const base64 = imageData.split(',')[1];

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Generate exactly 3 unique social media captions for this image. Vibe: ${vibe}. Make them natural, engaging, and highly relevant to the image. Return valid JSON in this format: {"captions":["caption 1","caption 2","caption 3"]}. Keep each caption short, polished, and distinct.`
            },
            {
              inline_data: {
                mime_type: file.type || 'image/jpeg',
                data: base64
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || 'Gemini request failed.');
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .join('') || '';

  return parseJsonCaptions(text);
}

async function callOpenAI(file, vibe) {
  const apiKey = getApiKey('openai');
  if (!apiKey) {
    return [];
  }

  const imageData = await readFileAsDataUrl(file);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Generate exactly 3 unique social media captions for this image. Vibe: ${vibe}. Make them short, engaging, and distinct. Return valid JSON in this format: {"captions":["caption 1","caption 2","caption 3"]}.`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || 'OpenAI request failed.');
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || '';
  return parseJsonCaptions(content);
}

async function generateCaptions() {
  if (!state.file) {
    setPrompt('Please upload an image first.');
    return;
  }

  const vibe = getSelectedVibe();
  const apiKey = getApiKey(state.provider);

  if (!apiKey) {
    state.captions = [];
    state.activeIndex = 0;
    renderCaptions();
    setPrompt('Add the real API key in the code to generate AI captions.');
    return;
  }

  setPrompt(`Generating three ${vibe.toLowerCase()} captions...`);

  try {
    const provider = state.provider;
    let captions = [];

    if (provider === 'openai') {
      captions = await callOpenAI(state.file, vibe);
    } else {
      captions = await callGemini(state.file, vibe);
    }

    state.captions = captions.slice(0, 3);
    state.activeIndex = 0;
    renderCaptions();

    if (!state.captions.length) {
      setPrompt('No captions returned. Please check the API key and try again.');
      return;
    }

    const selected = getSelectedCaption();
    setPrompt(`Showing 3 ${vibe.toLowerCase()} captions for your image. Current pick: “${selected}”`);
  } catch (error) {
    console.error(error);
    state.captions = [];
    state.activeIndex = 0;
    renderCaptions();
    setPrompt('The API request failed. Add a valid key and try again.');
  }
}

async function copyCaption() {
  const caption = getSelectedCaption();

  if (!caption) {
    setPrompt('Generate a caption first before copying it.');
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(caption);
    } else {
      const helper = document.createElement('textarea');
      helper.value = caption;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }

    setPrompt('Caption copied to clipboard.');
  } catch (error) {
    console.error(error);
    setPrompt('Copy failed. Please try again or copy it manually.');
  }
}

async function shareCaption() {
  const caption = getSelectedCaption();

  if (!caption) {
    setPrompt('Generate a caption first before sharing it.');
    return;
  }

  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Caption Wallah AI',
        text: caption
      });
      setPrompt('Caption shared successfully.');
      return;
    }

    await copyCaption();
    setPrompt('Sharing is not available in this browser, so the caption was copied for you.');
  } catch (error) {
    if (error && error.name !== 'AbortError') {
      console.error(error);
    }
    setPrompt('Share was cancelled or unavailable. The caption is ready to copy.');
  }
}

fileInput.addEventListener('change', (event) => {
  state.file = event.target.files[0];

  if (!state.file) {
    setPrompt('Upload an image to generate the perfect caption for your next post.');
    return;
  }

  const vibe = getSelectedVibe();
  setPrompt(`Image selected: ${state.file.name}. Vibe: ${vibe}.`);
  generateCaptions();
});

vibeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!state.file) {
      setPrompt('Choose a vibe and upload an image to continue.');
      return;
    }

    generateCaptions();
  });
});

generateBtn.addEventListener('click', generateCaptions);
shareBtn.addEventListener('click', shareCaption);
copyBtn.addEventListener('click', copyCaption);
regenBtn.addEventListener('click', generateCaptions);

renderCaptions();
