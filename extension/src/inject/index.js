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
var selectedVideoId = null;
const multiviewSelection = new Set();

const toolbarHeight = window.outerHeight - window.innerHeight;
const popupWidth = 480;
const popupHeight = 270 + toolbarHeight;
var xOffset = 0,
  yOffset = 0;

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

const formatDisplayName = (displayName) => {
  return displayName && displayName !== ""
    ? displayName
    : options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME;
};

const getParticipantVideo = (participantId) => {
  if (api && api._getParticipantVideo) {
    return api._getParticipantVideo(participantId);
  }
};

const getItem = (videoId) => {
  return database.get(videoId);
};

const getFormattedDisplayName = (participantId) => {
  const item = getItemByParticipantId(participantId);
  return formatDisplayName(item ? item.displayName : "");
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

const removeOfflineItem = (videoId) => {
  const item = getItem(videoId);
  if (item && !item.online) {
    if (item.windows) {
      for (let win of item.windows) {
        win.close();
      }
    }

    if (item.sidebarVideoWrapper) {
      item.sidebarVideoWrapper.remove();
    }

    database.delete(videoId);

    // TODO: select the video above the one we just removed,
    // and keep context bar open.
    // Or close if there are no video's left.

    if (videoId === selectedVideoId) {
      selectedVideoId = null;
    }

    closeContextbar();
  }
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

const getVideoDocUrlForIframe = (videoId) => {
  return `javascript:this.location.href="${getVideoDocUrl(videoId)})";`;
};

const getMultiviewDocUrl = () => {
  return `about:blank#/extId=${extId}/multiview=1/`;
};

const changeWindowOffset = () => {
  xOffset += popupWidth;
  if (xOffset + popupWidth > screen.width) {
    xOffset = 0;
    yOffset += popupHeight;
  }
  if (yOffset + popupHeight > screen.height) {
    xOffset = 0;
    yOffset = 0;
  }
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
    changeWindowOffset();
  }
};

const makeMultiviewWindow = (videoId) => {
  // Don't focus on the multiviewWindow if already open
  if (!jitsipop.multiviewWindow || jitsipop.multiviewWindow.closed) {
    jitsipop.multiviewWindow = window.open(
      getMultiviewDocUrl(),
      "multiview",
      `status=no,menubar=no,width=${popupWidth},height=${popupHeight},left=${
        screen.left + xOffset
      },top=${screen.top + yOffset}`
    );
    changeWindowOffset();
  }

  if (multiviewSelection.has(videoId)) {
    multiviewSelection.delete(videoId);
  } else {
    multiviewSelection.add(videoId);
  }

  if (jitsipop.multiviewWindow.update) {
    jitsipop.multiviewWindow.update();
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

const updateContextbar = () => {
  const item = getItem(selectedVideoId);

  const contextbar = document.querySelector("#contextbar");
  contextbar.querySelector("h4").innerText = formatDisplayName(
    item.displayName
  );

  if (database.size > 1) {
    if (item.sidebarVideoWrapper) {
      contextbar
        .querySelectorAll(
          "[data-destination='move-top'], [data-destination='move-up']"
        )
        .forEach((button) => {
          if (item.sidebarVideoWrapper.previousElementSibling) {
            button.disabled = false;
          } else {
            button.disabled = true;
          }
        });

      contextbar
        .querySelectorAll(
          "[data-destination='move-bottom'], [data-destination='move-down']"
        )
        .forEach((button) => {
          if (item.sidebarVideoWrapper.nextElementSibling) {
            button.disabled = false;
          } else {
            button.disabled = true;
          }
        });
    }
  } else {
    contextbar.querySelectorAll(".move-button").forEach((button) => {
      button.disabled = true;
    });
  }

  const deleteButton = contextbar.querySelector(".delete-video");
  deleteButton.disabled = item.online;
};

const openContextbar = () => {
  document.documentElement.classList.add("show-context");
};

const closeContextbar = () => {
  document.documentElement.classList.remove("show-context");
};

const selectVideoInSidebar = (videoId, sidebarVideoWrapper) => {
  if (selectedVideoId === videoId) {
    // Deselect and close context bar
    sidebarVideoWrapper.classList.remove("selected");
    closeContextbar();
    selectedVideoId = null;
  } else {
    selectedVideoId = videoId;
    updateContextbar();
    const sidebar = document.querySelector("#sidebar");
    const previousSelected = sidebar.querySelector(".selected");
    if (previousSelected) {
      previousSelected.classList.remove("selected");
    } else {
      openContextbar();
    }
    sidebarVideoWrapper.classList.add("selected");
  }
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

  // TODO: there may be a bug after conference re-join (e.g. connection lost)
  // when reusing wrappers if the local participant has the same displayName
  // as some of the other participants... It will occupy more than 1 wrapper.

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
      selectVideoInSidebar(videoId, sidebarVideoWrapper);
    });

    const targetFrame = document.createElement("iframe");
    // Setting the src to a url with about:blank + hash doesn't trigger a load
    // when the iframe is (re)attached to the DOM,
    // but this javascript does evaluate each time and sets proper href,
    // so the inject.js content script will run.
    targetFrame.src = getVideoDocUrlForIframe(videoId);
    sidebarVideoWrapper.appendChild(targetFrame);

    const sidebar = document.querySelector("#sidebar");
    sidebar.appendChild(sidebarVideoWrapper);

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
  sidebarVideoWrapper.classList.remove("offline");

  if (selectedVideoId !== null) {
    updateContextbar();
  }
};

const videoOfflineHandler = (participantId) => {
  if (!participantId) {
    return;
  }

  const item = getItemByParticipantId(participantId);

  if (!item) {
    return;
  }

  if (item.sidebarVideoWrapper) {
    item.sidebarVideoWrapper.classList.add("offline");
  }
  item.online = false;
};

const moveSelectedWrapper = (destination) => {
  const item = getItem(selectedVideoId);
  if (!item) {
    return;
  }
  const element = item.sidebarVideoWrapper;
  if (!element) {
    return;
  }

  const parentNode = element.parentNode;

  if (destination === "move-top") {
    parentNode.prepend(element);
  } else if (destination === "move-up") {
    if (element.previousElementSibling) {
      parentNode.insertBefore(element, element.previousElementSibling);
    }
  } else if (destination === "move-down") {
    if (element.nextElementSibling) {
      parentNode.insertBefore(element.nextElementSibling, element);
    }
  } else if (destination === "move-bottom") {
    parentNode.appendChild(element);
  }

  updateContextbar();
};

const setupContextbar = () => {
  const contextbar = document.querySelector("#contextbar");

  contextbar.querySelector(".pop-out-button").addEventListener("click", (e) => {
    e.preventDefault();
    popOutVideo(selectedVideoId);
  });

  contextbar
    .querySelector(".multiview-button")
    .addEventListener("click", (e) => {
      e.preventDefault();
      makeMultiviewWindow(selectedVideoId);
    });

  contextbar.querySelectorAll(".move-button").forEach((element) => {
    element.addEventListener("click", (e) => {
      e.preventDefault();
      moveSelectedWrapper(e.target.dataset.destination);
    });
  });

  contextbar.querySelector(".delete-video").addEventListener("click", (e) => {
    e.preventDefault();
    removeOfflineItem(selectedVideoId);
  });
};

const setup = () => {
  setupContextbar();

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

    if (item.videoId === selectedVideoId) {
      updateContextbar();
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

    if (selectedVideoId !== null) {
      updateContextbar();
    }
  });

  window.onbeforeunload = (e) => {
    // Ask for confirmation
    e.preventDefault();
    e.returnValue = "";
  };

  // TODO: maybe nice to keep the pop-out windows open on reload,
  // but then the database and other state in here is reset...
  // So would have to somehow have the pop-out reconnect.
  // But we don't want the pop-outs to stay open when this window
  // actually closes.
  window.addEventListener("unload", closeAllWindows);
};

// Expose API
window.jitsipop = jitsipop;
jitsipop.database = database;
jitsipop.mainWindow = window;
jitsipop.multiviewSelection = multiviewSelection;
jitsipop.getFormattedDisplayName = getFormattedDisplayName;
jitsipop.getParticipantId = getParticipantId;
jitsipop.getParticipantVideo = getParticipantVideo;
jitsipop.receiveHighRes = receiveHighRes;
jitsipop.addIframe = addIframe;
jitsipop.removeIframe = removeIframe;
jitsipop.addWindow = addWindow;
jitsipop.removeWindow = removeWindow;
jitsipop.getVideoDocUrlForIframe = getVideoDocUrlForIframe;

tryRuntimeSendMessage(
  {
    type: "mainWinLoad",
  },
  (response) => {
    options = response.options;
    setup();
  }
);
