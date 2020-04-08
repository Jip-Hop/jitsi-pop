var options = {};

const toolbarHeight = window.outerHeight - window.innerHeight;
const popupWidth = 480;
const popupHeight = 270 + toolbarHeight;
var xOffset = 0,
  yOffset = 0;

const sidebar = document.querySelector("#sidebar");
const extId = chrome.runtime.id;

const bc = new BroadcastChannel("popout_jitsi_channel");

window.mainWindow = window;
window.windows = [];
var videoIdCounter = 0;
var myDisplayName;
const participantIdToSidebarVideoWrapper = new Map();
const displayNameToEmptyWrappers = new Map();
const participantIdToDisplayName = new Map();
const videoIdToParticipantId = new Map();

const formatDisplayName = (displayName) => {
  return displayName && displayName !== ""
    ? displayName
    : options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME;
};

window.getFormattedDisplayName = (id) => {
  return formatDisplayName(participantIdToDisplayName.get(id));
};

const getByValue = (map, searchValue) => {
  for (let [key, value] of map) {
    if (value === searchValue) return key;
  }
};

const getVideoDocUrl = (id) => {
  return `about:blank#/extId=${extId}/id=${id}/fit=cover`;
};

// TODO: I can't rely on replaceIdInHash, especially not when we have
// pop-up windows, iframes in the sidebar, and iframes in a pop-up window (multiview)
// and they all need to keep in sync.
// Need to use my own id system and tie the current displayName and current participantId to it.
const replaceIdInHash = (win, oldId, id) => {
  win.location.hash = win.location.hash.replace(`id=${oldId}`, `id=${id}`);
};

const popOutVideo = (videoId) => {
  const participantId = videoIdToParticipantId.get(videoId);
  const win = window.open(
    getVideoDocUrl(participantId),
    videoId,
    `status=no,menubar=no,width=${popupWidth},height=${popupHeight},left=${
      screen.left + xOffset
    },top=${screen.top + yOffset}`
  );

  // We made a new window
  if (windows.indexOf(win) === -1) {
    xOffset += popupWidth;
    if (xOffset + popupWidth > screen.width) {
      xOffset = 0;
      yOffset += popupHeight;
    }
    if (yOffset + popupHeight > screen.height) {
      xOffset = 0;
      yOffset = 0;
    }

    // Don't push here, but from the pop-up window itself.
    // Then we also add it back on window reload.
    // windows.push(win);
  }
};

const addVideo = (participantId, displayName) => {
  console.log("ADD VIDEO", participantId, displayName);
  const participant = api._participants[participantId];

  // The participant must already have left the conference...
  if (!participant) {
    return;
  }

  const sourceVideo = api._getParticipantVideo(participantId);

  if (!sourceVideo) {
    // Wait for sourceVideo to appear
    setTimeout(() => addVideo(participantId, displayName), 1000);
    return;
  }

  // TODO: don't directly call set, make a function to do it and notify via bc channel,
  // perhaps make dedicated bc channel for video pages and one for the jitsiFrame
  participantIdToDisplayName.set(participantId, displayName);
  displayName = formatDisplayName(displayName);

  // Search for existing wrapper which matches participantId
  // var videoWrapper = sidebar.querySelector(`.video-wrapper[data-participantId="${participantId}"]`);
  var videoWrapper = participantIdToSidebarVideoWrapper.get(participantId);
  var videoId;

  // Check if we can reuse an empty wrapper for same username
  if (!videoWrapper) {
    const emptyWrappers = displayNameToEmptyWrappers.get(displayName);
    console.log("ADD VIDEO emptyWrappers", new Array(emptyWrappers));
    videoWrapper = emptyWrappers ? emptyWrappers.shift() : null;
    console.log("ADD VIDEO videoWrapper", videoWrapper);
    if (videoWrapper) {
      // We're reusing a wrapper with a new participantId,
      // update the map
      const oldId = getByValue(participantIdToSidebarVideoWrapper, videoWrapper);
      const videoId = getByValue(videoIdToParticipantId, oldId);
      // TODO: don't call set directly but make a function and ping changed via bc
      videoIdToParticipantId.set(videoId, participantId);
      console.log(
        "ADD VIDEO, replace wrapper",
        videoId,
        participantId,
        new Map(videoIdToParticipantId)
      );
      // Also update the pop out windows

      // Keep only the open windows and replace their href
      // TODO: ping via bc channel, but never change hash
      windows = windows.filter(function (win) {
        if (!win.closed) {
          console.log("ADD VIDEO, replace hash", win.location.hash, oldId, participantId);
          replaceIdInHash(win, oldId, participantId);
          console.log("ADD VIDEO, replace hash", win.location.hash, oldId, participantId);
          return true;
        }
      });
    }
  }

  // Make new video wrapper
  if (!videoWrapper) {
    videoWrapper = document.createElement("div");
    videoWrapper.classList.add("video-wrapper");
    videoId = videoIdCounter++;
    videoIdToParticipantId.set(videoId, participantId);
    console.log(
      "ADD VIDEO, make new wrapper",
      videoId,
      participantId,
      new Map(videoIdToParticipantId)
    );
    videoWrapper.addEventListener("click", () => {
      // Use a fixed videoId, so we'll always open the same window when clicking this wrapper.
      // But get the current participantId (may have changed).
      console.log(videoIdToParticipantId, videoId);
      popOutVideo(videoId);
    });
    sidebar.appendChild(videoWrapper);
  }

  participantIdToSidebarVideoWrapper.set(participantId, videoWrapper);
  videoWrapper.setAttribute("data-displayname", displayName);

  // Always remove the iframe from the wrapper, if it exists
  removeVideo(null, videoWrapper);

  const targetFrame = document.createElement("iframe");
  videoWrapper.appendChild(targetFrame);
  targetFrame.contentWindow.location = getVideoDocUrl(participantId);
  targetFrame.contentWindow.location.reload();
};

const removeVideo = (participantId, videoWrapper) => {
  if (participantId && !videoWrapper) {
    videoWrapper = participantIdToSidebarVideoWrapper.get(participantId);
  }
  if (!videoWrapper) {
    return;
  }
  const targetFrame = videoWrapper.querySelector("iframe");
  if (!targetFrame) {
    return;
  }
  targetFrame.remove();
  const displayName = participantIdToDisplayName.get(participantId);
  if (!displayNameToEmptyWrappers.has(displayName)) {
    displayNameToEmptyWrappers.set(displayName, [videoWrapper]);
  } else {
    displayNameToEmptyWrappers.get(displayName).push(videoWrapper);
  }
};

const setup = () => {
  const urlParams = new URLSearchParams(
    "?" + location.hash.substring(2).replace(/\//g, "&")
  );
  options.parentNode = document.querySelector("#meet");
  options.roomName = urlParams.get("roomName");

  window.api = new JitsiMeetExternalAPI(window.location.hostname, options);

  api.executeCommand("subject", " ");

  // Hide filmStrip once on startup
  api.once("filmstripDisplayChanged", (e) => {
    if (e.enabled) {
      api.executeCommand("toggleFilmStrip");
    }
  });

  api.addEventListener("videoConferenceLeft", () => {
    tryRuntimeSendMessage({
      type: "videoConferenceLeft",
    });

    // Don't close window here, window will be gone when connection drops etc.
    // window.close();
  });

  api.addEventListener("videoConferenceJoined", (e) => {
    tryRuntimeSendMessage({
      type: "videoConferenceJoined",
    });

    addVideo(e.id, e.displayName);

    // TODO: wait a little, then ask everyone if one of them is moderator.
    // If no moderator yet, start moderating and check display name of each participant.
    // From then on also directly handle name change and join events.

    api.executeCommands({
      toggleFilmStrip: [],
    });
  });

  const displayNameWarning = (id, displayName) => {
    var message;
    if (!displayName) {
      message = "Please choose a name that nobody is using in this room.";
    } else if (
      displayName ===
      options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME
    ) {
      message = `Please choose a name that nobody is using in this room, but don't use "${options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME}".`;
    } else {
      var nameIsDuplicate = false;

      for (var [key, value] of Object.entries(api._participants)) {
        if (key === id) {
          continue;
        }
        if (value.displayName === displayName) {
          nameIsDuplicate = true;
          break;
        }
      }

      if (nameIsDuplicate) {
        message = `Everyone in the room needs to have a unique nickname. Could you please pick one that's not in use already?`;
      } else {
        return;
      }
    }

    // TODO: when multiple users have this extension installed, messages will come multiple times.
    // So negotiate which one will be the 'moderator' and who will send these messages.

    bc.postMessage({ displayNameWarning: { id: id, message: message } });
  };

  api.addEventListener("displayNameChange", (e) => {
    participantIdToDisplayName.set(e.id, e.displayname);
    bc.postMessage({ displayNameChange: e });
    // For local user
    if (e.id === api._myUserID) {
      myDisplayName = e.displayname;
      if (
        e.displayname !== "" &&
        e.displayname !==
          options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME
      ) {
        // This displayName is fine...
      } else {
        // TODO: warn user, but don't reset displayName here
        // Could cause loops etc.
        // Also check if it's a unique name in the room.
        // api.executeCommand("displayName", myDisplayName);
      }
    } else {
      // For remote users
      displayNameWarning(e.id, e.displayname);
    }

    // Always update to current state
    const videoWrapper = participantIdToSidebarVideoWrapper.get(e.id);

    if (videoWrapper) {
      videoWrapper.setAttribute(
        "data-displayname",
        formatDisplayName(e.displayname)
      );
    }
  });

  api.addEventListener("participantJoined", (e) => {
    displayNameWarning(e.id, e.displayName);
    addVideo(e.id, e.displayName);
  });

  api.addEventListener("participantLeft", (e) => {
    // Don't delete from map, only delete after we've removed the
    // offline participant from the sidebar and all its windows are closed
    // participantIdToDisplayName.delete(e.id);
    removeVideo(e.id);
  });

  window.onbeforeunload = (e) => {
    // Ask for confirmation
    e.preventDefault();
    e.returnValue = "";
  };

  window.onunload = () => {
    windows.forEach((win) => {
      win.close();
    });
  };
};

tryRuntimeSendMessage(
  {
    type: "mainWinLoad",
  },
  (response) => {
    options = response.options;
    setup();
  }
);
