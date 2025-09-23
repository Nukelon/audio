import { FFmpeg } from "./vendor/ffmpeg/classes.js";
import { fetchFile } from "./vendor/util/index.js";
import { unzipSync, zipSync } from "./vendor/fflate.min.js";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
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

const state = {
  selectedFiles: [],
  mediaEntries: [],
  hasVideoEntries: false,
  hasAudioEntries: false,
  videoEntriesWithAudio: false,
};

const currentObjectUrls = [];

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
  ultra: { crf: 18, preset: "slow" },
  high: { crf: 20, preset: "medium" },
  medium: { crf: 24, preset: "fast" },
  low: { crf: 28, preset: "faster" },
  verylow: { crf: 32, preset: "veryfast" },
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

const sanitizeName = (name) => name.replace(/[^\w.\-]+/g, "_");

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

const clearResults = () => {
  revokeObjectUrls();
  resultSummary.textContent = "";
  downloadList.innerHTML = "";
  downloadAllBtn.hidden = true;
  resultSection.hidden = true;
};

const clearLog = () => {
  logOutput.textContent = "";
  ffmpegLogBuffer.length = 0;
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

const setStatus = (message) => {
  statusEl.textContent = message;
};

const updateProgress = (value) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  progressBar.style.width = `${clamped}%`;
};

const resetProgress = () => {
  updateProgress(0);
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
  state.selectedFiles = Array.from(files).filter(Boolean);
  state.mediaEntries = [];
  state.hasVideoEntries = false;
  state.hasAudioEntries = false;
  state.videoEntriesWithAudio = false;
  clearResults();
  analysisSection.hidden = true;
  configSection.hidden = true;
  analyzeBtn.disabled = state.selectedFiles.length === 0;
  convertBtn.disabled = true;
  if (state.selectedFiles.length === 0) {
    fileInfo.textContent = "尚未选择文件";
    setStatus("等待操作");
    return;
  }
  const totalSize = state.selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  fileInfo.textContent = `已选择 ${state.selectedFiles.length} 个文件（总计 ${formatBytes(totalSize)}）`;
  setStatus("准备就绪，点击分析文件以继续");
};

const gatherMediaEntries = async (files) => {
  const entries = [];
  for (const file of files) {
    const label = file.webkitRelativePath || file.name;
    await collectFromEntry(file, label, entries);
  }
  return entries;
};

const collectFromEntry = async (file, label, entries) => {
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
        await collectFromEntry(nestedFile, fullLabel, entries);
      } else {
        const virtualFile = new File([data], entryName);
        if (isVideoFile(virtualFile) || isAudioFile(virtualFile)) {
          entries.push({
            file: virtualFile,
            displayName: fullLabel,
            ext: getExtension(entryName),
            type: isVideoFile(virtualFile) ? "video" : "audio",
          });
        } else {
          appendLog(`压缩包内忽略非媒体文件：${fullLabel}`);
        }
      }
    }
  } else if (isVideoFile(file) || isAudioFile(file)) {
    entries.push({
      file,
      displayName: label,
      ext: getExtension(file.name || file.webkitRelativePath || ""),
      type: isVideoFile(file) ? "video" : "audio",
    });
  } else {
    appendLog(`忽略非媒体文件：${label}`);
  }
};

const parseProbeLog = (log = "") => {
  const audioMatches = [...log.matchAll(/Audio:\s*([^,\s]+)/gi)].map((m) => m[1].toLowerCase());
  const videoMatches = [...log.matchAll(/Video:\s*([^,\s]+)/gi)].map((m) => m[1].toLowerCase());
  return {
    audioCodec: audioMatches.length ? audioMatches[0] : null,
    videoCodec: videoMatches.length ? videoMatches[0] : null,
    hasAudio: audioMatches.length > 0,
    hasVideo: videoMatches.length > 0,
  };
};

const analyzeEntry = async (entry, index) => {
  const originalName = entry.file.name || getDisplayLabel(entry.displayName);
  const originalExt = getExtension(originalName) || entry.ext || "dat";
  const inputName = sanitizeName(`probe_${index}.${originalExt}`);
  const startIndex = ffmpegLogBuffer.length;
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(entry.file));
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
  };
  try {
    await ffmpeg.deleteFile?.(inputName);
  } catch (error) {
    appendLog(`清理临时文件失败：${error.message || error}`);
  }
};

const analyzeSelectedFiles = async () => {
  if (!state.selectedFiles.length) return;
  analyzeBtn.disabled = true;
  convertBtn.disabled = true;
  clearLog();
  clearResults();
  resetProgress();
  setStatus("正在初始化...");

  try {
    await loadFFmpeg();
    setStatus("正在扫描文件...");
    const entries = await gatherMediaEntries(state.selectedFiles);
    if (!entries.length) {
      setStatus("未找到可用的音频或视频文件");
      analysisSection.hidden = true;
      configSection.hidden = true;
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

    buildAnalysisTable(entries);
    prepareConfiguration();
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
  let audioCount = 0;
  let videoCount = 0;
  for (const entry of entries) {
    const tr = document.createElement("tr");
    const labelCell = document.createElement("td");
    labelCell.textContent = entry.displayName;
    tr.appendChild(labelCell);

    const typeCell = document.createElement("td");
    const typeLabel = entry.type === "video" ? "视频" : "音频";
    typeCell.textContent = typeLabel;
    tr.appendChild(typeCell);

    const containerCell = document.createElement("td");
    containerCell.textContent = entry.analysis?.container ? `.${entry.analysis.container}` : "未知";
    tr.appendChild(containerCell);

    const videoCodecCell = document.createElement("td");
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

const prepareAudioSelects = () => {
  if (!state.hasAudioEntries && !state.videoEntriesWithAudio) {
    audioOptions.hidden = true;
    return;
  }
  audioOptions.hidden = false;

  if (state.hasVideoEntries && !state.hasAudioEntries) {
    audioContainerGroup.hidden = true;
  } else {
    audioContainerGroup.hidden = false;
    populateSelect(audioContainerSelect, audioContainers);
    const defaultContainer = audioContainers[0]?.value;
    if (defaultContainer) {
      audioContainerSelect.value = defaultContainer;
    }
  }

  updateAudioCodecOptions();
};

const prepareVideoSelects = () => {
  if (!state.hasVideoEntries) {
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
  if (state.hasVideoEntries && !state.hasAudioEntries) {
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

const prepareConfiguration = () => {
  configSection.hidden = false;
  presetSelect.value = "none";
  presetContainerGroup.hidden = true;
  prepareVideoSelects();
  prepareAudioSelects();
  updateAudioQualityVisibility();
  updateVideoQualityVisibility();
  applyPresetMode();
};

const updateAudioQualityVisibility = () => {
  audioCustomGroup.hidden = audioQualitySelect.value !== "custom";
};

const updateVideoQualityVisibility = () => {
  videoCustomGroup.hidden = videoQualitySelect.value !== "custom";
};

const applyPresetMode = () => {
  const preset = presetSelect.value;
  if (preset === "none") {
    presetContainerGroup.hidden = true;
    videoOptions.hidden = !state.hasVideoEntries;
    audioOptions.hidden = !(state.hasAudioEntries || state.videoEntriesWithAudio);
    updateVideoCodecOptions();
    updateAudioCodecOptions();
    updateAudioQualityVisibility();
    updateVideoQualityVisibility();
    return;
  }

  const containerOptions = state.hasVideoEntries ? videoContainers : audioContainers;
  populateSelect(presetContainerSelect, containerOptions);
  presetContainerGroup.hidden = false;

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
  return { mode: "crf", crf: profile.crf, preset: profile.preset };
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

const applyVideoQualityArgs = (args, codec, quality) => {
  if (codec === "copy") return;
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
    return;
  }
  if (quality.mode === "crf") {
    if (quality.preset) {
      args.push("-preset", quality.preset);
    }
    args.push("-crf", `${quality.crf}`);
    if (codec === "libvpx-vp9") {
      args.push("-b:v", "0");
    }
    return;
  }
  if (quality.mode === "custom") {
    if (quality.crf !== undefined) {
      args.push("-crf", `${quality.crf}`);
    }
    if (quality.bitrate !== undefined) {
      args.push("-b:v", `${quality.bitrate}k`);
    }
  }
};

const buildVideoArgs = (entry, outputName, settings) => {
  const args = ["-y", "-i", entry.inputName];
  if (settings.videoCodec === "copy") {
    args.push("-c:v", "copy");
  } else {
    args.push("-c:v", settings.videoCodec);
    applyVideoQualityArgs(args, settings.videoCodec, settings.videoQuality);
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
        videoQuality: videoQualityProfiles[preset] ? { mode: "crf", crf: videoQualityProfiles[preset].crf, preset: videoQualityProfiles[preset].preset } : { mode: "crf", crf: 24, preset: "fast" },
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
  clearResults();
  setStatus("准备转换...");

  const results = [];

  try {
    await loadFFmpeg();
    for (let i = 0; i < state.mediaEntries.length; i += 1) {
      const entry = state.mediaEntries[i];
      const analysis = entry.analysis || {};
      const preset = presetSelect.value;
      const settings = prepareConversionSettings(entry, preset);
      const baseName = sanitizeName(getBaseName(getDisplayLabel(entry.displayName))) || `media_${i + 1}`;
      const targetContainer = settings.container || analysis.container || entry.ext || (entry.type === "video" ? "mp4" : "mka");
      const outputName = `${baseName}.${targetContainer}`;
      entry.inputName = sanitizeName(`input_${i}.${analysis.container || entry.ext || "dat"}`);

      appendLog(`写入临时文件：${entry.inputName}`);
      await ffmpeg.writeFile(entry.inputName, await fetchFile(entry.file));

      const args = entry.type === "audio"
        ? buildAudioArgs(entry, outputName, {
            audioCodec: settings.audioCodec,
            audioQuality: settings.audioQuality,
          })
        : buildVideoArgs(entry, outputName, {
            videoCodec: settings.videoCodec,
            audioCodec: settings.audioCodec,
            audioQuality: settings.audioQuality,
            videoQuality: settings.videoQuality,
            includeAudio: Boolean(analysis.hasAudio),
          });

      appendLog(`执行命令：ffmpeg ${args.join(" ")}`);
      setStatus(`正在转换 ${i + 1}/${state.mediaEntries.length}：${shortenLabel(entry.displayName)}`);
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
        }
      } finally {
        try {
          await ffmpeg.deleteFile?.(outputName);
        } catch (error) {
          appendLog(`清理输出失败：${error.message || error}`);
        }

        try {
          await ffmpeg.deleteFile?.(entry.inputName);
        } catch (error) {
          appendLog(`清理输入失败：${error.message || error}`);
        }
      }

      updateProgress(((i + 1) / state.mediaEntries.length) * 100);
    }
  } catch (error) {
    console.error(error);
    appendLog(`转换过程中出错：${error.message || error}`);
    setStatus("转换失败，请检查日志");
    convertBtn.disabled = false;
    return;
  }

  if (!results.length) {
    setStatus("未生成任何输出文件");
    return;
  }

  buildDownloadList(results);
  setStatus("转换完成，可下载结果");
  convertBtn.disabled = false;
};

const buildDownloadList = (results) => {
  clearResults();
  const downloadEntries = [];
  for (const result of results) {
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

  resultSummary.textContent = `成功生成 ${results.length} 个文件，可单独下载或打包下载。`;
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
};

ffmpeg.on("log", ({ type, message }) => {
  if (!message) return;
  ffmpegLogBuffer.push({ type: type ?? "log", message });
  if (ffmpegLogBuffer.length > MAX_LOG_BUFFER) {
    ffmpegLogBuffer.splice(0, ffmpegLogBuffer.length - MAX_LOG_BUFFER);
  }
  appendLog(`[${type ?? "log"}] ${message}`);
});

ffmpeg.on("progress", ({ progress, time }) => {
  if (!Number.isFinite(progress)) return;
  const percent = Math.max(0, Math.min(100, progress * 100));
  updateProgress(percent);
  const timeText = Number.isFinite(time) ? `（耗时 ${time.toFixed(1)}s）` : "";
  setStatus(`转换中：${percent.toFixed(0)}%${timeText}`);
});

presetSelect.addEventListener("change", () => {
  applyPresetMode();
});

videoContainerSelect.addEventListener("change", () => {
  updateVideoCodecOptions();
});

audioContainerSelect.addEventListener("change", () => {
  updateAudioCodecOptions();
});

videoQualitySelect.addEventListener("change", () => {
  updateVideoQualityVisibility();
});

audioQualitySelect.addEventListener("change", () => {
  updateAudioQualityVisibility();
});

analyzeBtn.addEventListener("click", () => {
  if (!state.selectedFiles.length) return;
  analyzeSelectedFiles();
});

convertBtn.addEventListener("click", () => {
  if (!state.mediaEntries.length) return;
  convertEntries();
});

fileInput.addEventListener("change", (event) => {
  const { files } = event.target;
  selectFiles(files ? Array.from(files) : []);
});

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
});

setStatus("等待操作");
