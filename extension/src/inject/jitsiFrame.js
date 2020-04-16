// This script runs in page context, not as content script.
// Be careful with the scope and API here,
// use try catch

// Override some styles, these selectors may stop working in the future...
// Fortunately these styles aren't mission critical
const style = document.createElement("style");
document.head.appendChild(style);
style.sheet.insertRule(
  "body, .tOoji, #largeVideoContainer, .tile-view #largeVideoContainer {background: transparent !important; background-color: transparent !important;}"
);

window.addEventListener("load", (event) => {
  // Fade in this frame
  const frameElement = window.frameElement;
  frameElement && (frameElement.style.opacity = 1);

  var selectedParticipants = new Set();
  const bc = new BroadcastChannel("popout_jitsi_channel");
  // TODO: maxVideoHeightToReceive could be based on the resolution
  // values defined in jitsiConfig.js (listen for a message on the
  // BroadcastChannel)
  const maxVideoHeightToReceive = 1080;

  // Check if 2 sets contain the same values
  const eqSet = (as, bs) => {
    if (as.size !== bs.size) return false;
    for (var a of as) if (!bs.has(a)) return false;
    return true;
  };

  const generateUnusedKey = (suggestedKey, object) => {
    var i = 0;
    while (suggestedKey in object) {
      suggestedKey += i;
      i++;
    }
    return suggestedKey;
  };

  const getIdsToApply = () => {
    // Make a new set without reference
    const idsToApply = new Set(selectedParticipants);
    try {
      // Always select the large video
      const largeVideo = APP.UI.getLargeVideo();
      if (largeVideo && largeVideo.id) {
        // Add anyway, set won't have duplicates
        idsToApply.add(largeVideo.id);
      }
    } catch (e) {
      console.error(e);
    }

    return idsToApply;
  };

  const patchMethods = () => {
    const originalsetReceiverVideoConstraintKey = generateUnusedKey(
      "setReceiverVideoConstraint",
      APP.conference._room
    );
    const originalSelectParticipantsKey = generateUnusedKey(
      "selectParticipants",
      APP.conference._room
    );
    // Back up original methods in the same object
    APP.conference._room[originalsetReceiverVideoConstraintKey] =
      APP.conference._room.setReceiverVideoConstraint;
    APP.conference._room[originalSelectParticipantsKey] =
      APP.conference._room.selectParticipants;

    APP.conference._room.setReceiverVideoConstraint = () => {
      APP.conference._room[originalsetReceiverVideoConstraintKey](
        maxVideoHeightToReceive
      );
    };
    APP.conference._room.selectParticipants = () => {
      APP.conference._room[originalSelectParticipantsKey](
        Array.from(getIdsToApply())
      );
    };
  };

  const applySelectedParticipants = () => {
    try {
      const idsToApply = getIdsToApply();

      // Sets the maximum video size the local participant should
      // receive from selected remote participants.
      // To override the constraint made by the tile view.
      // https://jitsi.org/news/new-feature-brady-bunch-style-layout/
      // But only send if the values have changed.

      if (
        APP.conference._room.rtc._maxFrameHeight !== maxVideoHeightToReceive
      ) {
        APP.conference._room.setReceiverVideoConstraint(
          maxVideoHeightToReceive
        );
      }

      if (
        !eqSet(idsToApply, new Set(APP.conference._room.rtc._selectedEndpoints))
      ) {
        APP.conference._room.selectParticipants(Array.from(idsToApply));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const onApiReady = () => {
    patchMethods();
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);

    bc.onmessage = (e) => {
      const data = e.data;
      if (data.select) {
        selectedParticipants.add(data.select);
        applySelectedParticipants();
      } else if (data.deselect) {
        selectedParticipants.delete(data.deselect);
        applySelectedParticipants();
      } else if (data.displayNameWarning) {
        try {
          APP.conference._room.sendPrivateTextMessage(
            data.displayNameWarning.id,
            data.displayNameWarning.message
          );
        } catch (e) {
          console.error(e);
        }
      }
    };

    // Also override by polling slowly, as backup
    setInterval(applySelectedParticipants, 5000);
  };

  addEventListener("unload", () => {
    bc.close();
  });

  (function readyPoller() {
    try {
      if (
        APP.conference._room.selectParticipants &&
        APP.conference._room.setReceiverVideoConstraint
      ) {
        onApiReady();
      }
    } catch (e) {
      console.log(e);
      setTimeout(readyPoller, 1000);
    }
  })();
});
