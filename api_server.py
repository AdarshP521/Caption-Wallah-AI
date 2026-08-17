"""Simple Flask API to expose the generate_captions function to the front-end.

Install requirements:
  pip install flask flask-cors openai

Run:
  set OPENROUTER_API_KEY=your_key_here  # Windows PowerShell/CMD
  python api_server.py

The front-end will POST to /generate with multipart/form-data fields:
  - image: file upload
  - vibe: desired vibe string

Response: JSON { "captions": ["cap1","cap2","cap3"] }
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import traceback

app = Flask(__name__)
CORS(app)

# import the helper from test.py
from test import generate_captions


@app.route('/generate', methods=['POST'])
def generate_endpoint():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        f = request.files['image']
        vibe = request.form.get('vibe', 'Simple')
        image_bytes = f.read()

        captions = generate_captions(image_bytes, vibe)
        if not isinstance(captions, list):
            captions = list(captions)

        return jsonify({'captions': captions}), 200
    except Exception:
        traceback.print_exc()
        return jsonify({'error': 'Server error'}), 500


if __name__ == '__main__':
    # Run on port 5000 by default. Change host if you want remote access.
    app.run(host='127.0.0.1', port=5000, debug=True)
