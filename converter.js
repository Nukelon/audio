import { FFmpeg } from "./vendor/ffmpeg/classes.js";
import { fetchFile } from "./vendor/util/index.js";
import { unzipSync, zipSync } from "./vendor/fflate.min.js";

const dropZone = document.getElementById("drop-zone");
let fileInput = document.getElementById("file-input");
const convertBtn = document.getElementById("convert-btn");
const fileInfo = document.getElementById("file-info");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progress-bar");
const logOutput = document.getElementById("log-output");
const resultSection = document.getElementById("result");
const resultSummary = document.getElementById("result-summary");
const downloadList = document.getElementById("download-list");
const downloadAllBtn = document.getElementById("download-all-btn");
const modeTabs = document.querySelectorAll(".mode-tab");
const labelSub = document.querySelector(".label-sub");
const clearBtn = document.getElementById("clear-btn");

const analysisSection = document.getElementById("analysis-section");
const analysisBody = document.getElementById("analysis-body");
const analysisSummary = document.getElementById("analysis-summary");
const configSection = document.getElementById("config-section");
const sortButtons = document.querySelectorAll(".sort-button");

const detailModal = document.getElementById("detail-modal");
const detailModalDialog = detailModal?.querySelector(".modal-dialog");
const detailModalContent = document.getElementById("detail-modal-content");
const detailModalClose = document.getElementById("detail-modal-close");
const detailModalBackdrop = detailModal?.querySelector(".modal-backdrop");
const detailModalTitle = document.getElementById("detail-modal-title");

const presetSelect = document.getElementById("preset-select");
const presetContainerGroup = document.getElementById("preset-container-group");
const presetContainerSelect = document.getElementById("preset-container-select");

const videoOptions = document.getElementById("video-options");
const videoContainerSelect = document.getElementById("video-container-select");
const videoCodecSelect = document.getElementById("video-codec-select");
const videoQualitySelect = document.getElementById("video-quality-select");
const videoCustomGroup = document.getElementById("video-custom-group");
const videoCustomCrf = document.getElementById("video-custom-crf");
const videoCustomBitrate = document.getElementById("video-custom-bitrate");

const audioOptions = document.getElementById("audio-options");
const audioContainerGroup = document.getElementById("audio-container-group");
const audioContainerSelect = document.getElementById("audio-container-select");
const audioCodecSelect = document.getElementById("audio-codec-select");
const audioQualitySelect = document.getElementById("audio-quality-select");
const audioCustomGroup = document.getElementById("audio-custom-group");
const audioCustomBitrate = document.getElementById("audio-custom-bitrate");

const ffmpeg = new FFmpeg();
let ffmpegReady = false;
const ffmpegLogBuffer = [];
const MAX_LOG_BUFFER = 5000;

const DEFAULT_SORT_KEY = "uploadedAt";

const createDefaultSortState = () => ({
  key: DEFAULT_SORT_KEY,
  direction: "desc",
  isDefault: true,
});

let isAnalyzing = false;
let lastFocusedElement = null;
let entryIdCounter = 0;

const textCollator = typeof Intl !== "undefined" && Intl.Collator
  ? new Intl.Collator("zh-Hans", { numeric: true, sensitivity: "base" })
  : null;

const MODES = {
  AUDIO: "audio",
  VIDEO: "video",
};

const createModeState = () => ({
  selectedFiles: [],
  mediaEntries: [],
  hasVideoEntries: false,
  hasAudioEntries: false,
  videoEntriesWithAudio: false,
  results: [],
  config: null,
  analysisSort: createDefaultSortState(),
});

const modeStates = {
  [MODES.AUDIO]: createModeState(),
  [MODES.VIDEO]: createModeState(),
};

let currentMode = MODES.AUDIO;
let state = modeStates[currentMode];

const currentObjectUrls = [];
const trackedTempFiles = new Set();

const conversionProgress = {
  total: 0,
  currentIndex: 0,
  startTime: null,
  label: "",
};

const audioExtensions = new Set([
  "aac",
  "ac3",
  "aiff",
  "alac",
  "amr",
  "ape",
  "dts",
  "flac",
  "m2a",
  "m4a",
  "mka",
  "mp2",
  "mp3",
  "ogg",
  "opus",
  "wav",
  "wma",
  "wv",
]);

const videoExtensions = new Set([
  "3gp",
  "3g2",
  "avi",
  "flv",
  "m2ts",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpg",
  "mpeg",
  "mts",
  "mxf",
  "ts",
  "vob",
  "webm",
  "wmv",
]);

const gatherUniformTypesFromMap = (extensionSet, mapping) => {
  const values = new Set();
  extensionSet.forEach((ext) => {
    const mapped = mapping?.[ext];
    if (Array.isArray(mapped)) {
      mapped.filter(Boolean).forEach((item) => values.add(item));
    }
  });
  return values;
};

const buildIOSUniformTypeList = (baseList, extensionSet, mapping) => {
  const items = new Set((baseList || []).filter(Boolean));
  const mappedValues = gatherUniformTypesFromMap(extensionSet, mapping);
  mappedValues.forEach((value) => items.add(value));
  return Array.from(items);
};

const iosAudioUniformTypeMap = {
  aac: ["public.aac-audio"],
  ac3: ["com.dolby.ac-3-audio"],
  aiff: ["public.aiff-audio", "public.aifc-audio"],
  alac: ["com.apple.coreaudio-format"],
  amr: ["org.3gpp.adaptive-multi-rate-audio"],
  ape: ["com.monkeysaudio.ape-audio"],
  dts: ["com.dts.audio"],
  flac: ["org.xiph.flac"],
  m2a: ["public.mpeg-2-audio"],
  m4a: ["public.mpeg-4-audio"],
  mka: ["org.matroska.audio"],
  mp2: ["public.mp2"],
  mp3: ["public.mp3"],
  ogg: ["org.xiph.ogg-audio"],
  opus: ["org.xiph.opus"],
  wav: ["com.microsoft.waveform-audio"],
  wma: ["com.microsoft.windows-media-wma"],
  wv: ["com.wavpack.audio"],
};

const iosVideoUniformTypeMap = {
  "3g2": ["public.3gpp2"],
  "3gp": ["public.3gpp"],
  avi: ["public.avi", "com.microsoft.avi"],
  flv: ["com.adobe.flash-video"],
  m2ts: ["com.sony.m2ts", "public.mpeg-2-transport-stream"],
  m4v: ["com.apple.m4v-video"],
  mkv: ["org.matroska.mkv", "org.matroska.video", "org.matroska.matroska"],
  mov: ["com.apple.quicktime-movie"],
  mp4: ["public.mpeg-4"],
  mpeg: ["public.mpeg"],
  mpg: ["public.mpeg"],
  mts: ["com.sony.mts", "public.mpeg-2-transport-stream"],
  mxf: ["com.sony.mxf"],
  ts: ["public.mpeg-2-transport-stream"],
  vob: ["com.apple.vob-video"],
  webm: ["org.webmproject.webm"],
  wmv: ["com.microsoft.windows-media-wmv"],
};

const audioMimeTypes = [
  "audio/aac",
  "audio/x-aac",
  "audio/aiff",
  "audio/x-aiff",
  "audio/aifc",
  "audio/x-aifc",
  "audio/amr",
  "audio/3gpp",
  "audio/3gpp2",
  "audio/flac",
  "audio/x-flac",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/vnd.dts",
  "audio/vnd.dts.hd",
  "audio/x-ms-wma",
  "audio/x-m4a",
  "audio/ape",
  "audio/x-ape",
  "application/zip",
  "application/x-zip-compressed",
];

const videoMimeTypes = [
  "video/*",
  "video/quicktime",
  "video/mp4",
  "video/x-matroska",
  "application/x-matroska",
  "application/zip",
  "application/x-zip-compressed",
];

const nav = typeof navigator !== "undefined" ? navigator : undefined;
const navUserAgent = nav?.userAgent || "";
const navPlatform = nav?.platform || "";
const navMaxTouchPoints = Number(nav?.maxTouchPoints) || 0;
const navHardwareConcurrency = Number(nav?.hardwareConcurrency) || 0;
const navDeviceMemory = Number(nav?.deviceMemory) || 0;

const isIOSDevice = (() => {
  if (!nav) return false;
  if (["iPhone", "iPad", "iPod"].includes(navPlatform)) return true;
  if (/iPad|iPhone|iPod/.test(navUserAgent)) return true;
  // iPadOS 13+ reports Mac platform but has touch support
  if (navPlatform === "MacIntel" && navMaxTouchPoints > 1) return true;
  return false;
})();

const isMobileLikeDevice = (() => {
  if (!nav) return false;
  if (isIOSDevice) return true;
  return /Android|Mobi|Mobile/.test(navUserAgent);
})();

const preferFasterVideoPreset = (() => {
  if (isIOSDevice) return true;
  if (navHardwareConcurrency && navHardwareConcurrency <= 2) return true;
  if (navDeviceMemory && navDeviceMemory <= 2) return true;
  return isMobileLikeDevice;
})();

const iosAudioUniformTypes = buildIOSUniformTypeList(
  [
    "public.audio",
    "public.mpeg-4-audio",
    "org.matroska.audio",
    "com.apple.coreaudio-format",
  ],
  audioExtensions,
  iosAudioUniformTypeMap,
);

const iosVideoUniformTypes = buildIOSUniformTypeList(
  [
    "public.movie",
    "public.video",
    "org.matroska.mkv",
    "org.matroska.video",
    "org.webmproject.webm",
    "com.apple.quicktime-movie",
  ],
  videoExtensions,
  iosVideoUniformTypeMap,
);

const iosZipUniformTypes = ["com.pkware.zip-archive", "public.zip-archive"];

const baseAudioAcceptList = [
  ...audioMimeTypes,
  ...Array.from(audioExtensions).map((ext) => `.${ext}`),
  ".zip",
];

const baseVideoAcceptList = [
  ...videoMimeTypes,
  ...Array.from(videoExtensions).map((ext) => `.${ext}`),
  ".zip",
];

const buildAcceptList = (baseList, iosSpecific = [], options = {}) => {
  const { iosFallbackTypes = [] } = options;
  const items = new Set(baseList);
  if (isIOSDevice) {
    iosZipUniformTypes.forEach((type) => items.add(type));
    iosSpecific.forEach((type) => items.add(type));
    iosFallbackTypes.forEach((type) => items.add(type));
  }
  return Array.from(items).join(",");
};

const getAcceptTypesForMode = (mode) => {
  if (mode === MODES.AUDIO) {
    return buildAcceptList(baseAudioAcceptList, iosAudioUniformTypes);
  }
  if (mode === MODES.VIDEO) {
    if (isIOSDevice) {
      return "";
    }
    return buildAcceptList(baseVideoAcceptList, iosVideoUniformTypes);
  }
  return "";
};

const modeDescriptions = {
  [MODES.AUDIO]: "支持音频文件与 ZIP 压缩包，所有处理均在本地完成",
  [MODES.VIDEO]: "支持视频文件与 ZIP 压缩包，所有处理均在本地完成",
};

const losslessCodecs = new Set([
  "flac",
  "alac",
  "pcm_s16le",
  "pcm_s24le",
  "pcm_s32le",
  "pcm_f32le",
  "pcm_f64le",
  "pcm_s16be",
  "pcm_s24be",
  "pcm_s32be",
  "pcm_f32be",
  "pcm_f64be",
]);

const audioQualityProfiles = {
  ultra: { bitrate: 256 },
  high: { bitrate: 192 },
  medium: { bitrate: 160 },
  low: { bitrate: 128 },
  verylow: { bitrate: 96 },
};

const videoQualityProfiles = {
  ultra: { crf: 18, preset: "slow", scaleHeight: null },
  high: { crf: 20, preset: "medium", scaleHeight: 1440 },
  medium: { crf: 24, preset: "fast", scaleHeight: 1080 },
  low: { crf: 28, preset: "faster", scaleHeight: 720 },
  verylow: { crf: 32, preset: "veryfast", scaleHeight: 480 },
};

const PRESET_ACCELERATION_MAP = {
  placebo: "veryfast",
  veryslow: "faster",
  slower: "fast",
  slow: "medium",
  medium: "fast",
  fast: "faster",
  faster: "veryfast",
  veryfast: "superfast",
};

const resolvePresetForEnvironment = (preset) => {
  if (!preset) return preset;
  if (!preferFasterVideoPreset) return preset;
  return PRESET_ACCELERATION_MAP[preset] || preset;
};

const computeDefaultVideoThreads = () => {
  if (!navHardwareConcurrency) {
    return preferFasterVideoPreset ? 1 : 2;
  }
  if (preferFasterVideoPreset && navHardwareConcurrency <= 2) {
    return 1;
  }
  if (navHardwareConcurrency >= 8) return 4;
  if (navHardwareConcurrency >= 6) return 3;
  if (navHardwareConcurrency >= 4) return 2;
  return 1;
};

const DEFAULT_VIDEO_THREADS = computeDefaultVideoThreads();

let presetAdjustmentNotified = false;

const audioContainers = [
  {
    value: "flac",
    label: "FLAC (.flac)",
    codecs: [
      { value: "flac", label: "FLAC（无损）" },
    ],
    defaultCodec: "flac",
  },
  {
    value: "wav",
    label: "WAV (.wav)",
    codecs: [
      { value: "pcm_s16le", label: "PCM 16-bit（无损）" },
      { value: "pcm_s24le", label: "PCM 24-bit（无损）" },
      { value: "pcm_f32le", label: "PCM 32-bit 浮点（无损）" },
    ],
    defaultCodec: "pcm_s16le",
  },
  {
    value: "m4a",
    label: "M4A (.m4a)",
    codecs: [
      { value: "aac", label: "AAC" },
      { value: "alac", label: "ALAC（无损）" },
    ],
    defaultCodec: "aac",
  },
  {
    value: "mp3",
    label: "MP3 (.mp3)",
    codecs: [
      { value: "libmp3lame", label: "MP3" },
    ],
    defaultCodec: "libmp3lame",
  },
  {
    value: "ogg",
    label: "Ogg (.ogg)",
    codecs: [
      { value: "libopus", label: "Opus" },
      { value: "libvorbis", label: "Vorbis" },
    ],
    defaultCodec: "libopus",
  },
  {
    value: "opus",
    label: "Opus (.opus)",
    codecs: [
      { value: "libopus", label: "Opus" },
    ],
    defaultCodec: "libopus",
  },
  {
    value: "aac",
    label: "ADTS AAC (.aac)",
    codecs: [
      { value: "aac", label: "AAC" },
    ],
    defaultCodec: "aac",
  },
  {
    value: "wma",
    label: "WMA (.wma)",
    codecs: [
      { value: "wmav2", label: "WMA" },
    ],
    defaultCodec: "wmav2",
  },
  {
    value: "mka",
    label: "Matroska Audio (.mka)",
    codecs: null,
    defaultCodec: "copy",
  },
];

const videoContainers = [
  {
    value: "mp4",
    label: "MP4 (.mp4)",
    videoCodecs: [
      { value: "libx264", label: "H.264 / AVC" },
      { value: "libx265", label: "H.265 / HEVC" },
      { value: "copy", label: "不转换" },
    ],
    audioCodecs: [
      { value: "aac", label: "AAC" },
      { value: "ac3", label: "Dolby Digital" },
      { value: "libmp3lame", label: "MP3" },
      { value: "copy", label: "不转换" },
    ],
    defaultVideoCodec: "libx264",
    defaultAudioCodec: "aac",
  },
  {
    value: "mkv",
    label: "Matroska (.mkv)",
    videoCodecs: [
      { value: "libx264", label: "H.264 / AVC" },
      { value: "libx265", label: "H.265 / HEVC" },
      { value: "libvpx-vp9", label: "VP9" },
      { value: "copy", label: "不转换" },
    ],
    audioCodecs: [
      { value: "aac", label: "AAC" },
      { value: "libopus", label: "Opus" },
      { value: "flac", label: "FLAC" },
      { value: "copy", label: "不转换" },
    ],
    defaultVideoCodec: "libx264",
    defaultAudioCodec: "aac",
  },
  {
    value: "mov",
    label: "QuickTime (.mov)",
    videoCodecs: [
      { value: "libx264", label: "H.264 / AVC" },
      { value: "libx265", label: "H.265 / HEVC" },
      { value: "copy", label: "不转换" },
    ],
    audioCodecs: [
      { value: "aac", label: "AAC" },
      { value: "alac", label: "ALAC（无损）" },
      { value: "copy", label: "不转换" },
    ],
    defaultVideoCodec: "libx264",
    defaultAudioCodec: "aac",
  },
  {
    value: "webm",
    label: "WebM (.webm)",
    videoCodecs: [
      { value: "libvpx-vp9", label: "VP9" },
      { value: "libaom-av1", label: "AV1" },
      { value: "copy", label: "不转换" },
    ],
    audioCodecs: [
      { value: "libopus", label: "Opus" },
      { value: "libvorbis", label: "Vorbis" },
      { value: "copy", label: "不转换" },
    ],
    defaultVideoCodec: "libvpx-vp9",
    defaultAudioCodec: "libopus",
  },
  {
    value: "avi",
    label: "AVI (.avi)",
    videoCodecs: [
      { value: "libx264", label: "H.264 / AVC" },
      { value: "mpeg4", label: "MPEG-4 Part 2" },
      { value: "copy", label: "不转换" },
    ],
    audioCodecs: [
      { value: "libmp3lame", label: "MP3" },
      { value: "ac3", label: "Dolby Digital" },
      { value: "copy", label: "不转换" },
    ],
    defaultVideoCodec: "libx264",
    defaultAudioCodec: "libmp3lame",
  },
  {
    value: "ts",
    label: "MPEG-TS (.ts)",
    videoCodecs: [
      { value: "libx264", label: "H.264 / AVC" },
      { value: "mpeg2video", label: "MPEG-2" },
      { value: "copy", label: "不转换" },
    ],
    audioCodecs: [
      { value: "aac", label: "AAC" },
      { value: "ac3", label: "Dolby Digital" },
      { value: "mp2", label: "MP2" },
      { value: "copy", label: "不转换" },
    ],
    defaultVideoCodec: "libx264",
    defaultAudioCodec: "aac",
  },
];

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "未知大小";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
};

const formatDateTime = (timestamp) => {
  if (!Number.isFinite(timestamp)) return "未知";
  try {
    const formatter = typeof Intl !== "undefined" && Intl.DateTimeFormat
      ? new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "medium",
          timeStyle: "medium",
        })
      : null;
    const date = new Date(timestamp);
    if (formatter) {
      return formatter.format(date);
    }
    return date.toLocaleString();
  } catch (error) {
    return new Date(timestamp).toLocaleString();
  }
};

const formatFrameRate = (value) => {
  if (!Number.isFinite(value) || value <= 0) return "未知";
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)} fps`;
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "未知";
  const totalMilliseconds = Math.round(seconds * 1000);
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const fractional = totalMilliseconds % 1000;
  const parts = [];
  if (hours) {
    parts.push(String(hours).padStart(2, "0"));
    parts.push(String(minutes).padStart(2, "0"));
  } else {
    parts.push(String(minutes));
  }
  parts.push(String(secs).padStart(2, "0"));
  let formatted = parts.join(":");
  if (fractional) {
    const fractionalStr = String(Math.floor(fractional / 10)).padStart(2, "0");
    formatted = `${formatted}.${fractionalStr}`;
  }
  return formatted;
};

const formatBitrate = (bps) => {
  if (!Number.isFinite(bps) || bps <= 0) return "未知";
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  }
  if (bps >= 1_000) {
    return `${(bps / 1_000).toFixed(0)} kbps`;
  }
  return `${Math.round(bps)} bps`;
};

const formatMetadataDate = (value) => {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return formatDateTime(timestamp);
  }
  return value;
};

const normalizeMetadataValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) {
    return "";
  }
  return trimmed;
};

const sanitizeName = (name, fallback = "file") => {
  if (!name) return fallback;
  const normalized = typeof name.normalize === "function" ? name.normalize("NFC") : name;
  const replaced = normalized.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
  const trimmed = replaced.trim();
  const stripped = trimmed.replace(/^\.+/, "").replace(/\.+$/, "");
  return stripped || fallback;
};

const getExtension = (filename) => {
  const match = /\.([^.]+)$/.exec(filename || "");
  return match ? match[1].toLowerCase() : "";
};

const getBaseName = (filename) => (filename || "").replace(/\.[^.]*$/, "");

const getDisplayLabel = (path) => {
  if (!path) return "未知文件";
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.slice(-1)[0] || normalized;
};

const shortenLabel = (label) => {
  if (!label) return "";
  return label.length > 48 ? `${label.slice(0, 45)}...` : label;
};

const splitDisplayName = (name = "") => {
  const normalized = String(name).replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const prefix = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : "";
  const filePart = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const ext = getExtension(filePart);
  const baseWithSuffix = ext ? filePart.slice(0, filePart.length - ext.length - 1) : filePart;
  const suffixMatch = baseWithSuffix.match(/^(.*)\((\d+)\)$/);
  let base = baseWithSuffix;
  let suffixIndex = 0;
  if (suffixMatch) {
    base = suffixMatch[1];
    suffixIndex = Number(suffixMatch[2]) || 0;
  }
  return {
    prefix,
    base,
    ext,
    suffixIndex,
  };
};

const buildDisplayNameWithSuffix = (prefix, base, ext, index) => {
  const safeBase = typeof base === "string" ? base : "";
  const suffix = index > 0 ? `(${index})` : "";
  const filePart = ext ? `${safeBase}${suffix}.${ext}` : `${safeBase}${suffix}`;
  return `${prefix}${filePart}`;
};

const ensureUniqueDisplayNames = (existingEntries = [], newEntries = []) => {
  if (!Array.isArray(newEntries) || newEntries.length === 0) {
    return;
  }
  const usedNames = new Set();
  const nextIndexMap = new Map();

  const buildKey = (parts) =>
    `${(parts.prefix || "").toLowerCase()}|${(parts.base || "").toLowerCase()}|${(parts.ext || "").toLowerCase()}`;

  const registerName = (name) => {
    if (!name) return;
    const parts = splitDisplayName(name);
    const key = buildKey(parts);
    const candidateNext = (parts.suffixIndex || 0) + 1;
    const currentNext = nextIndexMap.get(key) || 1;
    nextIndexMap.set(key, Math.max(currentNext, candidateNext));
    usedNames.add(name.toLowerCase());
  };

  existingEntries.forEach((entry) => {
    if (entry && entry.displayName) {
      registerName(entry.displayName);
    }
  });

  newEntries.forEach((entry) => {
    if (!entry || !entry.displayName) return;
    const originalName = entry.displayName;
    const lowerName = originalName.toLowerCase();
    const parts = splitDisplayName(originalName);
    const key = buildKey(parts);
    const initialNext = nextIndexMap.get(key) || 1;
    if (!usedNames.has(lowerName)) {
      usedNames.add(lowerName);
      nextIndexMap.set(key, Math.max(initialNext, 1));
      return;
    }
    let index = initialNext;
    let candidate = originalName;
    while (true) {
      candidate = buildDisplayNameWithSuffix(parts.prefix, parts.base, parts.ext, index);
      const candidateLower = candidate.toLowerCase();
      if (!usedNames.has(candidateLower)) {
        entry.displayName = candidate;
        usedNames.add(candidateLower);
        nextIndexMap.set(key, index + 1);
        break;
      }
      index += 1;
    }
  });
};

const joinLabel = (...parts) => parts.filter(Boolean).join("/").replace(/\\/g, "/");

const isZipFile = (name = "") => /\.zip$/i.test(name);

const ensureTimestamp = (value) => (Number.isFinite(value) ? value : Date.now());

const createUploadTracker = (base = Date.now()) => {
  let counter = 0;
  return {
    next() {
      const value = base + counter;
      counter += 1;
      return Number.isFinite(value) ? value : Date.now();
    },
  };
};

const getFileTimestamp = (file) => {
  if (!file) return Date.now();
  if (typeof file.lastModified === "number" && Number.isFinite(file.lastModified)) {
    return file.lastModified;
  }
  const lastModifiedDate = file.lastModifiedDate;
  if (lastModifiedDate instanceof Date && Number.isFinite(lastModifiedDate.valueOf())) {
    return lastModifiedDate.valueOf();
  }
  return Date.now();
};

const isAudioFile = (file) => {
  if (!file) return false;
  if (typeof file.type === "string" && file.type.startsWith("audio/")) {
    return true;
  }
  const ext = getExtension(file.name || file.webkitRelativePath || "");
  return audioExtensions.has(ext);
};

const isVideoFile = (file) => {
  if (!file) return false;
  if (typeof file.type === "string" && file.type.startsWith("video/")) {
    return true;
  }
  const ext = getExtension(file.name || file.webkitRelativePath || "");
  return videoExtensions.has(ext);
};

const shouldIncludeFileForMode = (file, mode) => {
  if (mode === MODES.AUDIO) {
    return isAudioFile(file);
  }
  if (mode === MODES.VIDEO) {
    return isVideoFile(file);
  }
  return false;
};

const registerObjectUrl = (url) => {
  if (url) {
    currentObjectUrls.push(url);
  }
};

const revokeObjectUrls = () => {
  while (currentObjectUrls.length) {
    const url = currentObjectUrls.pop();
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn("无法释放对象 URL", error);
    }
  }
};

const clearResults = (modeState = state) => {
  if (modeState) {
    modeState.results = [];
  }
  renderResults(modeState);
};

const recalculateEntryFlags = () => {
  const entries = Array.isArray(state.mediaEntries) ? state.mediaEntries : [];
  state.hasVideoEntries = entries.some((entry) => entry.type === "video");
  state.hasAudioEntries = entries.some((entry) => entry.type === "audio");
  state.videoEntriesWithAudio = entries.some(
    (entry) =>
      entry.type === "video" &&
      (entry.analysis?.hasAudio || Boolean(entry.analysis?.audioCodec)),
  );
};

const clearLog = () => {
  logOutput.textContent = "";
  ffmpegLogBuffer.length = 0;
};

const updateModeTabs = () => {
  modeTabs.forEach((tab) => {
    const tabMode = tab.dataset.mode;
    const isActive = tabMode === currentMode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.tabIndex = isActive ? 0 : -1;
  });
  if (analysisSection) {
    analysisSection.dataset.mode = currentMode;
  }
};

const updateFileInputForMode = ({ resetValue = false } = {}) => {
  const acceptValue = getAcceptTypesForMode(currentMode);
  if (!fileInput) return;
  if (fileInput.dataset.currentAccept !== acceptValue) {
    rebuildFileInputElement(acceptValue);
  }
  setInputAcceptValue(fileInput, acceptValue);
  if (labelSub && modeDescriptions[currentMode]) {
    labelSub.textContent = modeDescriptions[currentMode];
  }
  if (resetValue) {
    try {
      fileInput.value = "";
    } catch (error) {
      // ignore inability to reset programmatically
    }
  }
};

const updateFileInfo = () => {
  if (!state.selectedFiles.length) {
    fileInfo.textContent = "尚未选择文件";
    return;
  }
  const totalSize = state.selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  fileInfo.textContent = `已选择 ${state.selectedFiles.length} 个文件（总计 ${formatBytes(totalSize)}）`;
};

const anyUploadsExist = () =>
  Object.values(modeStates).some(
    (modeState) => modeState.selectedFiles.length || modeState.mediaEntries.length || modeState.results.length,
  );

const updateClearButtonState = () => {
  clearBtn.disabled = !anyUploadsExist();
};

const resetModeState = (mode) => {
  if (!modeStates[mode]) return;
  modeStates[mode] = createModeState();
  if (mode === currentMode) {
    state = modeStates[mode];
  }
};

const appendLog = (message = "") => {
  let text = "";
  if (typeof message === "string") {
    text = message;
  } else if (message instanceof Error) {
    text = message.message;
  } else if (message && typeof message === "object" && "message" in message) {
    text = String(message.message);
  } else {
    try {
      text = JSON.stringify(message);
    } catch (error) {
      text = String(message);
    }
  }
  logOutput.textContent += `${text}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
};

const cleanupTempFiles = async () => {
  if (!ffmpegReady || trackedTempFiles.size === 0) return;
  const pending = Array.from(trackedTempFiles);
  for (const name of pending) {
    try {
      await ffmpeg.deleteFile?.(name);
    } catch (error) {
      appendLog(`清理临时文件失败：${error.message || error}`);
    } finally {
      releaseTempFile(name);
    }
  }
};

const setStatus = (message) => {
  statusEl.textContent = message;
};

const updateProgress = (value) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  progressBar.style.width = `${clamped}%`;
};

const resetProgress = () => {
  updateProgress(0);
  conversionProgress.total = 0;
  conversionProgress.currentIndex = 0;
  conversionProgress.startTime = null;
  conversionProgress.label = "";
  presetAdjustmentNotified = false;
};

const handleFileInputChange = (event) => {
  const files = event?.target?.files;
  selectFiles(files ? Array.from(files) : []);
};

const registerFileInputListeners = (input) => {
  if (!input) return;
  input.addEventListener("change", handleFileInputChange);
};

const setInputAcceptValue = (input, acceptValue) => {
  if (!input) return;
  if (acceptValue) {
    input.accept = acceptValue;
    try {
      input.setAttribute("accept", acceptValue);
    } catch (error) {
      // ignore inability to sync attributes on certain browsers
    }
  } else {
    input.removeAttribute("accept");
  }
  input.dataset.currentAccept = acceptValue;
};

const rebuildFileInputElement = (acceptValue) => {
  if (!fileInput || !fileInput.parentNode) return;
  const newInput = fileInput.cloneNode();
  newInput.value = "";
  newInput.type = "file";
  newInput.multiple = fileInput.multiple;
  newInput.id = fileInput.id;
  newInput.disabled = fileInput.disabled;
  if (fileInput.name) {
    newInput.name = fileInput.name;
  }
  setInputAcceptValue(newInput, acceptValue);
  fileInput.parentNode.replaceChild(newInput, fileInput);
  fileInput = newInput;
  registerFileInputListeners(fileInput);
};

const toggleFieldVisibility = (element, shouldHide) => {
  if (!element) return;
  element.hidden = shouldHide;
  element.classList.toggle("is-hidden", shouldHide);
};

const trackTempFile = (name) => {
  if (!name) return;
  trackedTempFiles.add(name);
};

const releaseTempFile = (name) => {
  if (!name) return;
  trackedTempFiles.delete(name);
};

const loadFFmpeg = async () => {
  if (ffmpegReady) return;
  setStatus("正在加载多线程 FFmpeg 核心...");
  try {
    await ffmpeg.load({
      coreURL: new URL("./ffmpeg-core/ffmpeg-core.js", window.location.href).href,
      wasmURL: new URL("./ffmpeg-core/ffmpeg-core.wasm", window.location.href).href,
      workerURL: new URL("./ffmpeg-core/ffmpeg-core.worker.js", window.location.href).href,
    });
    ffmpegReady = true;
    setStatus("FFmpeg 已就绪");
  } catch (error) {
    appendLog(error);
    setStatus("加载 FFmpeg 失败，请刷新页面后重试");
    throw error;
  }
};

const getSortableValue = (entry, key) => {
  if (!entry) return null;
  switch (key) {
    case "displayName":
      return entry.displayName || "";
    case "type":
      return entry.type || "";
    case "size":
      return entry.file?.size ?? null;
    case "uploadedAt":
      return entry.uploadedAt ?? null;
    case "createdAt":
      return entry.createdAt ?? null;
    case "container":
      return entry.analysis?.container || null;
    case "resolution":
      if (entry.analysis?.width && entry.analysis?.height) {
        return entry.analysis.width * 10000 + entry.analysis.height;
      }
      return null;
    case "frameRate":
      return Number.isFinite(entry.analysis?.frameRate) ? entry.analysis.frameRate : null;
    case "videoCodec":
      return entry.type === "video"
        ? entry.analysis?.videoCodec || (entry.analysis?.hasVideo ? "未知" : null)
        : null;
    case "audioCodec":
      if (entry.analysis?.audioCodec) {
        return entry.analysis.audioCodec;
      }
      if (entry.analysis?.hasAudio === false) {
        return null;
      }
      return entry.analysis?.hasAudio ? "未知" : null;
    default:
      return entry.originalIndex ?? null;
  }
};

const compareEntriesForSort = (a, b, sortState) => {
  if (!sortState) return 0;
  const { key, direction } = sortState;
  const multiplier = direction === "desc" ? -1 : 1;
  const aValue = getSortableValue(a, key);
  const bValue = getSortableValue(b, key);
  const aIsNull = aValue === null || typeof aValue === "undefined";
  const bIsNull = bValue === null || typeof bValue === "undefined";
  if (aIsNull && !bIsNull) return 1;
  if (!aIsNull && bIsNull) return -1;
  if (!aIsNull && !bIsNull) {
    if (typeof aValue === "number" && typeof bValue === "number") {
      const diff = aValue - bValue;
      if (diff !== 0) {
        return diff * multiplier;
      }
    } else {
      const aText = String(aValue);
      const bText = String(bValue);
      const diff = textCollator ? textCollator.compare(aText, bText) : aText.localeCompare(bText);
      if (diff !== 0) {
        return diff * multiplier;
      }
    }
  }
  return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
};

const sortEntriesForDisplay = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const sortState = state.analysisSort || createDefaultSortState();
  const sorted = Array.from(entries);
  sorted.sort((a, b) => compareEntriesForSort(a, b, sortState));
  return sorted;
};

const updateSortIndicators = () => {
  if (!sortButtons || sortButtons.length === 0) return;
  const sortState = state.analysisSort || createDefaultSortState();
  sortButtons.forEach((button) => {
    if (!button) return;
    const key = button.dataset.sortKey;
    const stateValue = sortState.key === key ? sortState.direction : "none";
    button.dataset.sortState = stateValue;
    if (stateValue === "asc" || stateValue === "desc") {
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }
    const headerCell = button.closest("th");
    if (headerCell) {
      if (stateValue === "asc") {
        headerCell.setAttribute("aria-sort", "ascending");
      } else if (stateValue === "desc") {
        headerCell.setAttribute("aria-sort", "descending");
      } else {
        headerCell.removeAttribute("aria-sort");
      }
    }
  });
};

const applySortForKey = (key) => {
  if (!key) return;
  const current = state.analysisSort || createDefaultSortState();
  let nextState;
  if (current.key === key) {
    if (current.isDefault) {
      nextState = { key, direction: "asc", isDefault: false };
    } else if (current.direction === "asc") {
      nextState = { key, direction: "desc", isDefault: false };
    } else if (current.direction === "desc") {
      nextState = createDefaultSortState();
    }
  } else {
    nextState = { key, direction: "asc", isDefault: false };
  }
  if (!nextState) {
    nextState = createDefaultSortState();
  }
  state.analysisSort = nextState;
  if (state.mediaEntries.length) {
    buildAnalysisTable(state.mediaEntries);
  } else {
    updateSortIndicators();
  }
};

const selectFiles = (files = []) => {
  closeDetailModal();
  if (isAnalyzing) {
    setStatus("正在分析当前文件，请稍候再上传新文件");
    return;
  }

  const validFiles = [];
  let rejectedCount = 0;
  for (const file of Array.from(files || [])) {
    if (!file) continue;
    if (isZipFile(file.name || "")) {
      validFiles.push(file);
      continue;
    }
    if (shouldIncludeFileForMode(file, currentMode)) {
      validFiles.push(file);
    } else {
      rejectedCount += 1;
    }
  }

  if (fileInput) {
    try {
      fileInput.value = "";
    } catch (error) {
      // ignore inability to reset programmatically
    }
  }

  if (!validFiles.length) {
    state.selectedFiles = [];
    updateFileInfo();
    if (rejectedCount > 0) {
      const expectedLabel = currentMode === MODES.AUDIO ? "音频" : "视频";
      setStatus(`已忽略 ${rejectedCount} 个非${expectedLabel}文件`);
    } else if (!state.mediaEntries.length) {
      setStatus("等待操作");
    }
    return;
  }

  const hasExistingEntries = state.mediaEntries.length > 0;
  state.selectedFiles = validFiles;
  if (!hasExistingEntries) {
    state.analysisSort = createDefaultSortState();
    analysisBody.innerHTML = "";
    analysisSummary.textContent = "";
    analysisSection.hidden = true;
    configSection.hidden = true;
  }

  clearResults(state);
  convertBtn.disabled = true;

  if (ffmpegReady) {
    cleanupTempFiles().catch((error) => {
      console.warn("清理临时文件时出错", error);
    });
  }

  updateFileInfo();
  updateClearButtonState();
  updateSortIndicators();

  if (rejectedCount > 0) {
    const expectedLabel = currentMode === MODES.AUDIO ? "音频" : "视频";
    setStatus(`已忽略 ${rejectedCount} 个非${expectedLabel}文件，正在分析可用文件`);
  } else {
    setStatus(hasExistingEntries ? "正在准备分析新增文件..." : "正在准备分析文件...");
  }

  analyzeSelectedFiles({ append: hasExistingEntries });
};

const gatherMediaEntries = async (files, mode) => {
  const entries = [];
  const uploadTracker = createUploadTracker();
  for (const file of files) {
    const label = file.webkitRelativePath || file.name;
    const baseTimestamp = ensureTimestamp(getFileTimestamp(file));
    await collectFromEntry(file, label, entries, mode, baseTimestamp, uploadTracker);
  }
  return entries;
};

const collectFromEntry = async (
  file,
  label,
  entries,
  mode,
  baseTimestamp,
  uploadTracker,
) => {
  if (!file) return;
  if (isZipFile(file.name)) {
    appendLog(`开始解压缩文件：${label}`);
    let zipEntries;
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      zipEntries = unzipSync(buffer);
    } catch (error) {
      appendLog(`解压失败（${label}）：${error.message || error}`);
      return;
    }
    const names = Object.keys(zipEntries || {});
    if (names.length === 0) {
      appendLog(`压缩文件为空：${label}`);
    }
    for (const entryName of names) {
      if (entryName.endsWith("/")) continue;
      const data = zipEntries[entryName];
      const fullLabel = joinLabel(label, entryName);
      if (isZipFile(entryName)) {
        const nestedFile = new File([data], entryName, {
          type: "application/zip",
          lastModified: ensureTimestamp(baseTimestamp),
        });
        await collectFromEntry(
          nestedFile,
          fullLabel,
          entries,
          mode,
          baseTimestamp,
          uploadTracker,
        );
      } else {
        const virtualFile = new File([data], entryName, {
          lastModified: ensureTimestamp(baseTimestamp),
        });
        if (shouldIncludeFileForMode(virtualFile, mode)) {
          const originalIndex = entries.length;
          const uploadedAt = uploadTracker?.next?.() ?? Date.now();
          entries.push({
            id: entryIdCounter += 1,
            file: virtualFile,
            displayName: fullLabel,
            ext: getExtension(entryName),
            type: mode === MODES.VIDEO ? "video" : "audio",
            uploadedAt,
            createdAt: ensureTimestamp(baseTimestamp),
            originalIndex,
          });
        } else if (isVideoFile(virtualFile) || isAudioFile(virtualFile)) {
          const category = mode === MODES.VIDEO ? "视频" : "音频";
          appendLog(`压缩包内忽略非${category}文件：${fullLabel}`);
        } else {
          appendLog(`压缩包内忽略非媒体文件：${fullLabel}`);
        }
      }
    }
  } else if (shouldIncludeFileForMode(file, mode)) {
    const originalIndex = entries.length;
    const uploadedAt = uploadTracker?.next?.() ?? Date.now();
    entries.push({
      id: entryIdCounter += 1,
      file,
      displayName: label,
      ext: getExtension(file.name || file.webkitRelativePath || ""),
      type: mode === MODES.VIDEO ? "video" : "audio",
      uploadedAt,
      createdAt: ensureTimestamp(baseTimestamp),
      originalIndex,
    });
  } else {
    const category = mode === MODES.VIDEO ? "视频" : "音频";
    if (isVideoFile(file) || isAudioFile(file)) {
      appendLog(`忽略非${category}文件：${label}`);
    } else {
      appendLog(`忽略非媒体文件：${label}`);
    }
  }
};

const parseProbeLog = (log = "") => {
  const audioMatches = [...log.matchAll(/Audio:\s*([^,\s]+)/gi)].map((m) => m[1].toLowerCase());
  const videoMatches = [...log.matchAll(/Video:\s*([^,\s]+)/gi)].map((m) => m[1].toLowerCase());
  const resolutionMatch = log.match(/Video:[^\n]*?,\s*(\d{2,5})x(\d{2,5})/i);
  const frameRateMatch = log.match(/\s([\d.]+)\s*fps/);
  const durationMatch = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  const bitrateMatch = log.match(/bitrate:\s*([\d.]+)\s*kb\/?s/i);

  let durationSeconds = null;
  if (durationMatch) {
    const hours = Number(durationMatch[1]) || 0;
    const minutes = Number(durationMatch[2]) || 0;
    const seconds = Number(durationMatch[3]) || 0;
    durationSeconds = hours * 3600 + minutes * 60 + seconds;
  }

  const bitrateBps = bitrateMatch ? Number(bitrateMatch[1]) * 1000 : null;

  const metadata = {};
  const lines = log.split(/\r?\n/);
  let inMetadata = false;
  for (const rawLine of lines) {
    const line = rawLine || "";
    if (/^\s*Metadata:/i.test(line)) {
      inMetadata = true;
      continue;
    }
    if (!inMetadata) {
      continue;
    }
    if (/^\s*(?:Stream\s+#|Input\s+#|Output\s+#|Duration:|frame=|Press\s+\[q\])/i.test(line)) {
      inMetadata = false;
      continue;
    }
    if (!line.trim()) {
      continue;
    }
    const metaMatch = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
    if (metaMatch) {
      const key = metaMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
      const value = metaMatch[2].trim();
      if (key && value && typeof metadata[key] === "undefined") {
        metadata[key] = value;
      }
      continue;
    }
    if (!/^\s/.test(line)) {
      inMetadata = false;
    }
  }

  return {
    audioCodec: audioMatches.length ? audioMatches[0] : null,
    videoCodec: videoMatches.length ? videoMatches[0] : null,
    hasAudio: audioMatches.length > 0,
    hasVideo: videoMatches.length > 0,
    width: resolutionMatch ? Number(resolutionMatch[1]) : null,
    height: resolutionMatch ? Number(resolutionMatch[2]) : null,
    frameRate: frameRateMatch ? Number(frameRateMatch[1]) : null,
    duration: durationSeconds,
    bitrate: Number.isFinite(bitrateBps) && bitrateBps > 0 ? bitrateBps : null,
    metadata,
  };
};

const analyzeEntry = async (entry, index) => {
  const originalName = entry.file.name || getDisplayLabel(entry.displayName);
  const originalExt = getExtension(originalName) || entry.ext || "dat";
  const inputName = entry.inputName || sanitizeName(`source_${index}.${originalExt}`);
  entry.inputName = inputName;
  const startIndex = ffmpegLogBuffer.length;
  if (!trackedTempFiles.has(inputName)) {
    try {
      await ffmpeg.writeFile(inputName, await fetchFile(entry.file));
      trackTempFile(inputName);
    } catch (error) {
      appendLog(`缓存文件失败（${entry.displayName}）：${error.message || error}`);
      return;
    }
  }
  try {
    await ffmpeg.exec(["-hide_banner", "-loglevel", "info", "-i", inputName]);
  } catch (error) {
    appendLog(`分析失败（${entry.displayName}）：${error.message || error}`);
  }
  const logs = ffmpegLogBuffer.slice(startIndex).map((item) => item.message || "").join("\n");
  const info = parseProbeLog(logs);
  entry.analysis = {
    container: originalExt,
    audioCodec: info.audioCodec,
    videoCodec: info.videoCodec,
    hasAudio: info.hasAudio,
    hasVideo: info.hasVideo || entry.type === "video",
    width: info.width,
    height: info.height,
    frameRate: info.frameRate,
    duration: info.duration,
    bitrate: info.bitrate,
    metadata: info.metadata || {},
  };
};

const analyzeSelectedFiles = async ({ append = false } = {}) => {
  if (!state.selectedFiles.length || isAnalyzing) return;
  isAnalyzing = true;
  convertBtn.disabled = true;
  clearLog();
  resetProgress();
  setStatus(append ? "正在初始化新增文件..." : "正在初始化...");
  if (fileInput) {
    fileInput.disabled = true;
  }

  try {
    await loadFFmpeg();
    await cleanupTempFiles();
    setStatus("正在扫描文件...");
    const newEntries = await gatherMediaEntries(state.selectedFiles, currentMode);
    if (!newEntries.length) {
      const label = currentMode === MODES.VIDEO ? "视频" : "音频";
      setStatus(append ? `未找到新的${label}文件` : `未找到可用的${label}文件`);
      state.selectedFiles = [];
      updateFileInfo();
      updateClearButtonState();
      updateFileInputForMode({ resetValue: true });
      if (!append && !state.mediaEntries.length) {
        analysisBody.innerHTML = "";
        analysisSummary.textContent = "";
        analysisSection.hidden = true;
        configSection.hidden = true;
        state.config = null;
      } else if (state.mediaEntries.length) {
        convertBtn.disabled = false;
      }
      return;
    }

    const existingCount = append ? state.mediaEntries.length : 0;
    newEntries.forEach((entry, index) => {
      entry.originalIndex = existingCount + index;
    });

    ensureUniqueDisplayNames(append ? state.mediaEntries : [], newEntries);

    setStatus("正在分析编码信息...");
    for (let i = 0; i < newEntries.length; i += 1) {
      setStatus(`分析文件 ${i + 1}/${newEntries.length}：${shortenLabel(newEntries[i].displayName)}`);
      await analyzeEntry(newEntries[i], existingCount + i);
      updateProgress(((i + 1) / newEntries.length) * 100 * 0.6);
    }

    state.mediaEntries = append ? state.mediaEntries.concat(newEntries) : newEntries;
    recalculateEntryFlags();

    state.selectedFiles = [];
    updateFileInfo();
    updateClearButtonState();
    updateFileInputForMode({ resetValue: true });

    buildAnalysisTable(state.mediaEntries);
    const shouldRestoreConfig = append && Boolean(state.config);
    prepareConfiguration({ restoreConfig: shouldRestoreConfig });
    state.config = captureConfigState();
    setStatus(append ? "新增文件分析完成" : "分析完成，可调整转换设置");
    convertBtn.disabled = false;
  } catch (error) {
    console.error(error);
    appendLog(`错误：${error.message || error}`);
    setStatus("分析失败，请重试");
  } finally {
    isAnalyzing = false;
    if (fileInput) {
      fileInput.disabled = false;
    }
    updateSortIndicators();
  }
};

const buildAnalysisTable = (entries) => {
  analysisBody.innerHTML = "";
  if (!entries.length) {
    analysisSummary.textContent = "";
    analysisSection.hidden = true;
    updateSortIndicators();
    return;
  }

  analysisSection.dataset.mode = currentMode;

  let audioCount = 0;
  let videoCount = 0;
  let totalSize = 0;

  const sortedEntries = sortEntriesForDisplay(entries);
  const fragment = document.createDocumentFragment();

  const createCell = (text, className) => {
    const cell = document.createElement("td");
    if (className) {
      if (Array.isArray(className)) {
        cell.classList.add(...className);
      } else {
        cell.classList.add(className);
      }
    }
    cell.textContent = text ?? "";
    return cell;
  };

  for (const entry of sortedEntries) {
    const tr = document.createElement("tr");
    const { analysis = {} } = entry;
    const { width, height, frameRate, container, videoCodec, audioCodec, hasAudio } = analysis;

    tr.appendChild(createCell(entry.displayName));
    tr.appendChild(createCell(entry.type === "video" ? "视频" : "音频"));

    const size = entry.file?.size ?? 0;
    totalSize += size;
    tr.appendChild(createCell(formatBytes(size), "analysis-size"));

    tr.appendChild(createCell(formatDateTime(entry.uploadedAt), "analysis-time"));
    tr.appendChild(createCell(formatDateTime(entry.createdAt), "analysis-time"));

    tr.appendChild(createCell(container ? `.${container}` : "未知"));

    const resolutionLabel =
      entry.type === "video"
        ? width && height
          ? `${width}×${height}`
          : "未知"
        : "-";
    tr.appendChild(createCell(resolutionLabel, "column-video-only"));

    let frameRateLabel = "-";
    if (entry.type === "video") {
      frameRateLabel = frameRate
        ? `${frameRate % 1 === 0 ? frameRate.toFixed(0) : frameRate.toFixed(2)} fps`
        : "未知";
    }
    tr.appendChild(createCell(frameRateLabel, "column-video-only"));

    const videoCodecLabel = entry.type === "video" ? videoCodec || "未检测到" : "-";
    tr.appendChild(createCell(videoCodecLabel));

    const audioCodecLabel = audioCodec ? audioCodec : hasAudio ? "未知" : "未检测到";
    tr.appendChild(createCell(audioCodecLabel));

    const actionsCell = document.createElement("td");
    actionsCell.classList.add("analysis-actions");

    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.classList.add("detail-button", "analysis-action-button");
    detailButton.textContent = "详情";
    detailButton.dataset.entryId = String(entry.id);
    detailButton.setAttribute("aria-label", `查看 ${entry.displayName} 的详细信息`);
    actionsCell.appendChild(detailButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.classList.add("delete-button", "analysis-action-button");
    deleteButton.textContent = "删除";
    deleteButton.dataset.entryId = String(entry.id);
    deleteButton.setAttribute("aria-label", `从列表移除 ${entry.displayName}`);
    actionsCell.appendChild(deleteButton);

    tr.appendChild(actionsCell);
    fragment.appendChild(tr);

    if (entry.type === "audio") audioCount += 1;
    if (entry.type === "video") videoCount += 1;
  }

  analysisBody.appendChild(fragment);

  const summaryParts = [];
  if (audioCount) summaryParts.push(`${audioCount} 个音频文件`);
  if (videoCount) summaryParts.push(`${videoCount} 个视频文件`);
  if (totalSize) summaryParts.push(`总大小 ${formatBytes(totalSize)}`);
  analysisSummary.textContent = summaryParts.length ? `共检测到 ${summaryParts.join("、")}` : "";

  analysisSection.hidden = false;
  updateSortIndicators();
};

const removeEntryById = (entryId) => {
  if (!entryId) return;
  if (isAnalyzing) {
    setStatus("正在分析文件，请稍候再删除");
    return;
  }
  const index = state.mediaEntries.findIndex((entry) => String(entry.id) === String(entryId));
  if (index === -1) return;
  const [removed] = state.mediaEntries.splice(index, 1);
  if (removed?.inputName && trackedTempFiles.has(removed.inputName)) {
    ffmpeg.deleteFile?.(removed.inputName).catch(() => {});
    releaseTempFile(removed.inputName);
  }
  state.mediaEntries.forEach((entry, idx) => {
    if (entry) {
      entry.originalIndex = idx;
    }
  });
  recalculateEntryFlags();
  clearResults(state);

  if (state.mediaEntries.length) {
    buildAnalysisTable(state.mediaEntries);
    prepareConfiguration({ restoreConfig: Boolean(state.config) });
    state.config = captureConfigState();
    convertBtn.disabled = false;
    const removedLabel = shortenLabel(removed?.displayName || "选定文件");
    setStatus(`已移除 ${removedLabel}`);
  } else {
    analysisBody.innerHTML = "";
    analysisSummary.textContent = "";
    analysisSection.hidden = true;
    configSection.hidden = true;
    state.config = null;
    convertBtn.disabled = true;
    setStatus("已移除所有文件，等待操作");
  }

  updateFileInfo();
  updateClearButtonState();
  updateSortIndicators();
};

const closeDetailModal = () => {
  if (!detailModal) return;
  detailModal.classList.remove("is-visible");
  detailModal.setAttribute("hidden", "");
  if (detailModalContent) {
    detailModalContent.innerHTML = "";
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    try {
      lastFocusedElement.focus();
    } catch (error) {
      // ignore focus restoration errors
    }
  }
  lastFocusedElement = null;
};

const openDetailModal = (entry) => {
  if (!entry || !detailModal || !detailModalContent || !detailModalDialog) return;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  detailModalContent.innerHTML = "";
  detailModal.removeAttribute("hidden");
  detailModal.classList.add("is-visible");

  if (detailModalTitle) {
    detailModalTitle.textContent = entry.displayName || "文件详情";
  }

  const detailList = document.createElement("dl");
  detailList.classList.add("detail-list");

  const appendRow = (label, value, { skipIfEmpty = false } = {}) => {
    const normalized = value !== undefined && value !== null ? String(value) : "";
    if (skipIfEmpty && !normalized) {
      return;
    }
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = normalized || "未知";
    detailList.appendChild(dt);
    detailList.appendChild(dd);
  };

  appendRow("来源路径", entry.displayName || entry.file?.name || "");
  if (entry.file?.name && entry.file.name !== entry.displayName) {
    appendRow("原始文件名", entry.file.name, { skipIfEmpty: true });
  }
  appendRow("媒体类型", entry.type === "video" ? "视频" : "音频");
  appendRow("上传时间", formatDateTime(entry.uploadedAt));
  appendRow("文件创建时间", formatDateTime(entry.createdAt));
  appendRow("文件大小", formatBytes(entry.file?.size ?? 0));
  appendRow("MIME 类型", entry.file?.type || "", { skipIfEmpty: true });
  appendRow(
    "容器格式",
    entry.analysis?.container ? `.${entry.analysis.container}` : entry.ext ? `.${entry.ext}` : ""
  );

  const metadata = entry.analysis?.metadata || {};
  const pickMetadataValue = (...keys) => {
    for (const key of keys) {
      const value = normalizeMetadataValue(metadata[key]);
      if (value) {
        return value;
      }
    }
    return "";
  };
  if (metadata.creation_time) {
    appendRow("媒体创建时间", formatMetadataDate(metadata.creation_time), { skipIfEmpty: true });
  }
  appendRow("媒体时长", formatDuration(entry.analysis?.duration));
  appendRow("整体码率", formatBitrate(entry.analysis?.bitrate));
  appendRow("专辑", pickMetadataValue("album", "album_artist", "albumartist", "alb"), {
    skipIfEmpty: true,
  });
  appendRow(
    "艺术家",
    pickMetadataValue(
      "artist",
      "performer",
      "author",
      "album_artist",
      "albumartist",
      "composer",
    ),
    { skipIfEmpty: true },
  );

  if (entry.type === "video" || entry.analysis?.hasVideo) {
    const resolution =
      entry.analysis?.width && entry.analysis?.height
        ? `${entry.analysis.width}×${entry.analysis.height}`
        : "";
    appendRow("视频分辨率", resolution);
    appendRow("视频帧率", entry.analysis?.frameRate ? formatFrameRate(entry.analysis.frameRate) : "");
  }

  const videoCodecValue =
    entry.type === "video"
      ? entry.analysis?.videoCodec || "未检测到"
      : entry.analysis?.hasVideo
      ? entry.analysis?.videoCodec || "未知"
      : "不适用";
  appendRow("视频编码", videoCodecValue);

  const audioCodecValue = entry.analysis?.audioCodec
    ? entry.analysis.audioCodec
    : entry.analysis?.hasAudio
    ? "未知"
    : "未检测到";
  appendRow("音频编码", audioCodecValue);

  appendRow("包含音频轨道", entry.analysis?.hasAudio ? "是" : "否");
  appendRow("包含视频轨道", entry.analysis?.hasVideo ? "是" : "否");

  detailModalContent.appendChild(detailList);

  setTimeout(() => {
    try {
      detailModalDialog.focus({ preventScroll: true });
    } catch (error) {
      // ignore focus errors
    }
  }, 0);
};

const populateSelect = (select, options, { includeCopyForAny = false } = {}) => {
  select.innerHTML = "";
  if (!options || !options.length) {
    const option = document.createElement("option");
    option.value = "copy";
    option.textContent = "不转换";
    select.appendChild(option);
    return;
  }
  for (const optionInfo of options) {
    const option = document.createElement("option");
    option.value = optionInfo.value;
    option.textContent = optionInfo.label;
    select.appendChild(option);
  }
  if (includeCopyForAny) {
    const option = document.createElement("option");
    option.value = "copy";
    option.textContent = "不转换";
    select.appendChild(option);
  }
};

const getAudioContainerByValue = (value) => audioContainers.find((item) => item.value === value);
const getVideoContainerByValue = (value) => videoContainers.find((item) => item.value === value);

const shouldHideAudioContainerGroup = () =>
  currentMode === MODES.VIDEO || (state.hasVideoEntries && !state.hasAudioEntries);

const prepareAudioSelects = () => {
  if (!state.hasAudioEntries && !state.videoEntriesWithAudio) {
    audioOptions.hidden = true;
    toggleFieldVisibility(audioContainerGroup, true);
    return;
  }
  audioOptions.hidden = false;

  const hideContainerGroup = shouldHideAudioContainerGroup();
  toggleFieldVisibility(audioContainerGroup, hideContainerGroup);

  if (!hideContainerGroup) {
    populateSelect(audioContainerSelect, audioContainers);
    const defaultContainer = audioContainers[0]?.value;
    if (defaultContainer) {
      audioContainerSelect.value = defaultContainer;
    }
  }

  updateAudioCodecOptions();
};

const prepareVideoSelects = () => {
  if (currentMode !== MODES.VIDEO || !state.hasVideoEntries) {
    videoOptions.hidden = true;
    return;
  }
  videoOptions.hidden = false;
  populateSelect(videoContainerSelect, videoContainers);
  const defaultContainer = videoContainers[0]?.value;
  if (defaultContainer) {
    videoContainerSelect.value = defaultContainer;
  }
  updateVideoCodecOptions();
};

const updateAudioCodecOptions = () => {
  const hideContainerGroup = shouldHideAudioContainerGroup();
  toggleFieldVisibility(audioContainerGroup, hideContainerGroup);
  if (hideContainerGroup) {
    const container = getVideoContainerByValue(videoContainerSelect.value) || { audioCodecs: [] };
    populateSelect(audioCodecSelect, container.audioCodecs || []);
    if (container.defaultAudioCodec) {
      audioCodecSelect.value = container.defaultAudioCodec;
    }
    return;
  }

  const containerValue = audioContainerSelect.value;
  const container = getAudioContainerByValue(containerValue) || { codecs: null, defaultCodec: "copy" };
  if (container.codecs === null) {
    populateSelect(audioCodecSelect, []);
    audioCodecSelect.value = "copy";
  } else {
    populateSelect(audioCodecSelect, container.codecs);
    if (container.defaultCodec) {
      audioCodecSelect.value = container.defaultCodec;
    }
  }
};

const updateVideoCodecOptions = () => {
  const containerValue = videoContainerSelect.value;
  const container = getVideoContainerByValue(containerValue) || { videoCodecs: [], audioCodecs: [] };
  populateSelect(videoCodecSelect, container.videoCodecs, { includeCopyForAny: false });
  if (container.defaultVideoCodec) {
    videoCodecSelect.value = container.defaultVideoCodec;
  }
  if (!state.hasAudioEntries) {
    populateSelect(audioCodecSelect, container.audioCodecs || []);
    if (container.defaultAudioCodec) {
      audioCodecSelect.value = container.defaultAudioCodec;
    }
  }
};

const setSelectIfAvailable = (select, value) => {
  if (!select || value === undefined || value === null) return false;
  const exists = Array.from(select.options).some((option) => option.value === value);
  if (exists) {
    select.value = value;
    return true;
  }
  return false;
};

const captureConfigState = () => ({
  preset: presetSelect.value,
  presetContainer: presetContainerSelect.value,
  videoContainer: videoContainerSelect.value,
  videoCodec: videoCodecSelect.value,
  videoQuality: videoQualitySelect.value,
  videoCustomCrf: videoCustomCrf.value,
  videoCustomBitrate: videoCustomBitrate.value,
  audioContainer: audioContainerSelect.value,
  audioCodec: audioCodecSelect.value,
  audioQuality: audioQualitySelect.value,
  audioCustomBitrate: audioCustomBitrate.value,
});

const restoreConfigValues = (config) => {
  if (!config) return;
  setSelectIfAvailable(presetSelect, config.preset);
  applyPresetMode();
  if (!presetContainerGroup.hidden) {
    setSelectIfAvailable(presetContainerSelect, config.presetContainer);
  }
  if (!videoOptions.hidden) {
    setSelectIfAvailable(videoContainerSelect, config.videoContainer);
    updateVideoCodecOptions();
    setSelectIfAvailable(videoCodecSelect, config.videoCodec);
    setSelectIfAvailable(videoQualitySelect, config.videoQuality);
    videoCustomCrf.value = config.videoCustomCrf ?? "";
    videoCustomBitrate.value = config.videoCustomBitrate ?? "";
    updateVideoQualityVisibility();
  } else {
    videoCustomCrf.value = config.videoCustomCrf ?? "";
    videoCustomBitrate.value = config.videoCustomBitrate ?? "";
  }
  if (!audioOptions.hidden) {
    if (!audioContainerGroup.hidden) {
      setSelectIfAvailable(audioContainerSelect, config.audioContainer);
    }
    updateAudioCodecOptions();
    setSelectIfAvailable(audioCodecSelect, config.audioCodec);
    setSelectIfAvailable(audioQualitySelect, config.audioQuality);
    audioCustomBitrate.value = config.audioCustomBitrate ?? "";
    updateAudioQualityVisibility();
  } else {
    audioCustomBitrate.value = config.audioCustomBitrate ?? "";
  }
};

const prepareConfiguration = ({ restoreConfig = true } = {}) => {
  configSection.hidden = false;
  presetSelect.value = "none";
  toggleFieldVisibility(presetContainerGroup, true);
  prepareVideoSelects();
  prepareAudioSelects();
  updateAudioQualityVisibility();
  updateVideoQualityVisibility();
  applyPresetMode();
  if (restoreConfig && state.config) {
    restoreConfigValues(state.config);
  }
  state.config = captureConfigState();
};

const updateAudioQualityVisibility = () => {
  toggleFieldVisibility(audioCustomGroup, audioQualitySelect.value !== "custom");
};

const updateVideoQualityVisibility = () => {
  toggleFieldVisibility(videoCustomGroup, videoQualitySelect.value !== "custom");
};

const applyPresetMode = () => {
  const preset = presetSelect.value;
  if (preset === "none") {
    toggleFieldVisibility(presetContainerGroup, true);
    const allowVideoOptions = currentMode === MODES.VIDEO && state.hasVideoEntries;
    const allowAudioOptions =
      state.hasAudioEntries || state.videoEntriesWithAudio || currentMode === MODES.AUDIO;
    videoOptions.hidden = !allowVideoOptions;
    audioOptions.hidden = !allowAudioOptions;
    if (!videoOptions.hidden) {
      updateVideoCodecOptions();
    }
    if (!audioOptions.hidden) {
      updateAudioCodecOptions();
    }
    updateAudioQualityVisibility();
    updateVideoQualityVisibility();
    return;
  }

  const containerOptions = state.hasVideoEntries ? videoContainers : audioContainers;
  populateSelect(presetContainerSelect, containerOptions);
  if (containerOptions.length) {
    const defaultValue = containerOptions[0]?.value;
    if (defaultValue) {
      presetContainerSelect.value = defaultValue;
    }
    toggleFieldVisibility(presetContainerGroup, false);
  } else {
    toggleFieldVisibility(presetContainerGroup, true);
  }

  videoOptions.hidden = true;
  audioOptions.hidden = true;
};

const getAudioQualitySetting = (qualityValue, codecValue) => {
  if (qualityValue === "lossless") {
    return { mode: "lossless" };
  }
  if (qualityValue === "custom") {
    const bitrate = Number(audioCustomBitrate.value);
    return Number.isFinite(bitrate) && bitrate > 0
      ? { mode: "bitrate", bitrate }
      : { mode: "bitrate", bitrate: audioQualityProfiles.ultra.bitrate };
  }
  const profile = audioQualityProfiles[qualityValue] || audioQualityProfiles.medium;
  return { mode: "bitrate", bitrate: profile.bitrate };
};

const createVideoQualitySettingFromProfile = (profileKey, fallbackKey = "medium") => {
  const profile = videoQualityProfiles[profileKey] || videoQualityProfiles[fallbackKey];
  if (!profile) return null;
  const resolvedPreset = resolvePresetForEnvironment(profile.preset);
  return {
    mode: "crf",
    crf: profile.crf,
    preset: resolvedPreset,
    scaleHeight: profile.scaleHeight,
    presetAdjustedFrom:
      preferFasterVideoPreset && resolvedPreset !== profile.preset ? profile.preset : null,
  };
};

const getVideoQualitySetting = (qualityValue) => {
  if (qualityValue === "lossless") {
    return { mode: "lossless" };
  }
  if (qualityValue === "custom") {
    const crf = Number(videoCustomCrf.value);
    const bitrate = Number(videoCustomBitrate.value);
    return {
      mode: "custom",
      crf: Number.isFinite(crf) ? crf : undefined,
      bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : undefined,
    };
  }
  return (
    createVideoQualitySettingFromProfile(qualityValue) ||
    createVideoQualitySettingFromProfile("medium") || {
      mode: "crf",
      crf: 24,
      preset: resolvePresetForEnvironment("fast"),
      scaleHeight: videoQualityProfiles?.medium?.scaleHeight ?? null,
      presetAdjustedFrom:
        preferFasterVideoPreset && resolvePresetForEnvironment("fast") !== "fast"
          ? "fast"
          : null,
    }
  );
};

const ensureLosslessApplicable = (qualitySetting, targetCodec, sourceCodec) => {
  if (qualitySetting.mode !== "lossless") return qualitySetting;
  if (!targetCodec) return { mode: "lossless" };
  const normalizedTarget = targetCodec.toLowerCase();
  const normalizedSource = (sourceCodec || "").toLowerCase();
  if (normalizedTarget === "copy" || normalizedTarget === normalizedSource || losslessCodecs.has(normalizedTarget)) {
    return { mode: "lossless" };
  }
  return { mode: "bitrate", bitrate: audioQualityProfiles.ultra.bitrate };
};

const buildAudioArgs = (entry, outputName, settings) => {
  const args = ["-y", "-i", entry.inputName];
  if (settings.audioCodec === "copy") {
    args.push("-c:a", "copy");
  } else {
    args.push("-c:a", settings.audioCodec);
    if (settings.audioQuality.mode === "bitrate" && settings.audioQuality.bitrate) {
      args.push("-b:a", `${settings.audioQuality.bitrate}k`);
    }
  }
  args.push("-vn");
  args.push(outputName);
  return args;
};

const applyVideoQualityArgs = (args, codec, quality, analysis = {}, entryLabel = "") => {
  if (codec === "copy") return;
  const labelText = entryLabel ? `（${shortenLabel(entryLabel)}）` : "";

  if (quality.mode === "lossless") {
    if (codec === "libx264") {
      args.push("-preset", "slow", "-crf", "0");
    } else if (codec === "libx265") {
      args.push("-preset", "slow", "-x265-params", "lossless=1");
    } else if (codec === "libvpx-vp9") {
      args.push("-b:v", "0", "-crf", "0");
    } else {
      args.push("-crf", "0");
    }
  } else if (quality.mode === "crf") {
    if (quality.preset) {
      args.push("-preset", quality.preset);
      if (quality.presetAdjustedFrom && !presetAdjustmentNotified) {
        appendLog(
          `检测到移动端或低性能设备，已自动将编码预设从 ${quality.presetAdjustedFrom} 调整为 ${quality.preset} 以提升转换速度。`,
        );
        presetAdjustmentNotified = true;
      }
    }
    args.push("-crf", `${quality.crf}`);
    if (codec === "libvpx-vp9") {
      args.push("-b:v", "0");
    }
  } else if (quality.mode === "custom") {
    if (quality.crf !== undefined) {
      args.push("-crf", `${quality.crf}`);
    }
    if (quality.bitrate !== undefined) {
      args.push("-b:v", `${quality.bitrate}k`);
    }
  }

  if (quality.mode !== "lossless" && quality.scaleHeight && analysis.height && analysis.height > quality.scaleHeight) {
    args.push("-vf", `scale=-2:${quality.scaleHeight}`);
    appendLog(`已自动将${labelText || "当前文件"}分辨率限制为不高于 ${quality.scaleHeight}p 以降低内存占用`);
  }
};

const buildVideoArgs = (entry, outputName, settings) => {
  const args = ["-y", "-i", entry.inputName];
  if (settings.videoCodec === "copy") {
    args.push("-c:v", "copy");
  } else {
    args.push("-c:v", settings.videoCodec);
    if (settings.videoQuality) {
      applyVideoQualityArgs(args, settings.videoCodec, settings.videoQuality, entry.analysis || {}, entry.displayName);
    }
    if (Number.isFinite(DEFAULT_VIDEO_THREADS) && DEFAULT_VIDEO_THREADS > 0) {
      args.push("-threads", `${DEFAULT_VIDEO_THREADS}`);
    }
  }
  if (settings.includeAudio) {
    if (settings.audioCodec === "copy") {
      args.push("-c:a", "copy");
    } else {
      args.push("-c:a", settings.audioCodec);
      if (settings.audioQuality.mode === "bitrate" && settings.audioQuality.bitrate) {
        args.push("-b:a", `${settings.audioQuality.bitrate}k`);
      }
    }
  } else {
    args.push("-an");
  }
  args.push(outputName);
  return args;
};

const prepareConversionSettings = (entry, preset) => {
  const analysis = entry.analysis || {};
  if (preset && preset !== "none") {
    const targetContainer = presetContainerSelect.value;
    if (state.hasVideoEntries) {
      const container = getVideoContainerByValue(targetContainer) || videoContainers[0];
      const videoCodec = container?.defaultVideoCodec || "copy";
      const audioCodec = container?.defaultAudioCodec || "copy";
      return {
        container: targetContainer,
        videoCodec,
        audioCodec,
        audioQuality: ensureLosslessApplicable({ mode: "bitrate", bitrate: audioQualityProfiles[preset]?.bitrate || audioQualityProfiles.medium.bitrate }, audioCodec, analysis.audioCodec),
        videoQuality:
          createVideoQualitySettingFromProfile(preset) ||
          createVideoQualitySettingFromProfile("medium") || {
            mode: "crf",
            crf: 24,
            preset: resolvePresetForEnvironment("fast"),
            scaleHeight: videoQualityProfiles?.medium?.scaleHeight ?? null,
            presetAdjustedFrom:
              preferFasterVideoPreset && resolvePresetForEnvironment("fast") !== "fast"
                ? "fast"
                : null,
          },
      };
    }
    const container = getAudioContainerByValue(targetContainer) || audioContainers[0];
    const audioCodec = container?.defaultCodec || "copy";
    return {
      container: targetContainer,
      audioCodec,
      audioQuality: ensureLosslessApplicable({ mode: "bitrate", bitrate: audioQualityProfiles[preset]?.bitrate || audioQualityProfiles.medium.bitrate }, audioCodec, analysis.audioCodec),
    };
  }

  if (entry.type === "audio") {
    const containerValue = audioContainerSelect.value;
    const container = getAudioContainerByValue(containerValue) || audioContainers[0];
    const audioCodec = audioCodecSelect.value || container?.defaultCodec || "copy";
    const qualityValue = audioQualitySelect.value;
    return {
      container: containerValue,
      audioCodec,
      audioQuality: ensureLosslessApplicable(getAudioQualitySetting(qualityValue, audioCodec), audioCodec, analysis.audioCodec),
    };
  }

  const containerValue = videoContainerSelect.value;
  const container = getVideoContainerByValue(containerValue) || videoContainers[0];
  const videoCodec = videoCodecSelect.value || container?.defaultVideoCodec || "copy";
  const useAudioOptionsForVideo = !state.hasAudioEntries;
  const audioCodec = useAudioOptionsForVideo
    ? audioCodecSelect.value || container?.defaultAudioCodec || "copy"
    : container?.defaultAudioCodec || "copy";
  const videoQuality = getVideoQualitySetting(videoQualitySelect.value);
  const audioQuality = useAudioOptionsForVideo
    ? ensureLosslessApplicable(getAudioQualitySetting(audioQualitySelect.value, audioCodec), audioCodec, analysis.audioCodec)
    : ensureLosslessApplicable({ mode: "bitrate", bitrate: audioQualityProfiles.medium.bitrate }, audioCodec, analysis.audioCodec);
  return {
    container: containerValue,
    videoCodec,
    audioCodec,
    videoQuality,
    audioQuality,
  };
};

const convertEntries = async () => {
  if (!state.mediaEntries.length) return;
  convertBtn.disabled = true;
  resetProgress();
  clearResults(state);
  setStatus("准备转换...");

  const results = [];

  try {
    await loadFFmpeg();
    conversionProgress.total = state.mediaEntries.length;
    if (!configSection.hidden) {
      state.config = captureConfigState();
    }
    for (let i = 0; i < state.mediaEntries.length; i += 1) {
      const entry = state.mediaEntries[i];
      const analysis = entry.analysis || {};
      const preset = presetSelect.value;
      const settings = prepareConversionSettings(entry, preset);
      const baseName = sanitizeName(getBaseName(getDisplayLabel(entry.displayName))) || `media_${i + 1}`;
      const targetContainer = settings.container || analysis.container || entry.ext || (entry.type === "video" ? "mp4" : "mka");
      const outputName = `${baseName}.${targetContainer}`;
      let inputName = entry.inputName;
      if (!inputName) {
        inputName = sanitizeName(`source_${i}.${analysis.container || entry.ext || "dat"}`);
        entry.inputName = inputName;
      }

      if (!trackedTempFiles.has(inputName)) {
        appendLog(`写入临时文件：${inputName}`);
        await ffmpeg.writeFile(inputName, await fetchFile(entry.file));
        trackTempFile(inputName);
      } else {
        appendLog(`复用缓存文件：${inputName}`);
      }

      const displayLabel = shortenLabel(entry.displayName);
      conversionProgress.currentIndex = i;
      conversionProgress.startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
      conversionProgress.label = displayLabel;

      const args = entry.type === "audio"
        ? buildAudioArgs({ ...entry, inputName }, outputName, {
            audioCodec: settings.audioCodec,
            audioQuality: settings.audioQuality,
          })
        : buildVideoArgs({ ...entry, inputName }, outputName, {
            videoCodec: settings.videoCodec,
            audioCodec: settings.audioCodec,
            audioQuality: settings.audioQuality,
            videoQuality: settings.videoQuality,
            includeAudio: Boolean(analysis.hasAudio),
          });

      appendLog(`执行命令：ffmpeg ${args.join(" ")}`);
      setStatus(`正在转换 ${i + 1}/${state.mediaEntries.length}：${displayLabel}`);
      let exitCode = 0;
      try {
        exitCode = await ffmpeg.exec(args);
        if (exitCode === 0) {
          const data = await ffmpeg.readFile(outputName);
          results.push({
            name: outputName,
            data,
          });
        } else {
          appendLog(`转换失败（${entry.displayName}），返回码 ${exitCode}`);
          if (exitCode === -1) {
            appendLog("可能由于浏览器内存不足导致失败，请尝试降低视频质量或选择分辨率更低的预设后重试");
          }
        }
      } finally {
        conversionProgress.startTime = null;
        try {
          await ffmpeg.deleteFile?.(outputName);
        } catch (error) {
          appendLog(`清理输出失败：${error.message || error}`);
        }
      }

      const overallProgress = ((i + 1) / conversionProgress.total) * 100;
      updateProgress(overallProgress);
      setStatus(`已完成 ${i + 1}/${state.mediaEntries.length}：${displayLabel}`);
    }
    conversionProgress.startTime = null;
    conversionProgress.total = 0;
    conversionProgress.currentIndex = 0;
    conversionProgress.label = "";
  } catch (error) {
    console.error(error);
    appendLog(`转换过程中出错：${error.message || error}`);
    conversionProgress.total = 0;
    conversionProgress.startTime = null;
    conversionProgress.label = "";
    conversionProgress.currentIndex = 0;
    setStatus("转换失败，请检查日志");
    convertBtn.disabled = false;
    return;
  }

  if (!results.length) {
    setStatus("未生成任何输出文件");
    convertBtn.disabled = false;
    return;
  }

  state.results = results;
  renderResults(state);
  setStatus("转换完成，可下载结果");
  convertBtn.disabled = false;
};

const renderResults = (modeState = state) => {
  revokeObjectUrls();
  resultSummary.textContent = "";
  downloadList.innerHTML = "";
  downloadAllBtn.hidden = true;
  resultSection.hidden = true;

  if (!modeState || !modeState.results.length) {
    if (!modeState || !modeState.mediaEntries.length) {
      configSection.hidden = true;
    }
    updateClearButtonState();
    return;
  }

  const downloadEntries = [];
  const fragment = document.createDocumentFragment();

  const createBlobFromData = (data) =>
    new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)]);

  for (const result of modeState.results) {
    const blob = createBlobFromData(result.data);
    const url = URL.createObjectURL(blob);
    registerObjectUrl(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.name;
    link.textContent = result.name;
    const sizeSpan = document.createElement("span");
    sizeSpan.className = "download-size";
    sizeSpan.textContent = formatBytes(blob.size);
    link.appendChild(sizeSpan);
    fragment.appendChild(link);
    downloadEntries.push([result.name, result.data]);
  }

  downloadList.appendChild(fragment);

  resultSummary.textContent = `成功生成 ${modeState.results.length} 个文件，可单独下载或打包下载。`;
  downloadAllBtn.hidden = false;
  downloadAllBtn.onclick = () => {
    const zipData = zipSync(Object.fromEntries(downloadEntries));
    const blob = new Blob([zipData], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    registerObjectUrl(url);
    const a = document.createElement("a");
    a.href = url;
    a.download = `converted_${Date.now()}.zip`;
    a.click();
  };

  resultSection.hidden = false;
  updateClearButtonState();
};

const switchMode = (mode) => {
  if (!modeStates[mode] || mode === currentMode) return;
  if (!configSection.hidden && state.mediaEntries.length) {
    state.config = captureConfigState();
  }
  closeDetailModal();
  currentMode = mode;
  state = modeStates[currentMode];
  updateModeTabs();
  updateFileInputForMode({ resetValue: true });
  updateFileInfo();
  if (state.mediaEntries.length) {
    buildAnalysisTable(state.mediaEntries);
    prepareConfiguration({ restoreConfig: true });
    convertBtn.disabled = false;
    if (conversionProgress.total === 0) {
      setStatus("分析结果已加载，可调整转换设置");
    }
  } else {
    analysisBody.innerHTML = "";
    analysisSummary.textContent = "";
    analysisSection.hidden = true;
    configSection.hidden = true;
    convertBtn.disabled = true;
    if (conversionProgress.total === 0) {
      const statusMessage = state.selectedFiles.length
        ? "正在准备分析，请稍候"
        : "等待操作";
      setStatus(statusMessage);
    }
  }
  renderResults(state);
  updateClearButtonState();
  updateSortIndicators();
};

const clearAllUploads = async () => {
  closeDetailModal();
  const activeMode = currentMode;
  resetModeState(MODES.AUDIO);
  resetModeState(MODES.VIDEO);
  currentMode = activeMode;
  state = modeStates[currentMode];
  updateModeTabs();
  updateFileInputForMode({ resetValue: true });
  analysisBody.innerHTML = "";
  analysisSummary.textContent = "";
  analysisSection.hidden = true;
  configSection.hidden = true;
  convertBtn.disabled = true;
  renderResults(state);
  updateFileInfo();
  updateClearButtonState();
  updateSortIndicators();
  setStatus("等待操作");
  if (ffmpegReady) {
    try {
      await cleanupTempFiles();
    } catch (error) {
      console.warn("清空上传文件时清理临时文件出错", error);
    }
    trackedTempFiles.clear();
  }
};

ffmpeg.on("log", ({ type, message }) => {
  if (!message) return;
  ffmpegLogBuffer.push({ type: type ?? "log", message });
  if (ffmpegLogBuffer.length > MAX_LOG_BUFFER) {
    ffmpegLogBuffer.splice(0, ffmpegLogBuffer.length - MAX_LOG_BUFFER);
  }
  appendLog(`[${type ?? "log"}] ${message}`);
});

ffmpeg.on("progress", ({ progress }) => {
  if (!Number.isFinite(progress) || conversionProgress.total === 0) return;
  const normalized = Math.max(0, Math.min(1, progress));
  const percent = normalized * 100;
  const overall = conversionProgress.total
    ? ((conversionProgress.currentIndex + normalized) / conversionProgress.total) * 100
    : percent;
  updateProgress(overall);
  let message = `转换中 ${conversionProgress.currentIndex + 1}/${conversionProgress.total}`;
  if (conversionProgress.label) {
    message += `：${conversionProgress.label}`;
  }
  message += ` ${percent.toFixed(0)}%`;
  if (conversionProgress.startTime !== null) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsedSeconds = (now - conversionProgress.startTime) / 1000;
    if (Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0) {
      message += `（耗时 ${elapsedSeconds.toFixed(1)}s）`;
    }
  }
  setStatus(message);
});

if (analysisBody) {
  analysisBody.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const deleteTarget = event.target.closest(".delete-button");
    if (deleteTarget) {
      const entryId = deleteTarget.dataset.entryId;
      if (entryId) {
        removeEntryById(entryId);
      }
      return;
    }

    const detailTarget = event.target.closest(".detail-button");
    if (!detailTarget) return;
    const entryId = detailTarget.dataset.entryId;
    if (!entryId) return;
    const entry = state.mediaEntries.find((item) => String(item.id) === entryId);
    if (entry) {
      openDetailModal(entry);
    }
  });
}

detailModalClose?.addEventListener("click", () => {
  closeDetailModal();
});

detailModalBackdrop?.addEventListener("click", (event) => {
  if (event.target === detailModalBackdrop) {
    closeDetailModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && detailModal?.classList.contains("is-visible")) {
    event.preventDefault();
    closeDetailModal();
  }
});

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const sortKey = button.dataset.sortKey;
    if (sortKey) {
      applySortForKey(sortKey);
    }
  });
});

presetSelect.addEventListener("change", () => {
  applyPresetMode();
  state.config = captureConfigState();
});

presetContainerSelect.addEventListener("change", () => {
  state.config = captureConfigState();
});

videoContainerSelect.addEventListener("change", () => {
  updateVideoCodecOptions();
  state.config = captureConfigState();
});

videoCodecSelect.addEventListener("change", () => {
  state.config = captureConfigState();
});

audioContainerSelect.addEventListener("change", () => {
  updateAudioCodecOptions();
  state.config = captureConfigState();
});

audioCodecSelect.addEventListener("change", () => {
  state.config = captureConfigState();
});

videoQualitySelect.addEventListener("change", () => {
  updateVideoQualityVisibility();
  state.config = captureConfigState();
});

audioQualitySelect.addEventListener("change", () => {
  updateAudioQualityVisibility();
  state.config = captureConfigState();
});

[videoCustomCrf, videoCustomBitrate, audioCustomBitrate].forEach((input) => {
  input?.addEventListener("input", () => {
    state.config = captureConfigState();
  });
});

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.mode;
    if (mode) {
      switchMode(mode);
    }
  });
});

clearBtn?.addEventListener("click", () => {
  clearAllUploads();
});

convertBtn.addEventListener("click", () => {
  if (!state.mediaEntries.length) return;
  convertEntries();
});

registerFileInputListeners(fileInput);

dropZone.addEventListener("dragover", (event) => {
  if (isAnalyzing) return;
  event.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  if (isAnalyzing) {
    setStatus("正在分析当前文件，请稍候再上传新文件");
    return;
  }
  const files = event.dataTransfer?.files;
  if (files && files.length) {
    selectFiles(Array.from(files));
  }
});

window.addEventListener("beforeunload", () => {
  revokeObjectUrls();
  if (ffmpegReady) {
    cleanupTempFiles();
  }
});

updateModeTabs();
updateFileInputForMode();
updateFileInfo();
updateClearButtonState();
updateSortIndicators();
renderResults(state);

analysisSection.hidden = true;
configSection.hidden = true;
updateAudioQualityVisibility();
updateVideoQualityVisibility();

setStatus("等待操作");
