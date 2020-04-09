// TODO: add full screen button when not in iframe
// TODO: Make an option to resize the pop-out window to its native video size: https://www.w3schools.com/jsref/met_win_resizeto.asp

const inIframe = self !== top;
const inPopup = window.opener !== null && window.opener !== window;

const jitsipop = (window.jitsipop = inPopup
  ? window.opener.jitsipop
  : window.parent.jitsipop);

const mainWindow = jitsipop.mainWindow;

var sourceVid, targetVid, displayName, participantId, videoId /*, bc*/;

const syncSource = () => {
  if (targetVid.srcObject !== sourceVid.srcObject) {
    targetVid.srcObject = sourceVid.srcObject;
  }
};

const syncVideo = () => {
  if (inPopup && (!mainWindow || mainWindow.closed)) {
    window.close();
  }
  const newVid = jitsipop.getParticipantVideo(participantId);
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

const displayNameChangeHandler = (newDisplayName) => {
  displayName = newDisplayName;
  setTitle();
};

const participantIdReplaceHandler = (newParticipantId) => {
  participantId = newParticipantId;
  update();
};

const update = () => {
  participantId = jitsipop.getParticipantId(videoId);
  displayName = jitsipop.getFormattedDisplayName(participantId);
  setTitle();
  syncVideo();
};

const hashToUrlParams = (hash) => {
  return new URLSearchParams("?" + hash.substring(2).replace(/\//g, "&"));
};

const setup = () => {
  // Allow calling these functions from mainWindow
  window.displayNameChangeHandler = displayNameChangeHandler;
  window.participantIdReplaceHandler = participantIdReplaceHandler;
  // bc = new BroadcastChannel("popout_jitsi_channel");

  const urlParams = hashToUrlParams(location.hash);
  videoId = urlParams.get("id");

  if (videoId === null) {
    return;
  }

  videoId = parseInt(videoId);

  // bc.onmessage = (e) => {
  //   if (e.data.displayNameChange) {
  //     displayNameChangeHandler(e.data.displayNameChange);
  //   } else if (
  //     e.data.participantIdReplace &&
  //     e.data.participantIdReplace.oldId === participantId
  //   ) {
  //     participantId = e.data.participantIdReplace.newId;
  //     update();
  //   }
  // };

  window.onunload = () => {
    // Remove this window from the array of open pop-outs in the main window
    if (mainWindow && !mainWindow.closed) {
      if (inPopup) {
        jitsipop.removeWindow(videoId, window);
      } else if (inIframe) {
        jitsipop.removeIframe(videoId, window);
      }
    }

    // TODO: needs a counter somewhere, because if it's open in multiview (not implemented yet),
    // and open in a pop-out window, it needs to still receive high res if only one of them is closed
    jitsipop.receiveHighRes(participantId, false);
    // bc.close();
  };

  targetVid = document.createElement("video");
  targetVid.muted = true;
  targetVid.autoplay = true;

  update();

  document.body.appendChild(targetVid);

  // Keep source and target in sync
  setInterval(syncVideo, 1000);

  if (inPopup) {
    if (mainWindow && !mainWindow.closed) {
      // jitsipop.windows.push(window);
      jitsipop.addWindow(videoId, window);
    }

    tryRuntimeSendMessage({
      type: "videoWinLoad",
    });

    jitsipop.receiveHighRes(participantId, true);

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
  } else if (inIframe) {
    if (mainWindow && !mainWindow.closed) {
      jitsipop.addIframe(videoId, window);
    }
  }
};

if (inIframe || inPopup) {
  setup();
}
