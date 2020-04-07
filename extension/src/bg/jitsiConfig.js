// TODO disable logging

// check view-source:https://meet.jit.si/ for default config values
// or https://github.com/jitsi/jitsi-meet/blob/master/config.js
const config = {
  resolution: 720,
  constraints: {
    video: {
      aspectRatio: 16 / 9,
      height: {
        ideal: 720,
        max: 720,
        min: 180
      },
      width: {
        ideal: 1280,
        max: 1280,
        min: 320
      }
    }
  },
  desktopSharingFrameRate: {
    min: 30,
    max: 30
  },
  disableSuspendVideo: false,
  analytics: { disabled: true },
  googleApiApplicationClientID: "",
  microsoftApiApplicationClientID: "",
  enableCalendarIntegration: false,
  enableClosePage: false,
  callStatsCustomScriptUrl: "",
  hiddenDomain: "",
  dropbox: { disabled: true },
  enableRecording: false,
  transcribingEnabled: false,
  liveStreamingEnabled: false,
  fileRecordingsEnabled: false,
  fileRecordingsServiceSharingEnabled: false,
  requireDisplayName: true,
  enableWelcomePage: false,
  isBrand: false,
  logStats: false,
  callStatsID: "",
  callStatsSecret: "",
  dialInNumbersUrl: "",
  dialInConfCodeUrl: "",
  dialOutCodesUrl: "",
  dialOutAuthUrl: "",
  peopleSearchUrl: "",
  inviteServiceUrl: "",
  inviteServiceCallFlowsUrl: "",
  peopleSearchQueryTypes: [],
  chromeExtensionBanner: {},
  hepopAnalyticsUrl: "",
  hepopAnalyticsEvent: {},
  deploymentInfo: {},
  disableThirdPartyRequests: true,
  enableDisplayNameInStats: false,
  enableEmailInStats: false,
  gatherStats: false,
  enableStatsID: false,
  disableDeepLinking: true,
  disableAudioLevels: true
};

const interfaceConfig = {
  // DEFAULT_BACKGROUND: "#000000",
  DISABLE_VIDEO_BACKGROUND: true,
  DEFAULT_REMOTE_DISPLAY_NAME: "nameless",
  DEFAULT_LOCAL_DISPLAY_NAME: "me",
  GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false,
  DISPLAY_WELCOME_PAGE_CONTENT: false,
  INVITATION_POWERED_BY: false,
  AUTHENTICATION_ENABLE: false,
  TOOLBAR_BUTTONS: [
    "microphone",
    "camera",
    "desktop",
    "fullscreen",
    "fodeviceselection",
    "profile",
    "chat",
    "settings",
    "videoquality",
    "filmstrip",
    "shortcuts",
    "tileview",
    "help",
    "mute-everyone"
  ],

  SETTINGS_SECTIONS: ["devices", "language", "moderator", "profile"],
  VIDEO_LAYOUT_FIT: "width",
  VERTICAL_FILMSTRIP: true,
  CLOSE_PAGE_GUEST_HINT: false,
  SHOW_PROMOTIONAL_CLOSE_PAGE: false,
  FILM_STRIP_MAX_HEIGHT: 120,
  DISABLE_TRANSCRIPTION_SUBTITLES: true,
  DISABLE_RINGING: true,
  LOCAL_THUMBNAIL_RATIO: 16 / 9,
  REMOTE_THUMBNAIL_RATIO: 16 / 9,
  RECENT_LIST_ENABLED: false,
  SHOW_CHROME_EXTENSION_BANNER: false,
  DISABLE_PRESENCE_STATUS: true,
  DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
  DISABLE_DOMINANT_SPEAKER_INDICATOR: true
};

// Logging configuration
const loggingConfig = {
  // default log level for the app and lib-jitsi-meet
  defaultLogLevel: "trace",

  // Option to disable LogCollector (which stores the logs on CallStats)
  // disableLogCollector: true,

  // The following are too verbose in their logging with the
  // {@link #defaultLogLevel}:
  "modules/RTC/TraceablePeerConnection.js": "info",
  "modules/statistics/CallStats.js": "info",
  "modules/xmpp/strophe.util.js": "log"
};

export const options = {
  // https://github.com/jitsi/jitsi-meet/blob/master/config.js
  configOverwrite: config,
  // https://github.com/jitsi/jitsi-meet/blob/master/interface_config.js
  interfaceConfigOverwrite: interfaceConfig
};
