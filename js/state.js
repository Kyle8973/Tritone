// ============================================================
//  state.js — Global State & Constants
//  All shared mutable state lives here so every module can
//  read/write the same references.
// ============================================================

// MASTER LOG CONTROL: Set To false For Production, true For Development
const DEBUG_MODE = false;
if (!DEBUG_MODE) {
    console.log = () => { };
    console.warn = () => { };
    // console.error is left intact for production error reporting
}

// ── Electron / Third-party ────────────────────────────────────
const { ipcRenderer, shell } = require('electron');
const CryptoJS = require('crypto-js');
const colorThief = new ColorThief();

// ── Server Config ─────────────────────────────────────────────
let config = null;

// ── Playback State ────────────────────────────────────────────
let viewQueue = [];   // tracks visible in the current album/playlist view
let playbackQueue = [];   // the live playback queue
let originalQueue = [];   // pre-shuffle copy
let playbackHistory = [];
let currentIndex = 0;
let currentlyPlayingTrack = null;
let isShuffle = false;
let isRepeat = false;
let hasScrobbled = false;
let recentlyPlayedTimeout;
const audio = new Audio();

// ── UI State ──────────────────────────────────────────────────
let lyricsOpen = false;
let queueOpen = false;
let currentSyncedLyrics = [];

// ── Settings ──────────────────────────────────────────────────
let rpcEnabled;
let notificationsEnabled;
let closeToTrayEnabled;
let maxBitrate = localStorage.getItem('tritone_bitrate') || '0';
let imgResolution = localStorage.getItem('tritone_img_res') || '0';

// ── Library State ─────────────────────────────────────────────
let albumIndex = [];   // full sorted album list fetched from server
let isLibraryFetching = false;
let allLibraryLoaded = false;
let currentSortType = 'alphabeticalByName';

// ── Navigation History ────────────────────────────────────────
let historyStack = [];
let isBackNavigation = false;

// ── RPC ───────────────────────────────────────────────────────
let rpcCooldown = 0;
let rpcUpdateTimeout;

// ── Misc ──────────────────────────────────────────────────────
let trackToAddToPlaylist = null;

// ── Placeholders ──────────────────────────────────────────────
const artistPlaceholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ffffff" opacity="0.1"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
const playlistPlaceholder = 'assets/images/logo.svg';
