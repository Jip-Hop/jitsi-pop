// Assign jitsipop also to this window object, so iframes can access it
const jitsipop = (window.jitsipop = window.opener.jitsipop);
const mainWindow = jitsipop.mainWindow;
var currentSelection = new Set();

const parentPoller = () => {
  if (!opener || opener.closed) {
    window.close();
  }
};

const reflow = () => {
  const width = window.innerWidth / currentSelection.size;
  const height = (width * 9) / 16;
  document.querySelectorAll("iframe").forEach((targetFrame) => {
    targetFrame.style.width = width;
    targetFrame.style.height = height;
  });
};

const update = () => {
  const newSet = jitsipop.multiviewSelection;

  newSet.forEach((videoId) => {
    var targetFrame;
    if (!currentSelection.has(videoId)) {
      targetFrame = document.createElement("iframe");
      targetFrame.id = "video" + videoId;
      targetFrame.src = jitsipop.getVideoDocUrlForIframe(videoId);
      document.body.appendChild(targetFrame);
    } else {
      targetFrame = document.getElementById("video" + videoId);
    }
    targetFrame.style.order = jitsipop.getItemOrder(videoId);
  });

  currentSelection.forEach((videoId) => {
    if (!newSet.has(videoId)) {
      const targetFrame = document.getElementById("video" + videoId);
      if (targetFrame) {
        targetFrame.remove();
      }
    }
  });

  currentSelection = new Set(newSet);
  reflow();
};

const setup = () => {
  // Allow calling these objects from mainWindow
  window.update = update;

  window.onunload = () => {
    // Remove this window from the array of open pop-outs in the main window
    if (mainWindow && !mainWindow.closed) {
      // jitsipop.multiviewClosedHandler();
      jitsipop.multiviewWindow = null;
    }

    // TODO: needs a counter somewhere, because if it's open in multiview (not implemented yet),
    // and open in a pop-out window, it needs to still receive high res if only one of them is closed
    // jitsipop.receiveHighRes(participantId, false);
  };

  setInterval(parentPoller, 1000);

  if (mainWindow && !mainWindow.closed) {
    // jitsipop.windows.push(window);
    jitsipop.multiviewWindow = window;
  }

  window.addEventListener("resize", reflow);

  update();

  // tryRuntimeSendMessage({
  //   type: "multiviewWinLoad",
  // });

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
};

setup();
