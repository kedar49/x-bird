const debounce = (func, timeout = 500) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
};

const CONFIG = {
  MIN_VIEW_COUNT: 500,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  API_TIMEOUT: 15000,
  STORAGE_KEY: 'hf_api_key'
};

const SELECTORS = {
  TWEET_ARTICLE: 'article[data-testid="tweet"], article[role="article"]',
  TWEET_METRICS: '[role="group"][aria-label*="view"], [aria-label*="reply"], [aria-label*="repost"], [aria-label*="like"]',
  TWEET_LINK: 'a[href*="/status/"]',
  FALLBACK_ARTICLE: 'article',
  FALLBACK_METRICS: '[aria-label*="view"]'
};

let processedTweets = new Set();
let activeEventListeners = [];

class APIClient {
  constructor() {
    this.baseURL = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct";
    this.apiKey = null;
    console.log('APIClient initialized with endpoint:', this.baseURL);
    this.loadApiKey();
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.local.get([CONFIG.STORAGE_KEY]);
      this.apiKey = result[CONFIG.STORAGE_KEY] || localStorage.getItem("mistral_api_key");
      
      if (!this.apiKey) {
        console.warn('No API key found. Please configure your Hugging Face API key in the extension popup.');
      } else {
        console.log('API key loaded successfully');
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
      this.apiKey = localStorage.getItem("mistral_api_key");     }
  }

  async makeRequest(data, retryCount = 0) {
    if (!this.apiKey) {
      await this.loadApiKey();
      if (!this.apiKey) {
        throw new Error('API key not found. Please configure your Hugging Face API key.');
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

    try {
      const response = await fetch(this.baseURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`API request failed: ${response.status} ${response.statusText}`, errorText);
        
        if (response.status === 429 && retryCount < CONFIG.MAX_RETRIES) {
          console.log(`Rate limited, retrying in ${CONFIG.RETRY_DELAY * (retryCount + 1)}ms...`);
          await this.delay(CONFIG.RETRY_DELAY * (retryCount + 1));
          return this.makeRequest(data, retryCount + 1);
        }
        
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your Hugging Face API key.');
        }
        
        throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorText}`);
      }

      const result = await response.json();
      
      // Log the response for debugging
      console.log('API Response:', result);
      console.log('Response type:', typeof result);
      console.log('Is array:', Array.isArray(result));
      
      if (Array.isArray(result) && result.length > 0) {
        const firstResult = result[0];
        console.log('First result:', firstResult);
        
        if (firstResult.generated_text) {
          return firstResult.generated_text;
        }
      }
      
      if (result && typeof result === 'object' && result.generated_text) {
        return result.generated_text;
      }
      
      if (result.choices && result.choices[0]) {
        return result.choices[0].message?.content || result.choices[0].text;
      }
      
      if (typeof result === 'string') {
        return result;
      }
      
      if (result.error) {
        console.error('API Error:', result.error);
        throw new Error(`API Error: ${result.error}`);
      }
      
      if (result.estimated_time) {
        console.log('Model loading, estimated time:', result.estimated_time);
        throw new Error(`Model is loading. Estimated time: ${result.estimated_time} seconds. Please wait and try again.`);
      }
      
      console.error('Unexpected API response format:', result);
      console.error('Response keys:', Object.keys(result || {}));
      throw new Error(`Unexpected API response format. Got: ${JSON.stringify(result).substring(0, 200)}...`);

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      
      if (retryCount < CONFIG.MAX_RETRIES && !error.message.includes('API key')) {
        await this.delay(CONFIG.RETRY_DELAY * (retryCount + 1));
        return this.makeRequest(data, retryCount + 1);
      }
      
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const apiClient = new APIClient();

window.addEventListener('apiKeyUpdated', async (event) => {
  console.log('API key updated, reloading...');
  await apiClient.loadApiKey();
});

const injectStyles = () => {
  if (document.getElementById('xbird-styles')) return;
  
  try {
    const style = document.createElement("style");
    style.id = 'xbird-styles';
    style.textContent = `
.reply-idea-popup * {
  transition: all 0.3s ease-in-out;
  -moz-box-sizing: border-box; 
  -webkit-box-sizing: border-box; 
  box-sizing: border-box; 
}

.reply-idea-popup,
.reply-idea-content,
.reply-button,
.copy-button {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
}

.tweet-content-body {
  font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
  font-size: 12px;
  font-weight: 300;
  opacity: 0.5;
}

.reply-idea-header {
  font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
  font-size: 12px;
  font-weight: 100;
  opacity: 1;
}

.slider-label {
  font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
  font-size: 12px;
  font-weight: 300;
  opacity: 0.5;
}

  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 93%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: rgb(31 31 31);
    --radius: 0.5rem;
  }

  .reply-idea-popup {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(15px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 1rem;
  }

  .reply-idea-content {
    background: hsl(0deg 0% 0%);
    border-radius: var(--radius);
    box-shadow: 1px 0px 50px 0px rgba(0, 0, 0, 0.5);
    width: 100%;
    max-width: 480px;
    padding: 1.5rem;
    position: relative;
    border: 1px solid var(--border);
  }

  .reply-idea-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .reply-idea-title {
    font-size: 1.125rem;
    margin: 0;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .reply-idea-close {
    cursor: pointer;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: calc(var(--radius) - 2px);
    color: rgb(135 135 135);
    background: transparent;
    border: none;
    font-family: 'Geist Mono', sans-serif;
    font-size: 25px;
    font-weight: 300;
    opacity: 0.7;
  }

  .reply-idea-close:hover {
    filter: brightness(2) saturate(2);
  }

  .reply-idea-body {
    max-height: 60vh;
    overflow-y: auto;
    color: hsl(var(--foreground));
    line-height: 1.5;
    margin-bottom: 1rem;
  }

  .tweet-content-body {    
    max-height: 60vh;
    overflow-y: auto;
    color: hsl(var(--foreground));
    line-height: 1.5;
    margin-bottom: 1rem;
    overflow-wrap: anywhere;
  }

  .reply-button {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: var(--radius);
    font-size: 0.875rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: opacity 0.2s;
  }

  .reply-button:hover {
    opacity: 0.9;
  }
.copy-button {
    background: rgba(0, 0, 0, 0.8); /* Black with some transparency */
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.loading-spinner {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid rgba(192, 192, 192, 1); /* Neutral gray border */
    border-top-color: rgba(0, 0, 0, 1); /* Black border-top for spinner */
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 2rem auto;
}

.copy-success {
    background: rgba(225, 225, 225, 1) !important; /* Success in green */
}

.copy-error {
    background: rgba(255, 0, 0, 1) !important; /* Error in red */
}

.copy-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.copy-button {
    color: rgba(140,140,140);
    transition: all 0.3s ease;
}

.copy-button:hover {
    filter: brightness(2) saturate(2);
}

.reply-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1rem;
}

.new-reply-button {
    background: rgba(0, 0, 0, 0.1);
    color: rgba(140,140,140);
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    border: 1px solid rgba(140,140,140);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.3s ease-in-out;
}

.new-reply-button:hover {
    filter: brightness(2) saturate(2);
}

.go-to-tweet-button {
    background: linear-gradient(65deg, #a4eaff, #ffafaf);
    color: black;
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.3s ease-in-out;
}

.go-to-tweet-button:hover {
    filter: brightness(1.2) saturate(2);
}

.tweet-highlight {
    animation: highlight 1.5s ease-out;
}

@keyframes highlight {
    0% { background: rgba(255, 255, 0, 0.3); } /* Highlight with transparent yellow */
    100% { background: transparent; }
}

.brainrot-slider-container {
    margin: 1rem 0;
}

.slider-label {
        display: flex;
    justify-content: space-between;
    align-content: center;
    align-items: center;
}

.brainrot-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 2px;
    border-radius: 10px;
    background: rgba(100, 100, 100, 1); /* Neutral background */
    outline: none;
}

.brainrot-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(200, 200, 200, 1); /* Black thumb */
    cursor: pointer;
    transition: all 0.3s ease-in-out;
}

.brainrot-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
}
    
.user-need {
    appearance: none;
    width: 100%;
    height: 100px;
    margin-top: 1rem;
    font-family: "geist mono";
    border-radius: 10px;
    background: rgb(0, 0, 0);
    outline: none;
    border-width: 1px;
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.3);
    border-image: initial;
    padding: 10px;
}

.select-mood {
        font-family: "geist mono";
    background: black;
    border-radius: 10px;
    font-size: 11px;
    border: 1px solid rgba(140, 140, 140);
    padding: 5px 5px;
    }

    .select-mood:hover {
    filter: brightness(1.3);
}

.success-content {
    font-family: 'Geist Mono';
    font-size: 12px;
    background-color: rgb(140 140 140);
    padding: 10px;
    margin-bottom: 16px;
    color: #b7b7b7;
    border-radius: 10px;}
`;
    document.head.appendChild(style);
  } catch (error) {
    console.error('Failed to inject styles:', error);
  }
};

// Initialize styles
injectStyles();

const config = {
  mistralAPIKey: localStorage.getItem("mistral_api_key"), // Will work with Hugging Face API key too
  apiEndpoint: "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct",
};

const popup = document.createElement("div");
popup.className = "reply-idea-popup";
popup.innerHTML = `
   <div class="reply-idea-content">
    <div class="reply-idea-header">
      <h3 class="reply-idea-title">
       <img
          src="${chrome.runtime.getURL('X-bird.png')}"
          alt="X-Bird Logo"
          style="width: 30px; height: 30px; border-radius: 6px;"
        />
      </h3>
      <button class="reply-idea-close">&times;</button>
    </div>
    
    <div class="success-content"></div>
    <div class="tweet-content-body"></div>
    <div class="reply-idea-body"></div><div class="brainrot-slider-container">
      <div class="slider-label" style="
    margin-bottom: 10px"
        <span>Mood:</span>
        <select class="select-mood" id="select-mood">
      <option selected value="Auto">Auto</option>
      <option value="Agree">Agree</option>
      <option value="Disagree">Disagree</option>
      <option value="Motivate">Motivate</option>
      <option value="Roast">Roast</option>
      <option value="Cute">Cute</option>
      </select>
      </div>
       
      <div class="slider-label">
        <span>Brainrot Intensity:</span>
        <span id="slider-value">69%</span>
      </div>
     
      <input type="range" min="0" max="100" value="69" class="brainrot-slider" id="brainrot-slider">
      <textarea type="text" placeholder="I want this reply to..." class="user-need" id="user-need"></textarea>
    </div>
    <div class="reply-actions">
      <button class="copy-button">Copy</button>
      <button class="new-reply-button">New Reply</button>
      <button class="go-to-tweet-button">Reply this</button>
    </div>
  </div>
`;
document.body.appendChild(popup);

const slider = document.getElementById("brainrot-slider");
const sliderValue = document.getElementById("slider-value");
slider.addEventListener("input", (e) => {
  sliderValue.textContent = `${e.target.value}%`;
});

async function generateReply(prompt, userNeed, mood) {
  const brainrotIntensity = parseInt(slider.value) || 50;
  
  // Check if API key is available before making request
  if (!apiClient.apiKey) {
    await apiClient.loadApiKey();
    if (!apiClient.apiKey) {
      return "⚠️ No API key found - Click the extension icon to configure your Hugging Face API key";
    }
  }
  
  try {
    // Build system instructions based on brainrot intensity
    const systemInstructions = [
      "You are a Twitter reply expert. Generate engaging, concise replies.",
      "Keep replies under 100 characters when possible.",
      "DO NOT use hashtags or excessive emojis.",
      brainrotIntensity >= 20 ? "Make replies slightly controversial or attention-grabbing." : "",
      brainrotIntensity >= 40 ? "Be more casual and use internet slang occasionally." : "",
      brainrotIntensity >= 60 ? "Use controversial takes and unexpected angles." : "",
      brainrotIntensity >= 80 ? "Be extremely casual, use slang like 'imo', 'tbh', 'ngl'." : ""
    ].filter(instruction => instruction.length > 0).join(" ");

    const userPrompt = [
      userNeed && `Context: ${userNeed}`,
      mood !== "Auto" && `Tone: ${mood}`,
      `Generate a Twitter reply to: "${prompt}"`
    ].filter(part => part).join(" ");

    console.log('Sending API request to:', apiClient.baseURL);
    console.log('Request payload:', JSON.stringify({ prompt: userPrompt, systemInstructions }));

    const requestData = {
      inputs: `<|im_start|>system
${systemInstructions}
<|im_end|>
<|im_start|>user
${userPrompt}
<|im_end|>
<|im_start|>assistant`,
      parameters: {
        max_new_tokens: 100,
        temperature: 0.7,
        return_full_text: false,
        do_sample: true
      }
    };

    const reply = await apiClient.makeRequest(requestData);
    
    // Clean up the response
    const cleanReply = reply
      .replace(/<\|im_end\|>.*$/s, '') // Remove end tokens
      .replace(/^[\s\n]+|[\s\n]+$/g, '') // Trim whitespace
      .substring(0, 280); // Ensure Twitter character limit

    return cleanReply || "Could not generate reply";
    
  } catch (error) {
    console.error("Reply generation error:", error);
    
    // Return user-friendly error messages
    if (error.message.includes('API key')) {
      return "⚠️ API key missing or invalid - Check popup settings";
    } else if (error.message.includes('Model is loading')) {
      return "🔄 Model is warming up - Try again in a few seconds";
    } else if (error.message.includes('timed out')) {
      return "⏱️ Request timed out - Try again";
    } else if (error.message.includes('429')) {
      return "🚫 Rate limited - Wait a moment";
    } else if (error.message.includes('API Error')) {
      return "🔴 API Error - Check your Hugging Face key";
    } else if (error.message.includes('Unexpected API response')) {
      return "🔧 API format issue - Check console for details";
    } else {
      return "❌ Generation failed - Try again";
    }
  }
}

function extractViewCount(ariaLabel) {
  const parts = ariaLabel.split(",").map((p) => p.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].includes("views")) {
      const numbers = parts[i]
        .replace(/[^0-9]/g, " ")
        .split(" ")
        .filter((n) => n !== "");

      return numbers.length > 0 ? parseInt(numbers[0], 10) : null;
    }
  }
  return null;
}

function applyViewCountStyles(button, viewCount) {
  button.style.transition = "all 0.3s ease";
  if (viewCount >= 100000) {
    button.style.backgroundColor = "hsl(0, 72%, 45%)";
  } else if (viewCount >= 50000) {
    button.style.backgroundColor = "hsl(30, 100%, 50%)";
  } else if (viewCount >= 10000) {
    button.style.backgroundColor = "hsl(45, 100%, 50%)";
  } else {
    button.style.backgroundColor = "hsl(221.2 83.2% 53.3%)";
  }
  button.style.opacity = Math.min(0.95, 0.7 + viewCount / 100000).toFixed(2);
}

function createReplyButton(viewCount) {
  const button = document.createElement("button");
  button.className = "reply-button";
  button.title = `Post Views: ${viewCount.toLocaleString()}`;
  button.innerHTML = `
    <svg style="width:1em;height:1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
    Generate Reply
  `;
  return button;
}

let activeArticle = null;
popup.querySelector(".new-reply-button").addEventListener("click", async () => {
  if (activeArticle) {
    popup.querySelector(".reply-idea-body").textContent = "...";
    const reply = await generateReply(
      activeArticle.innerText,
      popup.querySelector(".user-need").value,
      popup.querySelector(".select-mood").value
    );
    popup.querySelector(".reply-idea-body").textContent = reply;
  }
});

popup.querySelector("textarea").addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    if (activeArticle) {
      popup.querySelector(".reply-idea-body").textContent = "...";
      const reply = await generateReply(
        activeArticle.innerText,
        popup.querySelector(".user-need").value,
        popup.querySelector(".select-mood").value
      );
      popup.querySelector(".reply-idea-body").textContent = reply;
    }
  }
});

function analyzeSuccess(input) {
  // Extract numbers from input string
  const numbers = input.match(/\d+/g).map(Number);
  const [replies, reposts, likes, bookmarks, views] = numbers;

  // Calculate ratios
  const ratios = {
    viewsPerLike: views / likes,
    likesPerReply: likes / replies,
    repostsPerReply: reposts / replies,
    bookmarksPerReply: bookmarks / replies,
  };

  // Analyze engagement
  let successRate = 50; // Base rate
  let message = "";
  const messages = [];

  // Check important factors
  if (ratios.viewsPerLike < 100) {
    successRate += 20;
    messages.push("Good engagement: Likes are proportional to views");
  } else {
    successRate -= 30;
    messages.push("Low conversion: Many views but relatively few likes");
  }

  if (ratios.likesPerReply > 20) {
    successRate += 15;
    messages.push("High likes per reply ratio indicates strong engagement");
  }

  if (ratios.repostsPerReply > 3) {
    successRate += 10;
    messages.push("High reposts per reply ratio shows good content sharing");
  }

  if (ratios.bookmarksPerReply > 0.8) {
    successRate += 5;
    messages.push("Good bookmarking rate indicates valuable content");
  }

  // Normalize success rate
  successRate = Math.max(0, Math.min(100, Math.round(successRate)));

  // Select primary message
  if (successRate >= 60) {
    message =
      messages.find((m) => m.includes("strong engagement")) || messages[0];
  } else {
    message = messages.find((m) => m.includes("Low conversion")) || messages[0];
  }

  return {
    successRate,
    message,
  };
}

function setupButtonInteraction(element, button, metricsElement, tweetLink) {
  button.addEventListener("click", async () => {
    activeArticle = element;
    const metricsEl = element.querySelector(SELECTORS.TWEET_METRICS) || 
                     element.querySelector(SELECTORS.FALLBACK_METRICS);
    
    successRate = metricsEl ? analyzeSuccess(metricsEl.getAttribute("aria-label")) : 
                 { successRate: 50, message: "Unable to analyze metrics" };
    popup.querySelector(".success-content").innerHTML = `
      <span>[BETA FEATURE]</span>
      <br/>
      <span>Success Rate: ${successRate.successRate}%</span>
      <br/>
      <span>${successRate.message}</span>
    `;
    popup.querySelector(".success-content").style.backgroundColor =
      successRate.successRate > 70
        ? "rgb(7 59 0)"
        : successRate.successRate > 40
        ? "rgb(59 7 0)"
        : "rgb(59 0 0)";
    const popupBody = popup.querySelector(".reply-idea-body");
    const originalText = element.innerText;
    popupBody.innerHTML = '<div class="loading-spinner"></div>';
    const tweetContentBody = popup.querySelector(".tweet-content-body");
    tweetContentBody.textContent = originalText;
    popup.style.display = "flex";
    popup.querySelector(".go-to-tweet-button").focus();
    const reply = await generateReply(
      originalText,
      popup.querySelector(".user-need").value,
      popup.querySelector(".select-mood").value
    );
    popupBody.textContent = reply;

    const close = () => (popup.style.display = "none");
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    popup.querySelector(".reply-idea-close").onclick = close;
    popup.querySelector(".copy-button").onclick = () => {
      navigator.clipboard.writeText(reply);
    };

    //const tweetId = tweetLink.href.split("/status/")[1].split("/")[0];
    //popup.querySelector(".go-to-tweet-button").addEventListener("click", () => {
    //  if (activeArticle) {
    //    const replyText = encodeURIComponent(
    //      popup.querySelector(".reply-idea-body").textContent
    //    );
    //    const replyUrl = `https://x.com/intent/post?in_reply_to=${tweetId}&text=${replyText}`;
    //    window.open(replyUrl, "_blank");
    //  }
    //});
    const tweetId = tweetLink.href.split("/status/")[1].split("/")[0];
    const replyThisButon = popup.querySelector(".go-to-tweet-button");
    replyThisButon.disabled = false;
    replyThisButon.onclick = async () => {
      try {
        if (activeArticle) {
          const replyText = encodeURIComponent(
            popup.querySelector(".reply-idea-body").textContent
          );
          const replyUrl = `https://x.com/intent/post?in_reply_to=${tweetId}&text=${replyText}`;
          window.open(replyUrl, "_blank");
        }
        replyThisButon.disabled = true;
        setTimeout(() => {
          replyThisButon.disabled = false;
        }, 3000);
      } catch (error) {
        console.log(error);
      }
    };

    const copyButton = popup.querySelector(".copy-button");
    copyButton.disabled = false;
    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(popupBody.textContent);
        copyButton.textContent = "Copied!";
        copyButton.classList.add("copy-success");
        copyButton.disabled = true;
        setTimeout(() => {
          copyButton.textContent = "Copy";
          copyButton.classList.remove("copy-success");
          copyButton.disabled = false;
        }, 3000);
      } catch (error) {
        copyButton.textContent = "Error";
        copyButton.classList.add("copy-error");
        setTimeout(() => {
          copyButton.textContent = "Copy";
          copyButton.classList.remove("copy-error");
        }, 2000);
      }
    };
  });
}

const outletService = () => {
  try {
    let elements = document.querySelectorAll(SELECTORS.TWEET_ARTICLE);
    
    if (elements.length === 0) {
      elements = document.querySelectorAll(SELECTORS.FALLBACK_ARTICLE);
    }

    elements.forEach((element) => {
      const tweetId = element.querySelector(SELECTORS.TWEET_LINK)?.href?.split('/status/')?.[1]?.split('/')?.[0];
      if (!tweetId || processedTweets.has(tweetId)) return;

      let metricsElement = element.querySelector(SELECTORS.TWEET_METRICS);
      
      if (!metricsElement) {
        metricsElement = element.querySelector(SELECTORS.FALLBACK_METRICS);
      }

      if (metricsElement) {
        const ariaLabel = metricsElement.getAttribute("aria-label") || "";
        const viewCount = extractViewCount(ariaLabel);

        if (viewCount !== null && viewCount >= CONFIG.MIN_VIEW_COUNT) {
          const button = createReplyButton(viewCount);
          applyViewCountStyles(button, viewCount);

          const tweetLink = element.querySelector(SELECTORS.TWEET_LINK);
          if (tweetLink) {
            setupButtonInteraction(element, button, metricsElement, tweetLink);
            element.style.position = "relative";
            element.appendChild(button);
            processedTweets.add(tweetId);
            
            if (processedTweets.size > 1000) {
              const oldTweets = Array.from(processedTweets).slice(0, 500);
              oldTweets.forEach(id => processedTweets.delete(id));
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('outletService error:', error);
  }
};

const debouncedOutletService = debounce(outletService);

const cleanup = () => {
  window.removeEventListener("scroll", debouncedOutletService);
  processedTweets.clear();
  activeEventListeners.forEach(({ element, type, handler }) => {
    element.removeEventListener(type, handler);
  });
  activeEventListeners.length = 0;
};

let currentUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    cleanup();
    setTimeout(() => {
      outletService();
      window.addEventListener("scroll", debouncedOutletService, { passive: true });
    }, 1000);
  }
});

urlObserver.observe(document.body, { 
  childList: true, 
  subtree: true 
});

outletService();
window.addEventListener("scroll", debouncedOutletService, { passive: true });

window.addEventListener("beforeunload", cleanup);
