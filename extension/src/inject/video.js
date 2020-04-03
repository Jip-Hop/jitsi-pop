// TODO: add full screen button when not in iframe, maybe with right click context menu

// TODO: Make an option to resize the popout window to its native video size: https://www.w3schools.com/jsref/met_win_resizeto.asp

const inIframe = self !== top;
const inPopup = window.opener !== null && window.opener !== window;

const api = inPopup ? window.opener.api : window.top.api;
var sourceVid, targetVid, displayName, id;

const setTitle = () => {
  document.title = "Jitsi Meet | " + displayName;
};

const syncSource = () => {
  if (targetVid.srcObject !== sourceVid.srcObject) {
    targetVid.srcObject = sourceVid.srcObject;
  }
};

const displayNameChangeHandler = e => {
  if (e.id === id) {
    window.location.href = window.location.href.replace(
      `displayName=${displayName}`,
      `displayName=${e.displayname}`
    );
  }
};

const syncVideo = () => {
  if (inPopup && (!window.opener || window.opener.closed)) {
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

  const urlParams = new URLSearchParams(
    window.location.hash.substring(
      window.location.hash.indexOf("?"),
      window.location.hash.length
    )
  );

  id = urlParams.get("id");

  if (id === null) {
    window.close();
    return;
  }

  displayName = urlParams.get("displayName");
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
    api.on("displayNameChange", displayNameChangeHandler);

    if (inPopup) {
      const bc = new BroadcastChannel("popout_jitsi_channel");

      window.onunload = () => {
        // Remove this window from the array of open pop-outs in the main window
        opener.windows = opener.windows.filter(win => {
          return win !== window;
        });

        bc.postMessage({ deselect: id });
        bc.close();
      };

      tryRuntimeSendMessage({
        type: "videoWinLoad"
      });

      // Send message to Jitsi frame
      bc.postMessage({ select: id });

      document.documentElement.addEventListener("keyup", function(event) {
        // Number 13 is the "Enter" key on the keyboard,
        // or "Escape" key pressed in full screen
        if (event.keyCode === 13 || (event.keyCode === 27 && window.innerHeight == window.screen.height)) {
          // Cancel the default action, if needed
          event.preventDefault();
          tryRuntimeSendMessage({
            type: "toggleFullScreen"
          });
        }
      });
    }
  }
};

if (inIframe || inPopup) {
  setup();
}
