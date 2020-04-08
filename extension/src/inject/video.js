// TODO: add full screen button when not in iframe, maybe with right click context menu

// TODO: Make an option to resize the popout window to its native video size: https://www.w3schools.com/jsref/met_win_resizeto.asp

const inIframe = self !== top;
const inPopup = window.opener !== null && window.opener !== window;

window.mainWindow = inPopup
  ? window.opener.mainWindow
  : window.parent.mainWindow;
const api = mainWindow.api;
var sourceVid, targetVid, displayName, id;

const setTitle = () => {
  console.log(displayName);
  document.title = "Jitsi Meet | " + displayName;
};

const syncSource = () => {
  if (targetVid.srcObject !== sourceVid.srcObject) {
    targetVid.srcObject = sourceVid.srcObject;
  }
};

const hashToUrlParams = (hash) => {
  return new URLSearchParams("?" + hash.substring(2).replace(/\//g, "&"));
};

const urlParamsToHash = (urlParams) => {
  return urlParams.toString().substring(1).replace(/&/g, "/");
};

const displayNameChangeHandler = (e) => {
  console.log("Name changed");
  if (e.id === id) {
    console.log("My name changed", displayName, e.displayname);
    const urlParams = hashToUrlParams(location.hash);
    urlParams.set("displayName", e.displayname);
    location.hash = urlParamsToHash(urlParams);
  }
};

const syncVideo = () => {
  if (inPopup && (!mainWindow || mainWindow.closed)) {
    window.close();
  }
  const newVid = api._getParticipantVideo(id);
  if (!newVid) {
    return;
  }

  if (sourceVid !== newVid) {
    if (sourceVid) {
      sourceVid.removeEventListener("loadedmetadata", syncSource);
      sourceVid.removeEventListener("pause", syncVideo);
      sourceVid.removeEventListener("ended", syncVideo);
      sourceVid.removeEventListener("suspend", syncVideo);
    }

    sourceVid = newVid;
    sourceVid.addEventListener("loadedmetadata", syncSource);
    sourceVid.addEventListener("pause", syncVideo);
    sourceVid.addEventListener("ended", syncVideo);
    sourceVid.addEventListener("suspend", syncVideo);
  }

  // Could have been in the if block above,
  // but I'd like to sync each time just to be sure
  syncSource();
};

const setup = () => {
  window.onhashchange = setup;

  const urlParams = hashToUrlParams(location.hash);
  id = urlParams.get("id");

  if (id === null) {
    window.close();
    return;
  }

  displayName = urlParams.get("displayName");
  console.log(urlParams.get("displayName"));
  setTitle();

  // Only run some setup code once
  if (!targetVid) {
    targetVid = document.createElement("video");
    targetVid.muted = true;
    targetVid.autoplay = true;
    syncVideo();

    document.body.appendChild(targetVid);

    // Keep source and target in sync
    setInterval(syncVideo, 1000);
    api.addEventListener("displayNameChange", displayNameChangeHandler);

    if (inPopup) {
      if (mainWindow && !mainWindow.closed && mainWindow.windows) {
        mainWindow.windows.push(window);
      }
      console.log(mainWindow.windows);

      const bc = new BroadcastChannel("popout_jitsi_channel");

      window.onunload = () => {
        api.removeEventListener("displayNameChange", displayNameChangeHandler);
        // Remove this window from the array of open pop-outs in the main window
        if (mainWindow && !mainWindow.closed && mainWindow.windows) {
          mainWindow.windows = mainWindow.windows.filter((win) => {
            return win !== window;
          });
        }

        bc.postMessage({ deselect: id });
        bc.close();
      };

      tryRuntimeSendMessage({
        type: "videoWinLoad",
      });

      // Send message to Jitsi frame
      bc.postMessage({ select: id });

      document.documentElement.addEventListener("keyup", function (event) {
        // Number 13 is the "Enter" key on the keyboard,
        // or "Escape" key pressed in full screen
        if (
          event.keyCode === 13 ||
          (event.keyCode === 27 && window.innerHeight == window.screen.height)
        ) {
          // Cancel the default action, if needed
          event.preventDefault();
          tryRuntimeSendMessage({
            type: "toggleFullScreen",
          });
        }
      });
    }
  }

  const objectFit = urlParams.get("fit");
  if (objectFit) {
    targetVid.style.objectFit = objectFit;
  }
};

if (inIframe || inPopup) {
  setup();
}
