// Declare jitsipop API object
const jitsipop = {};
const windows = [];

const database = new Map([
  /*
    [
      0,
      {
        videoId: 0, // unique, also used as key
        displayName: "jip",
        participantId: "asdfgh", // unique
        sidebarVideoWrapper: "html element", // unique
        online: true,
        iframes: ["iframe window object"], // each iframe window object in the array is unique
        windows: ["pop-out window object"], // each pop-out window object in the array is unique
      },
    ],
    */
]);

console.log(
  "ENTRIES",
  database,
  database.values(),
  Array.from(database.values())
);
window.database = database;

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
// const participantIdToSidebarVideoWrapper = new Map();
// const displayNameToEmptyWrappers = new Map();
// const participantIdToDisplayName = new Map();
// const videoIdToParticipantId = new Map();

const getParticipantVideo = (participantId) => {
  if (api && api._getParticipantVideo) {
    return api._getParticipantVideo(participantId);
  }
};

const formatDisplayName = (displayName) => {
  return displayName && displayName !== ""
    ? displayName
    : options.interfaceConfigOverwrite.DEFAULT_REMOTE_DISPLAY_NAME;
};

const getEntryByParticipantId = (participantId, status) => {
  for (let entry of database.values()) {
    // if (
    //   (status && status === "online" && !entry.online) ||
    //   (status === "offline" && entry.online)
    // ) {
    //   // Skip if not matches requested status
    //   continue;
    // }
    console.log("ENTRY", entry, new Map(database));
    if (entry.participantId === participantId) {
      return entry;
    }
  }

  console.trace(
    "Entry not found for participantId",
    participantId,
    new Map(database)
  );
};

const getFormattedDisplayName = (participantId) => {
  const entry = getEntryByParticipantId(participantId);
  return formatDisplayName(entry ? entry.displayName : "");
};

const getSidebarVideoWrapperByParticipantId = (participantId) => {
  const entry = getEntryByParticipantId(participantId);
  console.log("ENTRY for getSidebarVideoWrapperByParticipantId", entry);
  if (entry && entry.sidebarVideoWrapper) {
    return entry.sidebarVideoWrapper;
  } else {
    console.trace(
      "sidebarVideoWrapper not found for participantId",
      participantId,
      new Map(database)
    );
  }
};

const getParticipantId = (videoId) => {
  const databaseEntry = database.get(videoId);
  if (databaseEntry) {
    return databaseEntry.participantId;
  } else {
    console.trace("Entry not found for videoId", videoId, new Map(database));
  }

  // return videoIdToParticipantId.get(videoId);
};

// const getByValue = (map, searchValue) => {
//   for (let [key, value] of map) {
//     if (value === searchValue) return key;
//   }
// };

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
  console.log("TEST", participant);
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

  // TODO: don't directly call set, make a function to do it and notify via bc channel
  // participantIdToDisplayName.set(participantId, displayName);

  // Search for existing wrapper which matches participantId
  // var sidebarVideoWrapper = sidebar.querySelector(`.video-wrapper[data-participantId="${participantId}"]`);
  // var sidebarVideoWrapper = participantIdToSidebarVideoWrapper.get(participantId);
  var sidebarVideoWrapper = getSidebarVideoWrapperByParticipantId(participantId);
  var videoId;

  // Check if we can reuse an empty wrapper for same username
  if (!sidebarVideoWrapper) {
    // const emptyWrappers = displayNameToEmptyWrappers.get(displayName);
    const offlineEntries = getEntriesByName(displayName, "offline");
    if (offlineEntries.length) {
      // Get emptyWrappers in DOM order
      // const sortedEmptyWrappers = Array.from(
      //   sidebar.querySelectorAll(".video-wrapper")
      // ).filter((element) => {
      //   return emptyWrappers.indexOf(element) !== -1;
      // });

      offlineEntries.sort(sidebarVideoWrappersDomOrder);

      // Get first empty wrapper
      // sidebarVideoWrapper = sortedEmptyWrappers.shift();
      const firstOfflineEntry = offlineEntries.shift();
      sidebarVideoWrapper = firstOfflineEntry.sidebarVideoWrapper;
      if (sidebarVideoWrapper) {
        // Also remove from the array in our map

        // const index = emptyWrappers.indexOf(sidebarVideoWrapper);
        // if (index !== -1) {
        //   emptyWrappers.splice(index, 1);
        // }

        // We're reusing a wrapper with a new participantId,
        // update the map

        // const oldId = getByValue(
        //   participantIdToSidebarVideoWrapper,
        //   sidebarVideoWrapper
        // );

        const oldParticipantId = firstOfflineEntry.participantId;
        videoId = firstOfflineEntry.videoId;

        // videoId = getByValue(videoIdToParticipantId, oldId);
        // videoIdToParticipantId.set(videoId, participantId);
        // participantIdToDisplayName.delete(oldId);
        // participantIdToSidebarVideoWrapper.delete(oldId);
        // Update all windows and iframes
        bc.postMessage({
          participantIdReplace: {
            oldId: oldParticipantId,
            newId: participantId,
          },
        });
      }
    }
  }

  // Make new video wrapper
  if (!sidebarVideoWrapper) {
    sidebarVideoWrapper = document.createElement("div");
    sidebarVideoWrapper.classList.add("video-wrapper");
    videoId = videoIdCounter++;
    // videoIdToParticipantId.set(videoId, participantId);
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

    // Init all other values for database entry here
    newData.iframes = [];
    newData.windows = [];
  }

  newData.videoId = videoId;
  newData.sidebarVideoWrapper = sidebarVideoWrapper;

  if (database.has(videoId)) {
    const oldData = database.get(videoId);
    // Merge in the new data
    database.set(videoId, { ...oldData, ...newData });
  } else {
    database.set(videoId, newData);
  }

  // participantIdToSidebarVideoWrapper.set(participantId, sidebarVideoWrapper);
  sidebarVideoWrapper.setAttribute("data-displayname", formatDisplayName(displayName));
};

const videoOfflineHandler = (participantId) => {
  if (!participantId) {
    return;
  }

  // const sidebarVideoWrapper = participantIdToSidebarVideoWrapper.get(participantId);
  const entry = getEntryByParticipantId(participantId);

  if (!entry) {
    return;
  }

  entry.online = false;

  // const sidebarVideoWrapper = entry.sidebarVideoWrapper;

  // if (!sidebarVideoWrapper) {
  //   return;
  // }

  // const targetFrame = sidebarVideoWrapper.querySelector("iframe");
  // if (!targetFrame) {
  //   return;
  // }
  // targetFrame.remove();
  // const displayName = participantIdToDisplayName.get(participantId);
  // if (!displayNameToEmptyWrappers.has(displayName)) {
  //   displayNameToEmptyWrappers.set(displayName, [sidebarVideoWrapper]);
  // } else {
  //   displayNameToEmptyWrappers.get(displayName).push(sidebarVideoWrapper);
  // }
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
    // participantIdToDisplayName.set(e.id, e.displayname);
    const entry = getEntryByParticipantId(e.id);
    if (entry) {
      entry.displayName = e.displayname;
    }
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
    const sidebarVideoWrapper = getSidebarVideoWrapperByParticipantId(e.id);
    // const sidebarVideoWrapper = participantIdToSidebarVideoWrapper.get(e.id);
    console.log("NAME CHANGE", sidebarVideoWrapper, new Map(database));
    if (sidebarVideoWrapper) {
      sidebarVideoWrapper.setAttribute(
        "data-displayname",
        formatDisplayName(e.displayname)
      );
    }
  });

  api.addEventListener("participantJoined", (e) => {
    displayNameWarning(e.id, e.displayName);
    videoOnlineHandler(e.id, e.displayName);
  });

  api.addEventListener("participantLeft", (e) => {
    // Don't delete from map, only delete after we've removed the
    // offline participant from the sidebar and all its windows are closed
    // participantIdToDisplayName.delete(e.id);
    videoOfflineHandler(e.id);
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

// Expose API
window.jitsipop = jitsipop;
jitsipop.mainWindow = window;
jitsipop.windows = windows;
jitsipop.getFormattedDisplayName = getFormattedDisplayName;
jitsipop.getParticipantId = getParticipantId;
jitsipop.getParticipantVideo = getParticipantVideo;

tryRuntimeSendMessage(
  {
    type: "mainWinLoad",
  },
  (response) => {
    options = response.options;
    setup();
  }
);
