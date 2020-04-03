// This script runs in page context, not as content script.
// Be careful with the scope and API here,
// use try catch

(() => {
  var selectedParticipants = new Set();
  const bc = new BroadcastChannel("popout_jitsi_channel");
  // TODO: maxVideoHeightToReceive should be based on the resolution
  // values defined in jitsiConfig.js (listen for a message on the
  // BroadcastChannel)
  var maxVideoHeightToReceive = 1080;

  // Check if 2 sets contain the same values
  function eqSet(as, bs) {
    if (as.size !== bs.size) return false;
    for (var a of as) if (!bs.has(a)) return false;
    return true;
  }

  const applySelectedParticipants = () => {
    try {
      // Make a new set without reference
      const idsToApply = new Set(selectedParticipants);
      // Always select the large video
      const largeVideoParticipantId = APP.UI.getLargeVideo().id;
      // Add anyway, set won't have duplicates
      idsToApply.add(largeVideoParticipantId);

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
      console.log(e);
    }
  };

  addEventListener("unload", () => {
    bc.close();
  });

  bc.onmessage = e => {
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
        console.log(e);
      }
    }
  };

  // Poll quickly to override selection and resolution constraint
  setInterval(applySelectedParticipants, 100);

  // Override some styles, these selectors may stop working in the future...
  // Fortunately these styles aren't mission critical
  const style = document.createElement("style");
  document.head.appendChild(style);
  style.sheet.insertRule(
    "body, .tOoji, #largeVideoContainer, .tile-view #largeVideoContainer {background: transparent !important; background-color: transparent !important;}"
  );
})();
