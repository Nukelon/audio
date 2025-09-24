import { FFmpeg } from "./vendor/ffmpeg/classes.js";
import { fetchFile } from "./vendor/util/index.js";
import { unzipSync, zipSync } from "./vendor/fflate.min.js";

const dropZone = document.getElementById("drop-zone");
let fileInput = document.getElementById("file-input");
const analyzeBtn = document.getElementById("analyze-btn");
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
const sabSupportIndicator = document.getElementById("sab-support-indicator");

const analysisSection = document.getElementById("analysis-section");
const analysisBody = document.getElementById("analysis-body");
const analysisSummary = document.getElementById("analysis-summary");
const configSection = document.getElementById("config-section");

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

const audioMimeTypes = [
  "audio/*",
  "audio/aac",
  "audio/x-aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/flac",
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

const isIOSDevice =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const iosAudioUniformTypes = [
  "public.audio",
  "public.mpeg-4-audio",
  "org.matroska.audio",
];
const iosVideoUniformTypes = [
  "public.movie",
  "public.video",
  "org.matroska.mkv",
  "org.matroska.video",
  "org.webmproject.webm",
  "com.apple.quicktime-movie",
];
const iosZipUniformTypes = ["com.pkware.zip-archive", "public.zip-archive"];

const supportsSharedArrayBuffer =
  typeof globalThis !== "undefined" &&
  typeof globalThis.SharedArrayBuffer === "function";
const supportsThreading = supportsSharedArrayBuffer && typeof Atomics === "object";
const DEFAULT_AUDIO_THREADS = supportsThreading && !isIOSDevice ? 2 : 1;
const DEFAULT_VIDEO_THREADS = supportsThreading ? 2 : 1;

function updateSharedArrayBufferIndicator() {
  if (!sabSupportIndicator) return;

  if (supportsSharedArrayBuffer) {
    const threadMessage = isIOSDevice
      ? "检测到 iOS 设备，为保证兼容性将使用单线程编码。"
      : "已启用多线程编码，可获得更快的转换速度。";
    sabSupportIndicator.innerHTML =
      "<strong>SharedArrayBuffer 支持：</strong>可用。" + threadMessage;
  } else {
    sabSupportIndicator.innerHTML =
      "<strong>SharedArrayBuffer 支持：</strong>不可用。已自动切换到单线程编码模式，以兼容当前浏览器环境（如 iOS Safari）。";
  }
}

updateSharedArrayBufferIndicator();

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

const buildAcceptList = (baseList, iosSpecific = []) => {
  const items = new Set(baseList);
  if (isIOSDevice) {
    iosZipUniformTypes.forEach((type) => items.add(type));
    iosSpecific.forEach((type) => items.add(type));
  }
  return Array.from(items).join(",");
};

const getAcceptTypesForMode = (mode) =>
  mode === MODES.AUDIO
    ? buildAcceptList(baseAudioAcceptList, iosAudioUniformTypes)
    : buildAcceptList(baseVideoAcceptList, iosVideoUniformTypes);

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

const joinLabel = (...parts) => parts.filter(Boolean).join("/").replace(/\\/g, "/");

const isZipFile = (name = "") => /\.zip$/i.test(name);

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

const updateAnalyzeAndClearState = () => {
  analyzeBtn.disabled = state.selectedFiles.length === 0;
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

const selectFiles = (files = []) => {
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

  state.selectedFiles = validFiles;
  state.mediaEntries = [];
  state.hasVideoEntries = false;
  state.hasAudioEntries = false;
  state.videoEntriesWithAudio = false;
  state.results = [];
  state.config = null;
  if (validFiles.length === 0) {
    try {
      fileInput.value = "";
    } catch (error) {
      // ignore inability to reset programmatically
    }
  }
  if (ffmpegReady) {
    cleanupTempFiles().catch((error) => {
      console.warn("清理临时文件时出错", error);
    });
  }
  analysisBody.innerHTML = "";
  analysisSummary.textContent = "";
  analysisSection.hidden = true;
  configSection.hidden = true;
  convertBtn.disabled = true;
  clearResults(state);
  updateFileInfo();
  updateAnalyzeAndClearState();
  if (state.selectedFiles.length === 0) {
    if (rejectedCount > 0) {
      const expectedLabel = currentMode === MODES.AUDIO ? "音频" : "视频";
      setStatus(`已忽略 ${rejectedCount} 个非${expectedLabel}文件`);
    } else {
      setStatus(state.mediaEntries.length ? "已加载分析结果，可直接转换" : "等待操作");
    }
    return;
  }
  if (rejectedCount > 0) {
    const expectedLabel = currentMode === MODES.AUDIO ? "音频" : "视频";
    setStatus(`已忽略 ${rejectedCount} 个非${expectedLabel}文件，其他文件可继续分析`);
  } else {
    setStatus("准备就绪，点击分析文件以继续");
  }
};

const gatherMediaEntries = async (files, mode) => {
  const entries = [];
  for (const file of files) {
    const label = file.webkitRelativePath || file.name;
    await collectFromEntry(file, label, entries, mode);
  }
  return entries;
};

const collectFromEntry = async (file, label, entries, mode) => {
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
        const nestedFile = new File([data], entryName, { type: "application/zip" });
        await collectFromEntry(nestedFile, fullLabel, entries, mode);
      } else {
        const virtualFile = new File([data], entryName);
        if (shouldIncludeFileForMode(virtualFile, mode)) {
          entries.push({
            file: virtualFile,
            displayName: fullLabel,
            ext: getExtension(entryName),
            type: mode === MODES.VIDEO ? "video" : "audio",
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
    entries.push({
      file,
      displayName: label,
      ext: getExtension(file.name || file.webkitRelativePath || ""),
      type: mode === MODES.VIDEO ? "video" : "audio",
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
  return {
    audioCodec: audioMatches.length ? audioMatches[0] : null,
    videoCodec: videoMatches.length ? videoMatches[0] : null,
    hasAudio: audioMatches.length > 0,
    hasVideo: videoMatches.length > 0,
    width: resolutionMatch ? Number(resolutionMatch[1]) : null,
    height: resolutionMatch ? Number(resolutionMatch[2]) : null,
    frameRate: frameRateMatch ? Number(frameRateMatch[1]) : null,
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
  };
};

const analyzeSelectedFiles = async () => {
  if (!state.selectedFiles.length) return;
  analyzeBtn.disabled = true;
  convertBtn.disabled = true;
  clearLog();
  clearResults(state);
  resetProgress();
  setStatus("正在初始化...");

  try {
    await loadFFmpeg();
    await cleanupTempFiles();
    setStatus("正在扫描文件...");
    const entries = await gatherMediaEntries(state.selectedFiles, currentMode);
    if (!entries.length) {
      setStatus(`未找到可用的${currentMode === MODES.VIDEO ? "视频" : "音频"}文件`);
      analysisSection.hidden = true;
      configSection.hidden = true;
      state.selectedFiles = [];
      updateFileInfo();
      updateAnalyzeAndClearState();
      updateFileInputForMode({ resetValue: true });
      return;
    }

    state.mediaEntries = entries;
    state.hasVideoEntries = entries.some((entry) => entry.type === "video");
    state.hasAudioEntries = entries.some((entry) => entry.type === "audio");

    setStatus("正在分析编码信息...");
    for (let i = 0; i < entries.length; i += 1) {
      setStatus(`分析文件 ${i + 1}/${entries.length}：${shortenLabel(entries[i].displayName)}`);
      await analyzeEntry(entries[i], i);
      updateProgress(((i + 1) / entries.length) * 100 * 0.6);
    }

    const videoEntries = entries.filter((entry) => entry.type === "video");
    state.videoEntriesWithAudio = videoEntries.some((entry) => entry.analysis?.hasAudio);

    state.selectedFiles = [];
    updateFileInfo();
    updateAnalyzeAndClearState();
    updateFileInputForMode({ resetValue: true });

    buildAnalysisTable(entries);
    prepareConfiguration({ restoreConfig: false });
    state.config = captureConfigState();
    setStatus("分析完成，可调整转换设置");
    convertBtn.disabled = false;
  } catch (error) {
    console.error(error);
    appendLog(`错误：${error.message || error}`);
    setStatus("分析失败，请重试");
  } finally {
    analyzeBtn.disabled = state.selectedFiles.length === 0;
  }
};

const buildAnalysisTable = (entries) => {
  analysisBody.innerHTML = "";
  if (!entries.length) {
    analysisSummary.textContent = "";
    analysisSection.hidden = true;
    return;
  }

  analysisSection.dataset.mode = currentMode;

  let audioCount = 0;
  let videoCount = 0;
  let totalSize = 0;

  for (const entry of entries) {
    const tr = document.createElement("tr");
    const labelCell = document.createElement("td");
    labelCell.textContent = entry.displayName;
    tr.appendChild(labelCell);

    const typeCell = document.createElement("td");
    const typeLabel = entry.type === "video" ? "视频" : "音频";
    typeCell.textContent = typeLabel;
    tr.appendChild(typeCell);

    const sizeCell = document.createElement("td");
    const size = entry.file?.size ?? 0;
    sizeCell.textContent = formatBytes(size);
    sizeCell.classList.add("analysis-size");
    tr.appendChild(sizeCell);
    totalSize += size;

    const containerCell = document.createElement("td");
    containerCell.textContent = entry.analysis?.container ? `.${entry.analysis.container}` : "未知";
    tr.appendChild(containerCell);

    const resolutionCell = document.createElement("td");
    resolutionCell.classList.add("column-video-only");
    if (entry.type === "video") {
      if (entry.analysis?.width && entry.analysis?.height) {
        resolutionCell.textContent = `${entry.analysis.width}×${entry.analysis.height}`;
      } else {
        resolutionCell.textContent = "未知";
      }
    } else {
      resolutionCell.textContent = "-";
    }
    tr.appendChild(resolutionCell);

    const frameRateCell = document.createElement("td");
    frameRateCell.classList.add("column-video-only");
    if (entry.type === "video") {
      if (entry.analysis?.frameRate) {
        const frameRate = entry.analysis.frameRate;
        frameRateCell.textContent = `${frameRate % 1 === 0 ? frameRate.toFixed(0) : frameRate.toFixed(2)} fps`;
      } else {
        frameRateCell.textContent = "未知";
      }
    } else {
      frameRateCell.textContent = "-";
    }
    tr.appendChild(frameRateCell);

    const videoCodecCell = document.createElement("td");
    videoCodecCell.classList.add("column-video-only");
    videoCodecCell.textContent = entry.analysis?.videoCodec || (entry.type === "video" ? "未检测到" : "-");
    tr.appendChild(videoCodecCell);

    const audioCodecCell = document.createElement("td");
    audioCodecCell.textContent = entry.analysis?.audioCodec || (entry.analysis?.hasAudio ? "未知" : "-");
    tr.appendChild(audioCodecCell);

    analysisBody.appendChild(tr);

    if (entry.type === "audio") audioCount += 1;
    if (entry.type === "video") videoCount += 1;
  }

  const summaryParts = [];
  if (audioCount) summaryParts.push(`${audioCount} 个音频文件`);
  if (videoCount) summaryParts.push(`${videoCount} 个视频文件`);
  if (totalSize) summaryParts.push(`总大小 ${formatBytes(totalSize)}`);
  analysisSummary.textContent = summaryParts.length ? `共检测到 ${summaryParts.join("、")}` : "";

  analysisSection.hidden = false;
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
  const profile = videoQualityProfiles[qualityValue] || videoQualityProfiles.medium;
  return {
    mode: "crf",
    crf: profile.crf,
    preset: profile.preset,
    scaleHeight: profile.scaleHeight,
  };
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

const applyAudioEncodingArgs = (args, codec, quality) => {
  if (codec === "copy") {
    args.push("-c:a", "copy");
    return;
  }

  args.push("-c:a", codec);
  if (quality?.mode === "bitrate" && quality.bitrate) {
    args.push("-b:a", `${quality.bitrate}k`);
  }

  if (codec === "libopus") {
    args.push("-application", "audio");
  }

  if (Number.isFinite(DEFAULT_AUDIO_THREADS) && DEFAULT_AUDIO_THREADS > 0) {
    args.push("-threads:a", `${DEFAULT_AUDIO_THREADS}`);
  }
};

const buildAudioArgs = (entry, outputName, settings) => {
  const args = ["-y", "-i", entry.inputName];
  applyAudioEncodingArgs(args, settings.audioCodec, settings.audioQuality);
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
    applyAudioEncodingArgs(args, settings.audioCodec, settings.audioQuality);
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
        videoQuality: videoQualityProfiles[preset]
          ? {
              mode: "crf",
              crf: videoQualityProfiles[preset].crf,
              preset: videoQualityProfiles[preset].preset,
              scaleHeight: videoQualityProfiles[preset].scaleHeight,
            }
          : {
              mode: "crf",
              crf: 24,
              preset: "fast",
              scaleHeight: videoQualityProfiles.medium.scaleHeight,
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
    updateAnalyzeAndClearState();
    return;
  }

  const downloadEntries = [];
  for (const result of modeState.results) {
    const blob = new Blob([
      result.data.buffer.slice(result.data.byteOffset, result.data.byteOffset + result.data.byteLength),
    ]);
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
    downloadList.appendChild(link);
    downloadEntries.push([result.name, result.data]);
  }

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
  updateAnalyzeAndClearState();
};

const switchMode = (mode) => {
  if (!modeStates[mode] || mode === currentMode) return;
  if (!configSection.hidden && state.mediaEntries.length) {
    state.config = captureConfigState();
  }
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
        ? "准备就绪，点击分析文件以继续"
        : "等待操作";
      setStatus(statusMessage);
    }
  }
  renderResults(state);
  updateAnalyzeAndClearState();
};

const clearAllUploads = async () => {
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
  updateAnalyzeAndClearState();
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

analyzeBtn.addEventListener("click", () => {
  if (!state.selectedFiles.length) return;
  analyzeSelectedFiles();
});

convertBtn.addEventListener("click", () => {
  if (!state.mediaEntries.length) return;
  convertEntries();
});

registerFileInputListeners(fileInput);

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  const files = event.dataTransfer?.files;
  if (files && files.length) {
    try {
      fileInput.files = files;
    } catch (error) {
      // ignore inability to set files programmatically
    }
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
updateAnalyzeAndClearState();
renderResults(state);

analysisSection.hidden = true;
configSection.hidden = true;
updateAudioQualityVisibility();
updateVideoQualityVisibility();

setStatus("等待操作");
