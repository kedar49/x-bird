document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("api-key-input");
  const status = document.getElementById("status");

  const config = {
    keyMinLength: 32,
    statusTimeout: 3000
  };

  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.className = `status-message ${isError ? 'error' : 'success'}`;
    
    setTimeout(() => {
      status.className = 'status-message';
      setTimeout(() => {
        status.textContent = "";
      }, 300);
    }, config.statusTimeout);
  };

  const validateApiKey = (key) => {
    if (!key || typeof key !== 'string') {
      return { valid: false, error: "API key is required" };
    }
    
    if (key.length < config.keyMinLength) {
      return { valid: false, error: "API key appears to be too short" };
    }
    
    if (!key.match(/^[a-zA-Z0-9_-]+$/)) {
      return { valid: false, error: "API key contains invalid characters" };
    }
    
    return { valid: true };
  };

  const secureStorage = {
    async set(key, value) {
      try {
        await chrome.storage.local.set({ [key]: value });
        return { success: true };
      } catch (error) {
        console.error('Storage error:', error);
        return { success: false, error: error.message };
      }
    },
    
    async get(key) {
      try {
        const result = await chrome.storage.local.get([key]);
        return { success: true, value: result[key] };
      } catch (error) {
        console.error('Storage error:', error);
        return { success: false, error: error.message };
      }
    }
  };

  try {
    let result = await secureStorage.get("hf_api_key");
    if (!result.success || !result.value) {
      result = await secureStorage.get("mistral_api_key");
    }
    
    if (result.success && result.value) {
      input.value = "••••••••••••••••••••";
      input.dataset.hasKey = "true";
      showStatus("API key loaded", false);
      
      if (result.value && !(await secureStorage.get("hf_api_key")).value) {
        await secureStorage.set("hf_api_key", result.value);
      }
    }
  } catch (error) {
    console.error('Failed to load API key:', error);
    showStatus("Failed to load saved key", true);
  }

  input.addEventListener("focus", () => {
    if (input.dataset.hasKey === "true") {
      input.value = "";
      input.dataset.hasKey = "false";
    }
  });

  const saveApiKey = async (apiKey) => {
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      showStatus(validation.error, true);
      return false;
    }

    try {
      const saveResult = await secureStorage.set("hf_api_key", apiKey);
      if (!saveResult.success) {
        throw new Error(saveResult.error);
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: (key) => {
              window.dispatchEvent(new CustomEvent('apiKeyUpdated', { 
                detail: { key } 
              }));
            },
            args: [apiKey],
          });
        } catch (scriptError) {
          console.warn('Could not notify content script:', scriptError);
        }
      }

      showStatus("API Key saved successfully!", false);
      
      input.value = "••••••••••••••••••••";
      input.dataset.hasKey = "true";
      
      return true;
    } catch (error) {
      console.error('Failed to save API key:', error);
      showStatus("Failed to save API key", true);
      return false;
    }
  };

  input.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const apiKey = input.value.trim();
      
      if (input.dataset.hasKey === "true") {
        showStatus("API key already saved. Clear and re-enter to update.", true);
        return;
      }
      
      if (!apiKey) {
        showStatus("Please enter an API key", true);
        return;
      }

      await saveApiKey(apiKey);
    }
  });

  const clearButton = document.createElement("button");
  clearButton.textContent = "Clear Key";
  clearButton.className = "clear-button";
  clearButton.style.cssText = `
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: hsl(0 0% 15%);
    color: hsl(0 0% 98%);
    border: 1px solid hsl(0 0% 20%);
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-family: "Geist";
    font-weight: 500;
    transition: all 0.2s ease;
  `;
  
  clearButton.onmouseenter = () => {
    clearButton.style.background = "hsl(0 84% 60%)";
    clearButton.style.borderColor = "hsl(0 84% 65%)";
    clearButton.style.transform = "translateY(-1px)";
  };
  
  clearButton.onmouseleave = () => {
    clearButton.style.background = "hsl(0 0% 15%)";
    clearButton.style.borderColor = "hsl(0 0% 20%)";
    clearButton.style.transform = "translateY(0)";
  };
  
  clearButton.addEventListener("click", async () => {
    try {
      await secureStorage.set("hf_api_key", "");
      await secureStorage.set("mistral_api_key", "");
      input.value = "";
      input.dataset.hasKey = "false";
      showStatus("API key cleared", false);
    } catch (error) {
      showStatus("Failed to clear key", true);
    }
  });

  const container = input.parentElement;
  container.appendChild(clearButton);

  const versionInfo = document.createElement("div");
  versionInfo.style.cssText = `
    margin-top: 1rem;
    font-size: 12px;
    color: hsl(0 0% 64%);
    text-align: center;
    font-family: "Geist Mono";
    opacity: 0.8;
  `;
  versionInfo.textContent = `X-Bird v${chrome.runtime.getManifest().version}`;
  container.appendChild(versionInfo);
});
