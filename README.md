# X-Bird 🐦

A Chrome extension that generates AI-powered replies for Twitter/X posts using Hugging Face's language models.

## Features

- **Smart Reply Generation**: Automatically generates contextual replies to tweets
- **Multiple Mood Options**: Choose from Auto, Savage, Supportive, Funny, Professional, or Casual tones
- **Brainrot Intensity Control**: Adjust the creativity level of generated replies (0-100)
- **Tweet Filtering**: Only shows reply buttons on tweets with substantial engagement (100k+ views)
- **Secure API Key Storage**: Uses Chrome's secure storage instead of localStorage
- **Clean UI Integration**: Seamlessly integrates with Twitter's interface

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. Get your Hugging Face API key from [Hugging Face](https://huggingface.co/settings/tokens)
6. Click the extension icon and enter your API key

## Usage

1. Navigate to Twitter/X
2. Look for the "🐉 Generate Reply" button on tweets with high engagement
3. Click the button to generate an AI reply
4. Adjust mood and brainrot intensity as needed
5. Copy the generated reply to use in your response

## Technical Stack

- **Manifest V3** Chrome Extension
- **Hugging Face Inference API** for AI text generation
- **AI Model**: Qwen/Qwen2.5-72B-Instruct (Alibaba's advanced language model)
- **Modern JavaScript** with ES6+ features
- **Secure Storage** using Chrome's storage API

## Configuration

- **AI Model**: Qwen/Qwen2.5-72B-Instruct (Alibaba Cloud's 72B parameter model)
- **Minimum Views**: 100,000 (configurable)
- **API Timeout**: 30 seconds
- **Retry Logic**: Up to 3 attempts

## Privacy & Security

- API keys are stored securely using Chrome's storage API
- No user data is collected or transmitted
- All processing happens locally except for AI generation requests to Hugging Face

---

Made with ❤️ By Kedar Sathe
 
