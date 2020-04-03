window.servers = [
  // "beta.meet.jit.si",
  "meet.jit.si",
  "8x8.vc",
  "jitsi.riot.im"
];

import { options } from "./jitsiConfig.js";

window.options = options;
window.selectedServerIndex = 0;

const extUrl = chrome.runtime.getURL("");
const windowTarget = "meet";
const width = 960,
  height = 465;

var openedUrl;
var mainAppBrowserTab;
var videoPopupBrowserTabs = [];
var connectionState;
var windowClosedPoller;

const tryUpdate = (tabId, updateProperties) => {
  chrome.windows.update(tabId, updateProperties, () => {
    if (chrome.runtime.lastError) {
      console.log(chrome.runtime.lastError.message);
    }
  });
};

const setConnectionState = int => {
  connectionState = int;
  if (connectionState === 0) {
    clearInterval(windowClosedPoller);
    chrome.browserAction.setBadgeText({ text: "" });
    // Send message to notify the browser action popup
    chrome.runtime.sendMessage({
      type: "videoConferenceLeft"
    });
  } else if (connectionState === 1) {
    chrome.browserAction.setBadgeBackgroundColor({
      color: [255, 153, 31, 255]
    });
    chrome.browserAction.setBadgeText({ text: " " });
  } else if (connectionState === 2) {
    chrome.browserAction.setBadgeBackgroundColor({
      color: [65, 216, 115, 255]
    });
    chrome.browserAction.setBadgeText({ text: " " });
  }
};

const closeMainAppWindowObject = () => {
  if (window.mainAppWindowObject && !window.mainAppWindowObject.closed) {
    window.mainAppWindowObject.close();
    setConnectionState(0);
  }
};

window.openPopout = (displayName, roomName) => {
  const domain = servers[selectedServerIndex];
  localStorage.setItem("serverSelect", selectedServerIndex);
  localStorage.setItem("displayName", displayName);

  let recentRoomNames = JSON.parse(localStorage.getItem("recentRooms")) || [];
  // If roomName is already in the list, get rid of it
  recentRoomNames = recentRoomNames.filter(e => e.roomName !== roomName);
  // Then add it to the front
  recentRoomNames.unshift({ roomName: roomName, timestamp: Date.now() });
  localStorage.setItem("recentRooms", JSON.stringify(recentRoomNames));

  openedUrl = `https://${domain}/#${extUrl}?displayName=${displayName}&roomName=${roomName}`;
  window.mainAppWindowObject = window.open(
    openedUrl,
    windowTarget,
    `status=no,menubar=no,width=${width},height=${height},left=${screen.width /
      2 -
      width / 2},top=${screen.height / 2 - height / 2}`
  );

  setConnectionState(1);

  // We need to poll the window to check if it's closed,
  // because when there's no internet connection we can't
  // setup the content script to notify us when the window closes.
  // Using onbeforeunload doesn't tell us if the window actually closed,
  // and it seemed to fire too soon anyway (maybe due to window.stop()?).
  clearInterval(windowClosedPoller);
  windowClosedPoller = setInterval(() => {
    if (
      connectionState > 0 &&
      window.mainAppWindowObject &&
      window.mainAppWindowObject.closed
    ) {
      setConnectionState(0);
    }
  }, 1000);
};

window.focusAllWindows = () => {
  // Focus from here, calling .focus() in content script is limited

  videoPopupBrowserTabs.forEach(tab => {
    tryUpdate(tab.windowId, { focused: true });
  });
  if (mainAppBrowserTab) {
    tryUpdate(mainAppBrowserTab.windowId, { focused: true });
  } else if (window.mainAppWindowObject && !window.mainAppWindowObject.closed) {
    // Try to focus window this way.
    // Would only happen when content script couldn't init,
    // e.g. due to internet down.
    window.mainAppWindowObject = window.open(openedUrl, windowTarget);
  }
};

window.disconnect = () => {
  focusAllWindows();
  const shouldClose = confirm(`Close all windows?`);
  if (shouldClose == true) {
    closeMainAppWindowObject();
  }
};

chrome.tabs.onRemoved.addListener(tabId => {
  if (mainAppBrowserTab && mainAppBrowserTab.id === tabId) {
    // Main window closed
    setConnectionState(0);
    mainAppBrowserTab = null;
  } else {
    // Check if video popup is closed
    videoPopupBrowserTabs = videoPopupBrowserTabs.filter(function(tab) {
      if (tab.id === tabId) {
        // Video popup is closed
        return false;
      }
      // Keep this id, it's not yet closed
      return true;
    });
  }
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === "mainWinLoad") {
    mainAppBrowserTab = sender.tab;
    sendResponse({ options: options });
  } else if (message.type === "videoWinLoad") {
    videoPopupBrowserTabs.push(sender.tab);
  } else if (message.type === "toggleFullScreen") {
    chrome.windows.get(sender.tab.windowId, {}, win => {
      if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError.message);
      } else {
        const newState = win.state === "fullscreen" ? "normal" : "fullscreen";
        tryUpdate(sender.tab.windowId, { state: newState });
      }
    });
  } else if (message.type === "displayNameChange") {
    localStorage.setItem("displayName", message.displayName);
  } else if (message.type === "videoConferenceLeft") {
    setConnectionState(0);
  } else if (message.type === "videoConferenceJoined") {
    setConnectionState(2);
  }
});

setConnectionState(0);
