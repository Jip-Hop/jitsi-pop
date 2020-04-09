// Declare jitsipop API object
const jitsipop = {};

const database = new Map([
  /* Data structure example
    [
      0,
      {
        videoId: 0, // unique, also used as key
        displayName: "jip",
        participantId: "asdfgh", // unique
        sidebarVideoWrapper: "html element", // unique
        online: true,
        iframes: Set ["iframe window object"], // each iframe window object in the Set is unique
        windows: Set ["pop-out window object"], // each pop-out window object in the Set is unique
      },
    ],
    */
]);

var options = {};
var api;

const toolbarHeight = window.outerHeight - window.innerHeight;
const popupWidth = 480;
const popupHeight = 270 + toolbarHeight;
var xOffset = 0,
  yOffset = 0;

const sidebar = document.querySelector("#sidebar");
const extId = chrome.runtime.id;

const bc = new BroadcastChannel("popout_jitsi_channel");

var videoIdCounter = 0;
var myDisplayName;

const receiveHighRes = (participantId, shouldReceiveHighRes) => {
  if (shouldReceiveHighRes) {
    bc.postMessage({ select: participantId });
  } else {
    bc.postMessage({ deselect: participantId });
  }
};

const getParticipantVideo = (participantId) => {
  if (api && api._getParticipantVideo) {
    return api._getParticipantVideo(participantId);
  }
};

const getItem = (videoId) => {
  return database.get(videoId);
};

const addIframe = (videoId, iframe) => {
  const item = getItem(videoId);
  if (item && item.iframes) {
    item.iframes.add(iframe);
  } else {
    console.trace("Couldn't add iframe for videoId", videoId, item);
  }
};

const removeIframe = (videoId, iframe) => {
  const item = getItem(videoId);
  if (item && item.iframes && item.iframes.has(iframe)) {
    item.iframes.delete(iframe);
  } else {
    console.trace("Couldn't delete iframe for videoId", videoId, item);
  }
};

const addWindow = (videoId, window) => {
  const item = getItem(videoId);
  if (item && item.windows) {
    item.windows.add(window);
  } else {
    console.trace("Couldn't add window for videoId", videoId, item);
  }
};

const removeWindow = (videoId, window) => {
  const item = getItem(videoId);
  if (item && item.windows && item.windows.has(window)) {
    item.windows.delete(window);
  } else {
    console.trace("Couldn't delete window for videoId", videoId, item);
  }
};

const closeAllWindows = () => {
  // TODO: also close multiview window in the future
  for (let item of database.values()) {
    if (item.windows) {
      for (let win of item.windows) {
        win.close();
      }
    }
  }
};

const windowAlreadyOpen = (newWin) => {
  for (let item of database.values()) {
    if (item.windows && item.windows.has(newWin)) {
      return true;
    }
  }
};

const formatDisplayName = (displayName) => {
  return displayName && displayName !== ""
    ? displayName
    : options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME;
};

const getItemByParticipantId = (participantId, status) => {
  for (let item of database.values()) {
    if (item.participantId === participantId) {
      return item;
    }
  }

  console.trace(
    "Item not found for participantId",
    participantId,
    new Map(database)
  );
};

const getFormattedDisplayName = (participantId) => {
  const item = getItemByParticipantId(participantId);
  return formatDisplayName(item ? item.displayName : "");
};

const getSidebarVideoWrapperByParticipantId = (participantId) => {
  const item = getItemByParticipantId(participantId);
  if (item && item.sidebarVideoWrapper) {
    return item.sidebarVideoWrapper;
  } else {
    console.trace(
      "sidebarVideoWrapper not found for participantId",
      participantId,
      new Map(database)
    );
  }
};

const getParticipantId = (videoId) => {
  const databaseItem = database.get(videoId);
  if (databaseItem) {
    return databaseItem.participantId;
  } else {
    console.trace("Item not found for videoId", videoId, new Map(database));
  }
};

const getVideoDocUrl = (videoId) => {
  return `about:blank#/extId=${extId}/id=${videoId}`;
};

const popOutVideo = (videoId) => {
  const win = window.open(
    getVideoDocUrl(videoId),
    videoId,
    `status=no,menubar=no,width=${popupWidth},height=${popupHeight},left=${
      screen.left + xOffset
    },top=${screen.top + yOffset}`
  );

  // We made a new window
  if (!windowAlreadyOpen(win)) {
    xOffset += popupWidth;
    if (xOffset + popupWidth > screen.width) {
      xOffset = 0;
      yOffset += popupHeight;
    }
    if (yOffset + popupHeight > screen.height) {
      xOffset = 0;
      yOffset = 0;
    }
  }
};

const domPositionComparator = (a, b) => {
  if (a === b) {
    return 0;
  }

  var position = a.compareDocumentPosition(b);

  if (
    position & Node.DOCUMENT_POSITION_FOLLOWING ||
    position & Node.DOCUMENT_POSITION_CONTAINED_BY
  ) {
    return -1;
  } else if (
    position & Node.DOCUMENT_POSITION_PRECEDING ||
    position & Node.DOCUMENT_POSITION_CONTAINS
  ) {
    return 1;
  } else {
    return 0;
  }
};

const sidebarVideoWrappersDomOrder = (a, b) => {
  return domPositionComparator(a.sidebarVideoWrapper, b.sidebarVideoWrapper);
};

const getEntriesByName = (displayName, status) => {
  // displayName is required, status optional
  if (!displayName) {
    return [];
  }

  return Array.from(database.values()).reduce((result, data) => {
    if (data.displayName !== displayName) {
      return result;
    }

    if (
      !status ||
      (status === "offline" && !data.online) ||
      (status === "online" && data.online)
    ) {
      result.push(data);
    }

    return result;
  }, []);
};

const videoOnlineHandler = (participantId) => {
  const participant = api._participants[participantId];

  // The participant must already have left the conference...
  if (!participant) {
    return;
  }

  const sourceVideo = getParticipantVideo(participantId);

  if (!sourceVideo) {
    // Wait for sourceVideo to appear
    setTimeout(() => videoOnlineHandler(participantId), 1000);
    return;
  }
  const displayName = participant.displayName;
  const newData = {
    participantId: participantId,
    displayName: participant.displayName,
    online: true,
  };

  // Search for existing wrapper which matches participantId
  var sidebarVideoWrapper = getSidebarVideoWrapperByParticipantId(
    participantId
  );
  var videoId;
  var didReuseWrapper = false;

  // Check if we can reuse an empty wrapper for same displayName
  if (!sidebarVideoWrapper) {
    const offlineEntries = getEntriesByName(displayName, "offline");
    if (offlineEntries.length) {
      offlineEntries.sort(sidebarVideoWrappersDomOrder);

      // Get first empty wrapper
      const firstOfflineItem = offlineEntries.shift();
      sidebarVideoWrapper = firstOfflineItem.sidebarVideoWrapper;
      if (sidebarVideoWrapper) {
        videoId = firstOfflineItem.videoId;
        didReuseWrapper = true;
      }
    }
  }

  // Make new video wrapper
  if (!sidebarVideoWrapper) {
    sidebarVideoWrapper = document.createElement("div");
    sidebarVideoWrapper.classList.add("video-wrapper");
    videoId = videoIdCounter++;

    sidebarVideoWrapper.addEventListener("click", () => {
      // Use the fixed videoId, so we'll always open the same window when clicking this wrapper.
      popOutVideo(videoId);
    });

    const targetFrame = document.createElement("iframe");
    targetFrame.src = getVideoDocUrl(videoId);
    sidebarVideoWrapper.appendChild(targetFrame);

    sidebar.appendChild(sidebarVideoWrapper);
    // Setting the src to a url with about:blank + hash doesn't trigger a load,
    // so reload to properly inject the content script
    targetFrame.contentWindow.location.reload();

    // Init all other values for database item here
    newData.iframes = new Set();
    newData.windows = new Set();
  }

  newData.videoId = videoId;
  newData.sidebarVideoWrapper = sidebarVideoWrapper;

  if (database.has(videoId)) {
    const oldData = database.get(videoId);
    // Merge in the new data.
    // This action does not mutate but sets it to a new object...
    database.set(videoId, { ...oldData, ...newData });

    // TODO: didReuseWrapper boolean may be redundant to database.has(videoId)
    if (didReuseWrapper) {
      // Update all windows and iframes
      for (let win of new Set([...oldData.windows, ...oldData.iframes])) {
        if (typeof win.participantIdReplaceHandler === "function") {
          win.participantIdReplaceHandler(participantId);
        }
      }
    }
  } else {
    database.set(videoId, newData);
  }

  sidebarVideoWrapper.setAttribute(
    "data-displayname",
    formatDisplayName(displayName)
  );
};

const videoOfflineHandler = (participantId) => {
  if (!participantId) {
    return;
  }

  const item = getItemByParticipantId(participantId);

  if (!item) {
    return;
  }

  item.online = false;
};

const setup = () => {
  const urlParams = new URLSearchParams(
    "?" + location.hash.substring(2).replace(/\//g, "&")
  );
  options.parentNode = document.querySelector("#meet");
  options.roomName = urlParams.get("roomName");

  api = new JitsiMeetExternalAPI(window.location.hostname, options);

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

    videoOnlineHandler(e.id, e.displayName);

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
    const displayName = e.displayname;
    const participantId = e.id;
    const item = getItemByParticipantId(participantId);
    if (item) {
      item.displayName = displayName;

      for (let win of new Set([...item.windows, ...item.iframes])) {
        if (typeof win.displayNameChangeHandler === "function") {
          win.displayNameChangeHandler(displayName);
        }
      }
    }

    // For local user
    if (participantId === api._myUserID) {
      myDisplayName = displayName;
      if (
        displayName !== "" &&
        displayName !==
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
      displayNameWarning(participantId, displayName);
    }

    // Always update to current state
    const sidebarVideoWrapper = getSidebarVideoWrapperByParticipantId(
      participantId
    );

    if (sidebarVideoWrapper) {
      sidebarVideoWrapper.setAttribute(
        "data-displayname",
        formatDisplayName(displayName)
      );
    }
  });

  api.addEventListener("participantJoined", (e) => {
    displayNameWarning(e.id, e.displayName);
    videoOnlineHandler(e.id, e.displayName);
  });

  api.addEventListener("participantLeft", (e) => {
    // Don't delete from the database, only delete after we've removed the
    // offline participant from the sidebar and all its windows are closed
    videoOfflineHandler(e.id);
  });

  window.onbeforeunload = (e) => {
    // Ask for confirmation
    e.preventDefault();
    e.returnValue = "";
  };

  window.onunload = () => closeAllWindows;
};

// Expose API
window.jitsipop = jitsipop;
jitsipop.database = database;
jitsipop.mainWindow = window;
jitsipop.getFormattedDisplayName = getFormattedDisplayName;
jitsipop.getParticipantId = getParticipantId;
jitsipop.getParticipantVideo = getParticipantVideo;
jitsipop.receiveHighRes = receiveHighRes;
jitsipop.addIframe = addIframe;
jitsipop.removeIframe = removeIframe;
jitsipop.addWindow = addWindow;
jitsipop.removeWindow = removeWindow;

tryRuntimeSendMessage(
  {
    type: "mainWinLoad",
  },
  (response) => {
    options = response.options;
    setup();
  }
);
