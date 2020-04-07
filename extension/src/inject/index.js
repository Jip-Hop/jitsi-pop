var options;

const toolbarHeight = window.outerHeight - window.innerHeight;
const popupWidth = 480;
const popupHeight = 270 + toolbarHeight;
var xOffset = 0,
  yOffset = 0;

const sidebar = document.querySelector("#sidebar");
const extId = chrome.runtime.id;

const bc = new BroadcastChannel("popout_jitsi_channel");

window.windows = [];
var windowIdCounter = 0;
var myDisplayName;

const getVideoDocUrl = (id, displayName) => {
  return `about:blank#/extId=${extId}/id=${id}/displayName=${displayName}/fit=cover`;
};

const replaceIdInHref = (win, oldId, id) => {
  win.location.href = win.location.href.replace(`id=${oldId}`, `id=${id}`);
};

const replaceDisplayNameInHref = (win, oldDisplayName, displayName) => {
  win.location.href = win.location.href.replace(
    `displayName=${oldDisplayName}`,
    `displayName=${displayName}`
  );
};

const popOutVideo = (id, displayName, windowId) => {
  const win = window.open(
    getVideoDocUrl(id, displayName),
    windowId,
    `status=no,menubar=no,width=${popupWidth},height=${popupHeight},left=${screen.left +
      xOffset},top=${screen.top + yOffset}`
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

    windows.push(win);
  }
};

const addVideo = id => {
  const participant = api._participants[id];

  // The participant must already have left the conference...
  if (!participant) {
    return;
  }

  const sourceVideo = api._getParticipantVideo(id);

  if (!sourceVideo) {
    // Wait for sourceVideo to appear
    setTimeout(() => addVideo(id), 1000);
    return;
  }

  const displayName =
    participant.displayName ||
    options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME;
  // Search for existing wrapper which matches id
  var videoWrapper = sidebar.querySelector(`.video-wrapper[data-id="${id}"]`);

  // Check if we can reuse an empty wrapper for same username
  if (!videoWrapper) {
    videoWrapper = sidebar.querySelector(
      `.video-wrapper[data-displayname="${displayName}"]:empty`
    );
    if (videoWrapper) {
      // We're reusing a wrapper with a new participant id,
      // also update the pop out windows
      const oldId = videoWrapper.dataset.id;

      // Keep only the open windows and replace their href
      windows = windows.filter(function(win) {
        if (!win.closed) {
          replaceIdInHref(win, oldId, id);
          return true;
        }
      });
    }
  }

  // Make new video wrapper
  if (!videoWrapper) {
    videoWrapper = document.createElement("div");
    videoWrapper.classList.add("video-wrapper");
    const windowId = windowIdCounter++;
    videoWrapper.addEventListener("click", () => {
      // Use a fixed windowId, so we'll always open the same window when clicking this wrapper
      popOutVideo(id, videoWrapper.dataset.displayname, windowId);
    });
    sidebar.appendChild(videoWrapper);
  }

  videoWrapper.setAttribute("data-id", id);
  videoWrapper.setAttribute("data-displayname", displayName);

  // Always remove the iframe from the wrapper, if it exists
  removeVideo(null, videoWrapper);

  const targetFrame = document.createElement("iframe");
  videoWrapper.appendChild(targetFrame);
  targetFrame.contentWindow.location = getVideoDocUrl(id, displayName);
  targetFrame.contentWindow.location.reload();
};

const removeVideo = (id, videoWrapper) => {
  if (id && !videoWrapper) {
    videoWrapper = sidebar.querySelector(`.video-wrapper[data-id="${id}"]`);
  }
  if (!videoWrapper) {
    return;
  }
  const targetFrame = videoWrapper.querySelector("iframe");
  if (!targetFrame) {
    return;
  }
  targetFrame.remove();
};

const setup = () => {
  const urlParams = new URLSearchParams(
    "?" + location.hash.substring(2).replace(/\//g, "&")
  );
  options.parentNode = document.querySelector("#meet");
  options.roomName = urlParams.get("roomName");

  window.api = new JitsiMeetExternalAPI(window.location.hostname, options);

  myDisplayName = urlParams.get("displayName");
  api.executeCommand("displayName", myDisplayName);
  api.executeCommand("subject", " ");

  // Hide filmStrip once on startup
  api.once("filmstripDisplayChanged", e => {
    if (e.enabled) {
      api.executeCommand("toggleFilmStrip");
    }
  });

  api.addEventListener("videoConferenceLeft", () => {
    tryRuntimeSendMessage({
      type: "videoConferenceLeft"
    });

    // Don't close window here, window will be gone when connection drops etc.
    // window.close();
  });

  api.addEventListener("videoConferenceJoined", e => {
    tryRuntimeSendMessage({
      type: "videoConferenceJoined"
    });

    addVideo(e.id);

    // TODO: wait a little, then ask everyone if one of them is moderator.
    // If no moderator yet, start moderating and check display name of each participant.
    // From then on also directly handle name change and join events.

    api.executeCommands({
      toggleFilmStrip: []
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

  api.addEventListener("displayNameChange", e => {
    // For local user
    if (e.id === api._myUserID) {
      if (
        e.displayname !== "" &&
        e.displayname !==
          options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME
      ) {
        replaceDisplayNameInHref(window, myDisplayName, e.displayname);
        myDisplayName = e.displayname;
        tryRuntimeSendMessage({
          type: "displayNameChange",
          displayName: myDisplayName
        });
      } else {
        api.executeCommand("displayName", myDisplayName);
      }
    } else {
      // For remote users
      displayNameWarning(e.id, e.displayname);
    }

    // Always update to current state
    const videoWrapper = sidebar.querySelector(
      `.video-wrapper[data-id="${e.id}"]`
    );

    if (videoWrapper) {
      videoWrapper.setAttribute(
        "data-displayname",
        e.displayname ||
          options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME
      );
    }
  });

  api.addEventListener("participantJoined", e => {
    displayNameWarning(e.id, e.displayName);

    addVideo(e.id);
  });

  api.addEventListener("participantLeft", e => {
    removeVideo(e.id);
  });

  window.onbeforeunload = e => {
    // Ask for confirmation
    e.preventDefault();
    e.returnValue = "";
  };

  window.onunload = () => {
    windows.forEach(win => {
      win.close();
    });
  };
};

tryRuntimeSendMessage(
  {
    type: "mainWinLoad"
  },
  response => {
    options = response.options;
    setup();
  }
);
