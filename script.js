// Paste your OpenRouter API Key below if you want to hardcode it for your site
const OPENROUTER_API_KEY = "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";

const vibeLabels = {
  'glass-silver': 'Simple',
  'glass-gold': 'Bold',
  'glass-platinum': 'Professional'
};

const AI_KEYS = {};

const state = {
  file: null,
  captions: [],
  activeIndex: 0,
  isGenerating: false
};

const fileInput = document.getElementById('imageUpload');
const vibeInputs = Array.from(document.querySelectorAll('input[name="plan"]'));
const promptText = document.getElementById('promptText');
const captionGrid = document.getElementById('captionGrid');
const generateBtn = document.getElementById('generateBtn');
const shareBtn = document.querySelector('.share');
const copyBtn = document.querySelector('.copy');
const liquidLoader = document.getElementById('liquidLoader');
const fileUploadLabel = document.querySelector('.custom-file-upload');
const uploadSuccessMessage = document.getElementById('uploadSuccessMessage');
const apiKeyBtn = document.getElementById('apiKeyBtn');

function getOpenRouterKey() {
  return OPENROUTER_API_KEY || localStorage.getItem('OPENROUTER_API_KEY') || AI_KEYS.openrouter || null;
}

function promptOpenRouterKey(forcePrompt = false) {
  let key = getOpenRouterKey();
  if (forcePrompt || !key) {
    key = prompt('Please enter your OpenRouter API Key:\n(Get your key at openrouter.ai/keys)', key || '');
    if (key && key.trim()) {
      localStorage.setItem('OPENROUTER_API_KEY', key.trim());
      return key.trim();
    }
  }
  return key;
}

if (apiKeyBtn) {
  apiKeyBtn.addEventListener('click', () => {
    const key = promptOpenRouterKey(true);
    if (key) {
      setPrompt('OpenRouter API Key saved successfully!');
    } else {
      setPrompt('OpenRouter API Key was not updated.');
    }
  });
}

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
  if (!promptText) return;
  promptText.textContent = message;
}

function renderCaptions() {
  if (!captionGrid) return;

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
    reader.onerror = () => reject(new Error('Could not read the selected image. Re-Upload It or Try With Another Image'));
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
    console.warn('JSON parse failed, trying line-based fallback.', error);
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

async function callOpenRouter(file, vibe) {
  let apiKey = getOpenRouterKey();
  if (!apiKey) {
    apiKey = promptOpenRouterKey(true);
    if (!apiKey) {
      throw new Error('OpenRouter API key is required. Paste your key in script.js (OPENROUTER_API_KEY) or click "🔑 API Key" in the header.');
    }
  }

  const imageData = await readFileAsDataUrl(file);

  const modelsToTry = [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'meta-llama/llama-3.2-11b-vision-instruct:free'
  ];

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.href,
          'X-Title': 'Caption Wallah AI',
          'Content-Type': 'application/json'
        },


        // text which is send by develop to the ai model for caption generation

        body: JSON.stringify({
          model: model,
          extra_body: { reasoning: { enabled: true } },
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Generate exactly 3 unique social media captions for this image. Vibe: ${vibe}. Make them natural, engaging, and highly relevant to the image. Return valid JSON in this format: {"captions":["caption 1","caption 2","caption 3"]}. Keep each caption short, polished, and distinct.`
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
        console.warn(`OpenRouter model ${model} response:`, response.status, errText);
        let errMsg = 'OpenRouter request failed.';
        try {
          const parsedErr = JSON.parse(errText);
          errMsg = parsedErr.error?.message || parsedErr.message || errText;
        } catch (e) {
          errMsg = errText;
        }

        if (response.status === 401) {
          localStorage.removeItem('OPENROUTER_API_KEY');
          throw new Error('Invalid OpenRouter API Key. Please update OPENROUTER_API_KEY in script.js or click 🔑 API Key.');
        }

        lastError = new Error(`[${response.status}] ${errMsg}`);
        continue;
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '';
      const captions = parseJsonCaptions(content);
      if (captions && captions.length) {
        return captions;
      }
    } catch (err) {
      if (err.message.includes('Invalid OpenRouter API Key')) {
        throw err;
      }
      lastError = err;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return [];
}

const uploadLoader = document.getElementById('uploadLoader');
const generatingLoader = document.getElementById('generatingLoader');

async function generateCaptions() {
  if (state.isGenerating) {
    setPrompt('Still generating captions — Please Wait.');
    return;
  }

  if (!state.file) {
    setPrompt('Please upload an image first.');
    return;
  }

  state.isGenerating = true;
  const vibe = getSelectedVibe();

  setPrompt(`Generating three ${vibe.toLowerCase()} captions...`);

  const previewImage = document.getElementById('previewImage');
  const customFileUpload = document.querySelector('.custom-file-upload');

  if (previewImage && state.file) {
    previewImage.style.display = 'block';
    previewImage.classList.add('generating-blur');
  }
  if (customFileUpload) customFileUpload.style.display = 'inline-block';

  if (generatingLoader) {
    generatingLoader.style.display = 'flex';
  }

  try {
    const captions = await callOpenRouter(state.file, vibe);

    if (!captions || !captions.length) {
      state.captions = [];
      state.activeIndex = 0;
      renderCaptions();
      setPrompt('No captions returned from Caption Wallah AI. Re-Upload It or Try With Another Image');
      return;
    }

    state.captions = captions;
    state.activeIndex = 0;
    renderCaptions();

    if (generateBtn) {
      generateBtn.textContent = 'Regenerate Captions';
    }

    const selected = getSelectedCaption();
    setPrompt(`Showing 3 ${vibe.toLowerCase()} captions for your image. AI's Current pick: "${selected}"`);
  } catch (error) {
    console.error('generateCaptions error:', error);
    state.captions = [];
    state.activeIndex = 0;
    renderCaptions();
    setPrompt(error.message || 'Failed to generate captions. Re-Upload It or Try With Another Image');
  } finally {
    state.isGenerating = false;
    if (generatingLoader) {
      generatingLoader.style.display = 'none';
    }
    if (previewImage) {
      previewImage.classList.remove('generating-blur');
      if (state.file) previewImage.style.display = 'block';
    }
    if (customFileUpload) customFileUpload.style.display = 'inline-block';
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

fileInput.addEventListener('change', async (event) => {
  const selectedFile = event.target.files && event.target.files[0];
  if (!selectedFile) return;

  state.file = selectedFile;
  const vibe = getSelectedVibe();
  setPrompt(`Uploading image: ${state.file.name}...`);

  const previewImage = document.getElementById('previewImage');
  const uploadBtnSpan = document.getElementById('uploadBtnText');
  const folderElem = document.getElementById('uploadFolder');
  const customFileUpload = document.querySelector('.custom-file-upload');

  // Hide container elements and show uploadLoader inside container during image upload
  if (previewImage) previewImage.style.display = 'none';
  if (folderElem) folderElem.style.display = 'none';
  if (customFileUpload) customFileUpload.style.display = 'none';

  if (uploadLoader) {
    uploadLoader.style.display = 'flex';
  }

  try {
    const dataUrl = await readFileAsDataUrl(state.file);

    // Smooth upload animation delay
    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (previewImage) {
      previewImage.src = dataUrl;
    }

    if (uploadBtnSpan) {
      uploadBtnSpan.textContent = 'Upload a New File';
    }
    if (generateBtn) {
      generateBtn.textContent = 'Generate Captions';
    }
    setPrompt(`Image selected: ${state.file.name}. With Vibe: ${vibe}. Click "Generate Captions" to continue.`);
  } catch (err) {
    console.error('Upload error:', err);
    setPrompt('Could not read image file. Please try again.');
  } finally {
    if (uploadLoader) {
      uploadLoader.style.display = 'none';
    }
    if (previewImage && state.file) previewImage.style.display = 'block';
    if (customFileUpload) customFileUpload.style.display = 'inline-block';

    if (uploadSuccessMessage) {
      uploadSuccessMessage.style.display = 'block';
      setTimeout(() => {
        if (uploadSuccessMessage) {
          uploadSuccessMessage.style.display = 'none';
        }
      }, 2000);
    }
  }
});

vibeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    const vibe = getSelectedVibe();
    if (!state.file) {
      setPrompt(`Vibe selected: ${vibe}. Upload an image to continue.`);
      return;
    }
    setPrompt(`Vibe changed to ${vibe}. Click "Generate Captions" to update.`);
  });
});

generateBtn.addEventListener('click', generateCaptions);
shareBtn.addEventListener('click', shareCaption);
copyBtn.addEventListener('click', copyCaption);

renderCaptions();

