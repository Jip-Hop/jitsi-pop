// TODO: add full screen button when not in iframe
// TODO: Make an option to resize the pop-out window to its native video size: https://www.w3schools.com/jsref/met_win_resizeto.asp

const inIframe = self !== top;
const inPopup = window.opener !== null && window.opener !== window;

window.mainWindow = inPopup
  ? window.opener.mainWindow
  : window.parent.mainWindow;
const api = mainWindow.api;
var sourceVid, targetVid, displayName, participantId, videoId, bc;

const syncSource = () => {
  if (targetVid.srcObject !== sourceVid.srcObject) {
    targetVid.srcObject = sourceVid.srcObject;
  }
};

const syncVideo = () => {
  if (inPopup && (!mainWindow || mainWindow.closed)) {
    window.close();
  }
  const newVid = api._getParticipantVideo(participantId);
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

const setTitle = () => {
  document.title = "Jitsi Meet | " + displayName;
};

const displayNameChangeHandler = (e) => {
  if (e.id === participantId) {
    displayName = e.displayname;
    setTitle();
  }
};

const update = () => {
  participantId = mainWindow.getParticipantId(videoId);
  displayName = mainWindow.getFormattedDisplayName(participantId);
  setTitle();
  syncVideo();
};

const hashToUrlParams = (hash) => {
  return new URLSearchParams("?" + hash.substring(2).replace(/\//g, "&"));
};

const setup = () => {
  bc = new BroadcastChannel("popout_jitsi_channel");

  const urlParams = hashToUrlParams(location.hash);
  videoId = urlParams.get("id");

  if (videoId === null) {
    return;
  }

  videoId = parseInt(videoId);

  bc.onmessage = (e) => {
    if (e.data.displayNameChange) {
      displayNameChangeHandler(e.data.displayNameChange);
    } else if (
      e.data.participantIdReplace &&
      e.data.participantIdReplace.oldId === participantId
    ) {
      participantId = e.data.participantIdReplace.newId;
      update();
    }
  };

  window.onunload = () => {
    // Remove this window from the array of open pop-outs in the main window
    if (mainWindow && !mainWindow.closed && mainWindow.windows) {
      mainWindow.windows = mainWindow.windows.filter((win) => {
        return win !== window;
      });
    }

    if (inPopup) {
      bc.postMessage({ deselect: participantId });
    }

    bc.close();
  };

  targetVid = document.createElement("video");
  targetVid.muted = true;
  targetVid.autoplay = true;

  update();

  document.body.appendChild(targetVid);

  // Keep source and target in sync
  setInterval(syncVideo, 1000);

  if (inPopup) {
    if (mainWindow && !mainWindow.closed && mainWindow.windows) {
      mainWindow.windows.push(window);
    }

    tryRuntimeSendMessage({
      type: "videoWinLoad",
    });

    // Send message to Jitsi frame
    bc.postMessage({ select: participantId });

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
};

if (inIframe || inPopup) {
  setup();
}
