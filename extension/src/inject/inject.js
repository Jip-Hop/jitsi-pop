// This code only runs on pages from meet.jit.si, 8x8.vc and jitsi.riot.im,
// or about:blank pages opened from those domains.

const extId = chrome.runtime.id;

// Used in both index.js and video.js
const tryRuntimeSendMessage = (message, callback) => {
  try {
    chrome.runtime.sendMessage(message, callback);
  } catch (e) {
    if (e.message === "Extension context invalidated.") {
      // Can no longer communicate with background page, so close
      window.close();
    } else {
      console.log(e);
    }
  }
};

const loadMain = async () => {
  const html = await fetch(
    chrome.runtime.getURL("src/inject/index.html")
  ).then(response => response.text());
  // Replace page contents with custom HTML
  document.documentElement.innerHTML = html;

  // Import Jitsi Meet external API and custom script
  import(`https://${window.location.hostname}/external_api.js`).then(() => {
    import(chrome.runtime.getURL("src/inject/index.js"));
  });

  // There's no event to catch Extension unloading,
  // onbeforeunload etc. on the background page doesn't work.
  // So poll to check if we can still communicate with Extension.
  setInterval(() => {
    try {
      chrome.runtime.getURL("");
    } catch (e) {
      if (e.message === "Extension context invalidated.") {
        // Means Extension has unloaded, close windows.
        window.onbeforeunload = null;
        window.close();
      } else {
        console.log(e);
      }
    }
  }, 1000);
};

const loadVideo = async () => {
  const html = await fetch(
    chrome.runtime.getURL("src/inject/video.html")
  ).then(response => response.text());
  document.documentElement.innerHTML = html;

  import(chrome.runtime.getURL("src/inject/video.js"));
};

const loadJitsiFrame = () => {
  const inject = () => {
    var s = document.createElement("script");
    s.src = chrome.runtime.getURL("src/inject/jitsiFrame.js");
    s.onload = function() {
      this.remove();
    };

    document.head.appendChild(s);
  };

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    // call on next available tick
    setTimeout(inject, 1);
  } else {
    document.addEventListener("DOMContentLoaded", inject);
  }
};

const hasExtHash = win => {
  return win.location.hash.startsWith("#/extId=" + extId);
};

const isAboutBlank = win => {
  return win.location.href.startsWith("about:blank");
};

const isCrossDomain = () => {
  try {
    return !Boolean(top.location.href);
  } catch (e) {
    return true;
  }
};

const isIframe = () => {
  return self !== top;
};

if (hasExtHash(window)) {
  const preventLoadingAndEmpty = callback => {
    // Stop loading contents of the page, only the origin matters
    // so we can access iframes of the same origin.

    // Calling window.stop(); here would be the easiest.
    // Prevents loading further and prevents running all scripts
    // on the original page.
    // But it has unwanted side effects too, like no longer asking
    // for camera permission.
    //
    // As an alternative to window.stop() we could load a page
    // of desired origin, once, in the background script (perhaps only
    // after the browser action popup has been activated), and use it
    // to launch about:blank popups with desired origin.
    // But when this page in background script doesn't load, maybe internet
    // is down, then it's hidden to the user and we need to wait and retry.
    // At list with this method it immediately launches a visible
    // window with a "No Internet" warning.
    // window.stop();

    // https://medium.com/snips-ai/how-to-block-third-party-scripts-with-a-few-lines-of-javascript-f0b08b9c4c0
    // https://stackoverflow.com/a/59518023

    document.documentElement.innerHTML = "";
    document.documentElement.style.background = "black";

    const observer = new MutationObserver(mutations => {
      mutations.forEach(({ addedNodes }) => {
        addedNodes.forEach(node => {
          // Remove all new nodes from the DOM, including scripts,
          // even before the script runs.
          node.parentElement.removeChild(node);
        });
      });
    });
    // Starts the monitoring
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener("DOMContentLoaded", () => {
      // We now have a clean, empty page of desired origin,
      // and no foreign scripts have been run
      observer.disconnect();
      if (typeof callback === "function") {
        callback();
      }
    });
  };

  // Current page is to be processed by this extension
  if (isAboutBlank(window)) {
    // Make current page a video window
    preventLoadingAndEmpty(loadVideo);
  } else {
    // Make current page our main window
    preventLoadingAndEmpty(loadMain);
  }
} else if (
  isIframe() &&
  !isCrossDomain() &&
  hasExtHash(top.window) &&
  !isAboutBlank(top.window)
) {
  // Jitsi iframe in the main window
  loadJitsiFrame();
}
