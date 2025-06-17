chrome.runtime.onInstalled.addListener(() => {
  console.log("X-Bird extension installed successfully.");
  
  chrome.storage.sync.set({
    'brainrotIntensity': 50,
    'defaultMood': 'Auto',
    'extensionEnabled': true
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error setting default values:', chrome.runtime.lastError);
    } else {
      console.log('Default settings initialized.');
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log("X-Bird extension started.");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSettings') {
    chrome.storage.sync.get(['brainrotIntensity', 'defaultMood', 'extensionEnabled'], (result) => {
      sendResponse(result);
    });
    return true;
  } else if (request.action === 'saveSettings') {
    chrome.storage.sync.set(request.settings, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => {
  console.log("Extension icon clicked on tab:", tab.url);
});
