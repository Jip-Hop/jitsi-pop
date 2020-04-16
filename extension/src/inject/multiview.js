// Assign jitsipop also to this window object, so iframes can access it
const jitsipop = (window.jitsipop = window.opener.jitsipop);
const mainWindow = jitsipop.mainWindow;
var currentSelection = new Set();
var resizeTimer;

// TODO: read these sizes from jitsiConfig.js, so they stay consistent
const iframeWidth = 1280;
const iframeHeight = 720;

const parentPoller = () => {
  if (!opener || opener.closed) {
    window.close();
  }
};

const reflow = () => {
  const iframes = Array.from(
    document.querySelectorAll("iframe:not(.remove)")
  ).sort((a, b) => {
    return a.dataset.order - b.dataset.order;
  });

  if (jitsipop.multiviewLayout === "layout-stack") {
    iframes.forEach((iframe) => {
      iframe.style.transform = `translate3d(-50%, -50%, 0) scale(1)`;
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.mixBlendMode = "screen";
    });

    return;
  }

  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();
  const result = fitToContainer(
    iframes.length,
    viewportWidth,
    viewportHeight,
    iframeWidth,
    iframeHeight
  );

  const gridWidth = result.ncols * result.itemWidth;
  const gridHeight = result.nrows * result.itemHeight;
  const xCenterCompensation = -gridWidth / 2;
  const yCenterCompensation = -gridHeight / 2;

  let r = 0,
    c = 0;

  iframes.forEach((iframe) => {

    iframe.style.width = iframeWidth + "px";
    iframe.style.height = iframeHeight + "px";
    iframe.style.mixBlendMode = "";

    iframe.style.transform = `translate3d(${
      c * result.itemWidth + xCenterCompensation
    }px, ${r * result.itemHeight + yCenterCompensation}px, 0) scale(${
      result.itemWidth / iframeWidth
    })`;

    c++;

    if (c >= result.ncols) {
      c = 0;
      r++;
    }
  });
};

const getViewportWidth = () => {
  return Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
};

const getViewportHeight = () => {
  return Math.max(
    document.documentElement.clientHeight,
    window.innerHeight || 0
  );
};

// https://math.stackexchange.com/q/466198
// https://stackoverflow.com/q/2476327
const fitToContainer = (
  n,
  containerWidth,
  containerHeight,
  itemWidth,
  itemHeight
) => {
  // We're not necessarily dealing with squares but rectangles (itemWidth x itemHeight),
  // temporarily compensate the containerWidth to handle as rectangles
  containerWidth = (containerWidth * itemHeight) / itemWidth;
  // Compute number of rows and columns, and cell size
  var ratio = containerWidth / containerHeight;
  var ncols_float = Math.sqrt(n * ratio);
  var nrows_float = n / ncols_float;

  // Find best option filling the whole height
  var nrows1 = Math.ceil(nrows_float);
  var ncols1 = Math.ceil(n / nrows1);
  while (nrows1 * ratio < ncols1) {
    nrows1++;
    ncols1 = Math.ceil(n / nrows1);
  }
  var cell_size1 = containerHeight / nrows1;

  // Find best option filling the whole width
  var ncols2 = Math.ceil(ncols_float);
  var nrows2 = Math.ceil(n / ncols2);
  while (ncols2 < nrows2 * ratio) {
    ncols2++;
    nrows2 = Math.ceil(n / ncols2);
  }
  var cell_size2 = containerWidth / ncols2;

  // Find the best values
  var nrows, ncols, cell_size;
  if (cell_size1 < cell_size2) {
    nrows = nrows2;
    ncols = ncols2;
    cell_size = cell_size2;
  } else {
    nrows = nrows1;
    ncols = ncols1;
    cell_size = cell_size1;
  }

  // Undo compensation on width, to make squares into desired ratio
  itemWidth = (cell_size * itemWidth) / itemHeight;
  itemHeight = cell_size;
  return {
    nrows: nrows || 1,
    ncols: ncols || 1,
    itemWidth: itemWidth || containerWidth,
    itemHeight: itemHeight || containerHeight,
  };
};

const transitionEndHandler = (e) => {
  if (e.propertyName === "opacity") {
    if (
      e.target.classList.contains("remove") &&
      window.getComputedStyle(e.target).opacity === "0"
    ) {
      e.target.remove();
    }
  }
};

const update = () => {
  const newSet = jitsipop.multiviewSelection;

  newSet.forEach((videoId) => {
    var targetFrame;
    if (!currentSelection.has(videoId)) {
      targetFrame = document.createElement("iframe");
      targetFrame.id = "video" + videoId;

      // Wait until video starts playing,
      // video.js will add class "firstplay" to the targetFrame
      // when the video starts playing for the first time.
      // We'll fade in the iframe when this class is added.

      targetFrame.src = jitsipop.getVideoDocUrlForIframe(videoId);
      targetFrame.style.width = iframeWidth + "px";
      targetFrame.style.height = iframeHeight + "px";
      // Prepend so it will appear from underneath all the other frames
      document.body.prepend(targetFrame);
    } else {
      targetFrame = document.getElementById("video" + videoId);
    }

    targetFrame.dataset.order = jitsipop.getItemOrder(videoId);
  });

  currentSelection.forEach((videoId) => {
    if (!newSet.has(videoId)) {
      const targetFrame = document.getElementById("video" + videoId);
      if (targetFrame) {
        targetFrame.removeAttribute("id");
        if (window.getComputedStyle(targetFrame).opacity === "0") {
          // Not faded in, remove immediately
          targetFrame.remove();
        } else {
          // Fade out first, then remove
          targetFrame.addEventListener("transitionend", transitionEndHandler);
          if (targetFrame.classList.contains("firstplay")) {
            targetFrame.classList.replace("firstplay", "remove");
          } else {
            targetFrame.classList.add("remove");
          }
        }
      }
    }
  });

  currentSelection = new Set(newSet);
  reflow();
};

const setup = () => {
  // Allow calling these objects from mainWindow
  window.update = update;
  window.reflow = reflow;

  window.onbeforeunload = () => {
    if (mainWindow && !mainWindow.closed) {
      // Reset to no selected videos for multiview.
      // Do it in onbeforeunload, so the selection is already cleared
      // when the iframes in this window unload and call jitsipop.addOrDeleteVideo().
      // Otherwise we'll continue to receive high resolution for these videos,
      // even after multiview is closed.
      jitsipop.multiviewSelection.clear();
    }
  };

  window.onunload = () => {
    // Remove this window from the array of open pop-outs in the main window
    if (mainWindow && !mainWindow.closed) {
      jitsipop.multiviewWindow = null;
    }
  };

  setInterval(parentPoller, 1000);

  if (mainWindow && !mainWindow.closed) {
    jitsipop.multiviewWindow = window;
  }

  // Debounce resize
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      reflow();
    }, 50);
  });

  update();

  document.documentElement.addEventListener("keyup", (event) => {
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
