// Declare jitsipop API object
const jitsipop = {
  api: null,
  multiviewWindow: null,
  multiviewLayout: "layout-fit",
};

const database = new Map([
  /* Data structure example
    [
      0,
      {
        videoId: 0, // unique, also used as key
        displayName: "jip",
        participantId: "asdfgh", // unique string
        sidebarVideoWrapper: "html element", // unique
        online: true,
        iframes: Set ["iframe window object"], // each iframe window object in the Set is unique
        windows: Set ["pop-out window object"], // each pop-out window object in the Set is unique
        order: int, // unique, used for sorting, starts at 1
        mappertjeState: {}, 
      },
    ],
    */
]);

// Try to import Mappertje
import(
  "chrome-extension://okokapnhegofpbaeogkmbcaflmgiopkg/modules/mapper/index.js"
)
  .then((module) => {
    jitsipop.mapper = module.default;
    document.documentElement.classList.add("mappertje");
  })
  .catch((e) => {
    console.log("Couldn't integrate with Mappertje.", e);
  });

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
var myDisplayName, myUserID;

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

const getMappertjeState = (videoId) => {
  const item = getItem(videoId);
  if (item) {
    return item.mappertjeState;
  }
};

const setMappertjeState = (videoId, state) => {
  const item = getItem(videoId);
  if (item) {
    item.mappertjeState = state;
  }
};

const getNumberOfWindows = () => {
  let popouts = 0;
  let mappertjes = 0;
  for (let item of database.values()) {
    if (item.windows) {
      for (let win of item.windows) {
        if (win.location.hash.indexOf("mappertje=false") > -1) {
          popouts++;
        } else {
          mappertjes++;
        }
      }
    }
  }
  return { popouts: popouts, mappertjes: mappertjes };
};

const getFormattedDisplayName = (participantId) => {
  const item = getItemByParticipantId(participantId);
  return formatDisplayName(item ? item.displayName : "");
};

const getItemByParticipantId = (participantId) => {
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

    // TODO: also remove this video from the multiview

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

const addOrDeleteVideo = (videoId, win, type, action) => {
  const failMessage = () => {
    console.trace(`Couldn't ${action} ${type} for videoId`, videoId, item);
  };

  var key;
  if (type === "window") {
    key = "windows";
  } else if (type === "iframe") {
    key = "iframes";
  } else {
    // Invalid type
    failMessage();
    return;
  }

  const item = getItem(videoId);
  if (!item) {
    failMessage();
    return;
  }

  if (action === "add") {
    item[key] && item[key].add(win);
  } else if (action === "delete") {
    item[key] && item[key].delete(win);
  } else {
    // Invalid action
    failMessage();
    return;
  }

  const videoInMultiview = multiviewSelection.has(videoId);
  const videoInPopout = item.windows && item.windows.size;

  const sidebarVideoWrapper = item.sidebarVideoWrapper;
  if (sidebarVideoWrapper) {
    if (videoInMultiview) {
      sidebarVideoWrapper.classList.add("multiview");
    } else {
      sidebarVideoWrapper.classList.remove("multiview");
    }

    if (videoInPopout) {
      sidebarVideoWrapper.classList.add("popout");
    } else {
      sidebarVideoWrapper.classList.remove("popout");
    }
  }

  const windowCount = getNumberOfWindows();

  document.querySelectorAll("#settings span.nr-of-popouts").forEach((span) => {
    span.innerHTML = windowCount.popouts;
  });

  document
    .querySelectorAll("#settings span.nr-of-mappertjes")
    .forEach((span) => {
      span.innerHTML = windowCount.mappertjes;
    });

  document
    .querySelectorAll("#settings button.depends-on-pop-outs")
    .forEach((button) => {
      button.disabled = !(windowCount.popouts > 0);
    });

  document
    .querySelectorAll("#settings button.depends-on-mappertjes")
    .forEach((button) => {
      button.disabled = !(windowCount.mappertjes > 0);
    });

  if (item.participantId) {
    if (!videoInMultiview && !videoInPopout) {
      // Video is no longer open in multiview or pop-out window,
      // stop receiving high resolution video
      receiveHighRes(item.participantId, false);
    } else {
      // Video is still in multiview or pop-out window,
      // receive high resolution video
      receiveHighRes(item.participantId, true);
    }
  }
};

const focusAllWindows = (filter) => {
  for (let item of database.values()) {
    if (item.windows) {
      for (let win of item.windows) {
        if (!win.closed) {
          if (filter) {
            if (
              filter === "pop-out" &&
              win.location.hash.indexOf("mappertje=false") === -1
            ) {
              continue;
            }
            if (
              filter === "mappertje" &&
              win.location.hash.indexOf("mappertje=false") > -1
            ) {
              continue;
            }
          }
          win.focus();
        }
      }
    }
  }
};

const closeAllWindows = (filter) => {
  for (let item of database.values()) {
    if (item.windows) {
      for (let win of item.windows) {
        if (!win.closed) {
          if (filter) {
            if (
              filter === "pop-out" &&
              win.location.hash.indexOf("mappertje=false") === -1
            ) {
              continue;
            }
            if (
              filter === "mappertje" &&
              win.location.hash.indexOf("mappertje=false") > -1
            ) {
              continue;
            }
          }
          win.close();
        }
      }
    }
  }
};

const unloadHandler = () => {
  if (api) {
    api.dispose();
  }

  if (jitsipop.multiviewWindow && !jitsipop.multiviewWindow.closed) {
    jitsipop.multiviewWindow.close();
  }

  closeAllWindows();
};

const windowAlreadyOpen = (newWin) => {
  for (let item of database.values()) {
    if (item.windows && item.windows.has(newWin)) {
      return true;
    }
  }
};

const getItemOrder = (videoId) => {
  const item = getItem(videoId);
  if (item) {
    return item.order;
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

const getVideoDocUrl = (videoId, enableMappertje) => {
  return `about:blank#/extId=${extId}/id=${videoId}/mappertje=${
    enableMappertje === true
  }`;
};

const getVideoDocUrlForIframe = (videoId) => {
  return `javascript:this.location.href="${getVideoDocUrl(videoId)})";`;
};

const getMultiviewDocUrl = () => {
  return `about:blank#/extId=${extId}/multiview=1/`;
};

const changeWindowOffset = () => {
  xOffset += popupWidth;
  if (xOffset + popupWidth > screen.availWidth) {
    xOffset = screen.availLeft;
    yOffset += popupHeight;
  }
  if (yOffset + popupHeight > screen.availHeight) {
    xOffset = screen.availLeft;
    yOffset = screen.availTop;
  }
};

const popOutVideo = (videoId, enableMappertje) => {
  if (enableMappertje) {
    var width = screen.availWidth;
    var height = screen.availHeight;
    var left = screen.availLeft;
    var top = screen.availTop;
  } else {
    var width = popupWidth;
    var height = popupHeight;
    var left = screen.availLeft + xOffset;
    var top = screen.availTop + yOffset;
  }

  const win = window.open(
    getVideoDocUrl(videoId, enableMappertje),
    videoId + (enableMappertje ? "mappertje" : ""),
    `status=no,menubar=no,width=${width},height=${height},left=${left},top=${top}`
  );

  // We made a new pop-out window
  if (!windowAlreadyOpen(win) && !enableMappertje) {
    changeWindowOffset();
  }
};

const updateDependsOnMultiview = (e) => {
  document
    .querySelectorAll("#settings button.depends-on-multiview")
    .forEach((button) => {
      button.disabled =
        !jitsipop.multiviewWindow ||
        jitsipop.multiviewWindow.closed ||
        (e && e.type === "unload");
    });
};

const makeMultiviewWindow = () => {
  // Don't focus on the multiviewWindow if already open
  if (!jitsipop.multiviewWindow || jitsipop.multiviewWindow.closed) {
    jitsipop.multiviewWindow = window.open(
      getMultiviewDocUrl(),
      "multiview",
      `status=no,menubar=no,width=${popupWidth},height=${popupHeight},left=${
        screen.availLeft + xOffset
      },top=${screen.availTop + yOffset}`
    );
    jitsipop.multiviewWindow.addEventListener(
      "unload",
      updateDependsOnMultiview
    );
    changeWindowOffset();
    updateDependsOnMultiview();
  }
};

const showMultiview = () => {
  if (jitsipop.multiviewWindow && !jitsipop.multiviewWindow.closed) {
    jitsipop.multiviewWindow.focus();
  } else {
    makeMultiviewWindow();
  }
};

const toggleInMultiview = (videoId) => {
  makeMultiviewWindow();
  // Toggle multiview selection
  if (multiviewSelection.has(videoId)) {
    multiviewSelection.delete(videoId);
  } else {
    multiviewSelection.add(videoId);
  }

  updateMultiviewWindow();
};

const addAllInMultiview = () => {
  for (let videoId of database.keys()) {
    multiviewSelection.add(videoId);
  }
  updateMultiviewWindow();
};

const removeAllFromMultiview = () => {
  multiviewSelection.clear();
  updateMultiviewWindow();
};

const sidebarVideoWrappersOrder = (a, b) => {
  return a.order - b.order;
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

const updateMultiviewWindow = () => {
  if (
    jitsipop.multiviewWindow &&
    jitsipop.multiviewWindow.update &&
    !jitsipop.multiviewWindow.closed
  ) {
    jitsipop.multiviewWindow.update();
  }
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
          if (item.order > 1) {
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
          if (item.order < database.size) {
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

const applyNewOrder = (videoId, newOrder) => {
  const item = getItem(videoId);
  if (!item) {
    return;
  }

  if (newOrder < 1 || newOrder > database.size) {
    return;
  }

  const currentOrder = item.order;
  if (currentOrder === newOrder) {
    return;
  }

  if (newOrder > currentOrder) {
    for (let item of database.values()) {
      if (item.order > currentOrder && item.order <= newOrder) {
        item.order--;
        if (item.sidebarVideoWrapper) {
          item.sidebarVideoWrapper.style.order = item.order;
        }
      }
    }
  } else {
    for (let item of database.values()) {
      if (item.order >= newOrder && item.order < currentOrder) {
        item.order++;
        if (item.sidebarVideoWrapper) {
          item.sidebarVideoWrapper.style.order = item.order;
        }
      }
    }
  }

  item.order = newOrder;
  if (item.sidebarVideoWrapper) {
    item.sidebarVideoWrapper.style.order = item.order;
  }
};

const displayNameWarning = (id, displayName) => {
  var message;
  if (!displayName) {
    message = "Please choose a name that nobody is using in this room.";
  } else if (
    displayName === options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME
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
  var sidebarVideoWrapper;
  var videoId;
  var didReuseWrapper = false;

  const setVideoIdAndWrapper = (participantId) => {
    const item = getItemByParticipantId(participantId);
    if (item && item.sidebarVideoWrapper) {
      sidebarVideoWrapper = item.sidebarVideoWrapper;
      videoId = item.videoId;
      didReuseWrapper = true;
    }
  };

  // When a user re-connects with the same participantId,
  // we can just reuse it's wrapper and update the database.
  // This will be the case when the local user reconnects after e.g. a dropped connection,
  // because we already swapped the participantId from old to new on videoConferenceJoined.
  setVideoIdAndWrapper(participantId);

  // Check if we can reuse an empty wrapper for same displayName
  if (!sidebarVideoWrapper) {
    const offlineEntries = getEntriesByName(displayName, "offline");
    if (offlineEntries.length) {
      offlineEntries.sort(sidebarVideoWrappersOrder);

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
    sidebarVideoWrapper.innerHTML =
      '<i class="far fa-window-restore"></i><i class="fas fa-th-large"></i>';
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
    newData.order = database.size + 1;
    sidebarVideoWrapper.style.order = newData.order;
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

const suspendOrKickedHandler = () => {
  document.documentElement.classList.add("disconnected");
  videoOfflineHandler(myUserID);

  // Make status icon show orange
  tryRuntimeSendMessage({
    type: "videoConferenceConnecting",
  });
};

const moveSelectedWrapper = (destination) => {
  const item = getItem(selectedVideoId);
  if (!item) {
    return;
  }

  if (destination === "move-top") {
    applyNewOrder(selectedVideoId, 1);
  } else if (destination === "move-up") {
    applyNewOrder(selectedVideoId, item.order - 1);
  } else if (destination === "move-down") {
    applyNewOrder(selectedVideoId, item.order + 1);
  } else if (destination === "move-bottom") {
    applyNewOrder(selectedVideoId, database.size);
  }

  updateContextbar();
  updateMultiviewWindow();
};

const setupContextbar = () => {
  const contextbar = document.querySelector("#contextbar");

  contextbar.querySelector(".pop-out-button").addEventListener("click", (e) => {
    e.preventDefault();
    popOutVideo(selectedVideoId);
  });

  contextbar
    .querySelector(".mappertje-button")
    .addEventListener("click", (e) => {
      e.preventDefault();
      popOutVideo(selectedVideoId, true);
    });

  contextbar
    .querySelector(".multiview-button")
    .addEventListener("click", (e) => {
      e.preventDefault();
      toggleInMultiview(selectedVideoId);
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

const connect = () => {
  document.documentElement.classList.remove("disconnected");

  if (api) {
    const iframe = api.getIFrame();
    iframe && iframe.remove();
  }
  api = new JitsiMeetExternalAPI(window.location.hostname, options);
  jitsipop.api = api;

  document.getElementById(
    "invite-link"
  ).value = `https://jitsipop.tk/#/${window.location.hostname}/${options.roomName}`;

  api.executeCommand("subject", " ");

  // Hide filmStrip once on startup
  api.once("filmstripDisplayChanged", (e) => {
    if (e.enabled) {
      api.executeCommand("toggleFilmStrip");
    }
  });

  api.addEventListener("suspendDetected", suspendOrKickedHandler);

  api.addEventListener("participantKickedOut", (e) => {
    if (e.kicked.local) {
      suspendOrKickedHandler();
    }
  });

  api.addEventListener("videoConferenceLeft", () => {
    document.documentElement.classList.add("disconnected");
    videoOfflineHandler(myUserID);

    tryRuntimeSendMessage({
      type: "videoConferenceLeft",
    });

    // Don't close window here, window will be gone when connection drops etc.
    // window.close();
  });

  api.addEventListener("videoConferenceJoined", (e) => {
    // When clicking the 'rejoin' button (not from this extension, but part of Jitsi Meet)
    // after a suspend, the connect() function isn't called again, so remove class here too.
    document.documentElement.classList.remove("disconnected");

    const newUserID = e.id;
    const newDisplayName = e.displayName;

    if (myUserID) {
      const item = getItemByParticipantId(myUserID);
      if (item) {
        // Swap new participantId of local user,
        // e.g. when we reconnect after dropped internet connection
        item.participantId = newUserID;
      }
    }

    myDisplayName = newDisplayName;
    myUserID = newUserID;

    tryRuntimeSendMessage({
      type: "videoConferenceJoined",
    });

    videoOnlineHandler(newUserID, myDisplayName);

    // TODO: wait a little, then ask everyone if one of them is moderator.
    // If no moderator yet, start moderating and check display name of each participant.
    // From then on also directly handle name change and join events.

    api.executeCommands({
      toggleFilmStrip: [],
    });
  });

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
    if (participantId === myUserID) {
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

    if (item && item.videoId === selectedVideoId) {
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
};

const setup = () => {
  // Unhide body now that all resources are loaded, to prevent unstyled content flash
  document.body.style.display = "";

  document.getElementById("focus-multiview").onclick = showMultiview;
  // TODO: disable addAllInMultiview and removeAllFromMultiview when multiview is closed,
  // or when either of the two won't have any effect (already all removed or added)
  document.getElementById("add-all-multiview").onclick = addAllInMultiview;
  document.getElementById(
    "remove-all-multiview"
  ).onclick = removeAllFromMultiview;

  document.getElementById("close-all-pop-outs").onclick = () =>
    closeAllWindows("pop-out");
  document.getElementById("close-all-mappertjes").onclick = () =>
    closeAllWindows("mappertje");
  document.getElementById("focus-pop-outs").onclick = () =>
    focusAllWindows("pop-out");
  document.getElementById("focus-mappertjes").onclick = () =>
    focusAllWindows("mappertje");

  document.getElementById("copy-invite-link-button").onclick = (e) => {
    e.preventDefault();
    const copyText = document.getElementById("invite-link");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    document.execCommand("copy");
  };

  let radios = document.getElementsByName("multiviewLayout");

  for (let radio of radios) {
    radio.addEventListener("change", () => {
      const layout = radio.id;
      if (jitsipop.multiviewLayout !== layout) {
        jitsipop.multiviewLayout = layout;
        // Apply in multiview
        jitsipop.multiviewWindow &&
          !jitsipop.multiviewWindow.closed &&
          jitsipop.multiviewWindow.reflow &&
          jitsipop.multiviewWindow.reflow();
      }
    });
  }

  // TODO: setup menubar, for sound settings etc.
  // TODO: dynamically set max-height for #settings-bar based on content height of selected setting
  const settingsButtons = document.querySelectorAll("#tabs button");
  var selectedSetting, selectedSettingsContent;
  settingsButtons.forEach((button) => {
    const settingsContent = document.querySelector(`#settings .${button.id}`);
    button.onclick = (e) => {
      if (selectedSetting === button) {
        selectedSetting.classList.remove("active");
        selectedSetting = null;
        document.documentElement.classList.remove("settings-open");
      } else {
        selectedSetting && selectedSetting.classList.remove("active");
        selectedSetting = button;
        selectedSetting.classList.add("active");
        document.documentElement.classList.add("settings-open");
      }

      selectedSettingsContent &&
        selectedSettingsContent.classList.remove("active");
      settingsContent && settingsContent.classList.add("active");
      selectedSettingsContent = settingsContent;
    };
  });
  // APP.conference._room.muteParticipant(participantId)

  setupContextbar();

  const urlParams = new URLSearchParams(
    "?" + location.hash.substring(2).replace(/\//g, "&")
  );
  options.parentNode = document.querySelector("#meet");
  options.roomName = urlParams.get("roomName");

  document.getElementById("reconnect").onclick = (e) => {
    e.preventDefault();
    connect();
  };

  connect();

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
  window.addEventListener("unload", unloadHandler);
};

// Expose API
window.jitsipop = jitsipop;
jitsipop.database = database;
jitsipop.mainWindow = window;
jitsipop.multiviewSelection = multiviewSelection;
jitsipop.getFormattedDisplayName = getFormattedDisplayName;
jitsipop.getParticipantId = getParticipantId;
jitsipop.getParticipantVideo = getParticipantVideo;
jitsipop.addOrDeleteVideo = addOrDeleteVideo;
jitsipop.getVideoDocUrlForIframe = getVideoDocUrlForIframe;
jitsipop.getItemOrder = getItemOrder;
jitsipop.getMappertjeState = getMappertjeState;
jitsipop.setMappertjeState = setMappertjeState;

tryRuntimeSendMessage(
  {
    type: "mainWinLoad",
  },
  (response) => {
    options = response.options;
    setup();
  }
);
