const background = chrome.extension.getBackgroundPage();

const servers = background.servers;

const serverSelect = document.getElementById("server-select");
const roomnameInput = document.getElementById("roomname");
const recentRoomsDatalist = document.getElementById("recent_rooms_list");
const recentRoomsInput = document.getElementById("recent_rooms_input");
const randomButton = document.getElementById("random");
const submitButton = document.getElementById("submit");
const showButton = document.getElementById("show");
// const link = document.querySelector("a");
const wishlist =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const recentRoomNames = JSON.parse(localStorage.getItem("recentRooms")) || [];

serverSelect.innerHTML = servers.map((server, index) => {
  return `<option value="${index}">${server}</option>`;
});

const handleInConference = () => {
  submitButton.value = "Close";
  document.querySelectorAll("input, select").forEach((input) => {
    if (input.type === "submit") return;
    input.disabled = true;
  });
  document.body.classList.add("in-conference");
};

const handleNotInConference = () => {
  submitButton.value = "Enter";
  document.querySelectorAll("input, select").forEach((input) => {
    if (input.type === "submit") return;
    input.disabled = false;
  });
  document.body.classList.remove("in-conference");
};

const generate = (length = 12) =>
  Array(length)
    .fill("")
    .map(
      () =>
        wishlist[
          Math.floor(
            (crypto.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1)) *
              wishlist.length
          )
        ]
    )
    .join("");

const setServerValue = (value) => {
  // Range check
  value = parseInt(value);
  if (value >= 0 && value < servers.length) {
    setValue(serverSelect, value);
  } else {
    setValue(serverSelect, 0);
  }
};

const setValue = (input, value) => {
  input.value = value;
  if (typeof input.oninput === "function") {
    input.oninput({ target: input });
  }
};

randomButton.onclick = (e) => {
  setValue(roomnameInput, generate(12));
};

// link.onclick = (e) => {
//   e.preventDefault();
//   const tmpString = "Copied!";
//   navigator.clipboard
//     .writeText(
//       `https://jitsipop.tk/#/${servers[background.selectedServerIndex]}/${
//         roomnameInput.value
//       }`
//     )
//     .then(
//       () => {
//         if (link.innerText !== tmpString) {
//           const oldString = link.innerText;
//           link.innerText = tmpString;
//           setTimeout(() => {
//             link.innerText = oldString;
//           }, 1000);
//         }
//       },
//       (err) => {
//         console.error("Async: Could not copy text: ", err);
//       }
//     );
// };

// Set values from local storage
setValue(
  roomnameInput,
  (recentRoomNames.length && recentRoomNames[0].roomName) ? decodeURIComponent(recentRoomNames[0].roomName) : ""
);
setServerValue(localStorage.getItem("serverSelect"));

if (recentRoomNames.length) {
  recentRoomsDatalist.innerHTML = recentRoomNames.map((d) => {
    const date = new Date(d.timestamp);
    return `<option value="${
      decodeURIComponent(d.roomName)
    }">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</option>`;
  });

  recentRoomsInput.oninput = (e) => {
    if (e.inputType === "insertText") {
      roomnameInput.focus();
      setValue(roomnameInput, roomnameInput.value + e.data);
    } else if (e.target.value !== "") {
      setValue(roomnameInput, e.target.value);
    }

    e.target.value = "";
  };
} else {
  recentRoomsInput.style.display = "none";
}

document.querySelector("form").onsubmit = (e) => {
  e.preventDefault();
  if (document.body.classList.contains("in-conference")) {
    background.disconnect();
  } else {
    background.selectedServerIndex = parseInt(serverSelect.value);
    background.openPopout(encodeURIComponent(roomnameInput.value));
  }
  window.close();
};

document.addEventListener("keydown", (e) => {
  if (e.keyCode == "13") {
    e.preventDefault();
    if (
      !background.mainAppWindowObject ||
      background.mainAppWindowObject.closed
    ) {
      // Don't click the submit button when we're in a conference,
      // it would close the main window
      submitButton.click();
    }
  }
});

showButton.onclick = (e) => {
  e.preventDefault();
  background.focusAllWindows();
  window.close();
};

chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "videoConferenceJoined") {
    handleInConference();
  } else if (message.type === "videoConferenceLeft") {
    handleNotInConference();
  }
});

window.addEventListener("storage", function (e) {
  if (e.key === "serverSelect") {
    setServerValue(e.newValue);
  }
});

if (background.mainAppWindowObject && !background.mainAppWindowObject.closed) {
  handleInConference();
} else {
  handleNotInConference();
}

document.body.style.display = "block";
