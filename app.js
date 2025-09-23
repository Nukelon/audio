import { FFmpeg } from "./vendor/ffmpeg/classes.js";
import { fetchFile } from "./vendor/util/index.js";
import { unzipSync, zipSync } from "./vendor/fflate.min.js";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const convertBtn = document.getElementById("convert-btn");
const fileInfo = document.getElementById("file-info");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progress-bar");
const logOutput = document.getElementById("log-output");
const resultSection = document.getElementById("result");
const resultSummary = document.getElementById("result-summary");
const downloadList = document.getElementById("download-list");

const ffmpeg = new FFmpeg();
let ffmpegReady = false;
let selectedFiles = [];
const currentObjectUrls = [];
const ffmpegLogBuffer = [];

const taskContext = {
  total: 0,
  completed: 0,
  currentIndex: -1,
  currentLabel: "",
};

const MAX_LOG_BUFFER = 4000;

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

const audioCodecExtensionMap = {
  aac: "m4a",
  ac3: "ac3",
  alac: "m4a",
  amr_nb: "amr",
  amr_wb: "awb",
  dts: "dts",
  eac3: "eac3",
  flac: "flac",
  mp2: "mp2",
  mp3: "mp3",
  opus: "opus",
  truehd: "thd",
  vorbis: "ogg",
  wavpack: "wv",
  wmalossless: "wma",
  wmapro: "wma",
  wmav1: "wma",
  wmav2: "wma",
};

const pcmCodecs = new Set([
  "pcm_s16le",
  "pcm_s16be",
  "pcm_s24le",
  "pcm_s24be",
  "pcm_s32le",
  "pcm_s32be",
  "pcm_f32le",
  "pcm_f32be",
  "pcm_s8",
  "pcm_u8",
  "pcm_mulaw",
  "pcm_alaw",
]);

const containerFallbackExtensionMap = {
  avi: "wav",
  flv: "flv",
  m2ts: "ts",
  m4v: "m4a",
  mkv: "mka",
  mov: "m4a",
  mp4: "m4a",
  mpg: "mpg",
  mpeg: "mpg",
  mts: "ts",
  ts: "ts",
  vob: "ac3",
  webm: "webm",
  wmv: "wma",
};

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

const isVideoFile = (file) => {
  if (!file) return false;
  if (typeof file.type === "string" && file.type.startsWith("video/")) {
    return true;
  }
  const ext = getExtension(file.name || file.webkitRelativePath || "");
  return videoExtensions.has(ext);
};

const guessMime = (ext) => {
  switch ((ext || "").toLowerCase()) {
    case "aac":
    case "m4a":
      return "audio/mp4";
    case "ac3":
    case "eac3":
      return "audio/ac3";
    case "awb":
      return "audio/3gpp";
    case "amr":
      return "audio/amr";
    case "dts":
      return "audio/vnd.dts";
    case "flac":
      return "audio/flac";
    case "mp2":
      return "audio/mpeg";
    case "mp3":
      return "audio/mpeg";
    case "ogg":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "thd":
      return "audio/vnd.dolby.thd";
    case "ts":
      return "video/mp2t";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    case "wma":
      return "audio/x-ms-wma";
    case "wv":
      return "audio/wavpack";
    case "mka":
      return "audio/x-matroska";
    case "flv":
      return "video/x-flv";
    case "zip":
      return "application/zip";
    default:
      return "audio/octet-stream";
  }
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
  resultSection.hidden = true;
};

const setStatus = (message) => {
  statusEl.textContent = message;
};

const resetProgress = () => {
  updateProgress(0);
};

const updateProgress = (value) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  progressBar.style.width = `${clamped}%`;
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
    } catch (err) {
      text = String(message);
    }
  }
  logOutput.textContent += `${text}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
};

const clearLog = () => {
  logOutput.textContent = "";
  ffmpegLogBuffer.length = 0;
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
    setStatus("FFmpeg 已就绪，可开始处理");
  } catch (error) {
    appendLog(error);
    setStatus("加载 FFmpeg 失败，请刷新页面后重试");
    throw error;
  }
};

const selectFiles = (files = []) => {
  selectedFiles = Array.from(files).filter(Boolean);
  clearResults();
  if (selectedFiles.length === 0) {
    fileInfo.textContent = "尚未选择文件";
    convertBtn.disabled = true;
    setStatus("等待操作");
    return;
  }
  const totalSize = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  fileInfo.textContent = `已选择 ${selectedFiles.length} 个文件（总计 ${formatBytes(totalSize)}）`;
  convertBtn.disabled = false;
  setStatus("准备就绪，点击开始批量提取音频");
};

const gatherVideoSources = async (files) => {
  const tasks = [];
  for (const file of files) {
    const label = file.webkitRelativePath || file.name;
    await collectFromEntry(file, label, tasks);
  }
  return tasks;
};

const collectFromEntry = async (file, label, tasks) => {
  if (!file) return;
  if (isZipFile(file.name)) {
    appendLog(`开始解压缩文件：${label}`);
    let entries;
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      entries = unzipSync(buffer);
    } catch (error) {
      appendLog(`解压失败（${label}）：${error.message || error}`);
      return;
    }
    const names = Object.keys(entries || {});
    if (names.length === 0) {
      appendLog(`压缩文件为空：${label}`);
    }
    for (const entryName of names) {
      if (entryName.endsWith("/")) continue;
      const data = entries[entryName];
      const fullLabel = joinLabel(label, entryName);
      if (isZipFile(entryName)) {
        const nestedFile = new File([data], entryName, { type: "application/zip" });
        await collectFromEntry(nestedFile, fullLabel, tasks);
      } else {
        const virtualFile = new File([data], entryName);
        if (isVideoFile(virtualFile)) {
          tasks.push({ file: virtualFile, displayName: fullLabel, containerExt: getExtension(entryName) });
        } else {
          appendLog(`压缩包内忽略非视频文件：${fullLabel}`);
        }
      }
    }
  } else if (isVideoFile(file)) {
    const containerExt = getExtension(file.name || file.webkitRelativePath || "");
    tasks.push({ file, displayName: label, containerExt });
  } else {
    appendLog(`忽略非视频文件：${label}`);
  }
};

const detectAudioStream = async (inputName) => {
  const startIndex = ffmpegLogBuffer.length;
  const exitCode = await ffmpeg.exec(["-hide_banner", "-loglevel", "info", "-i", inputName]);
  const logs = ffmpegLogBuffer.slice(startIndex);
  const combined = logs.map((entry) => entry.message || "").join("\n");
  const audioMatches = [...combined.matchAll(/Audio:\s*([^,\s]+)/gi)];
  const codec = audioMatches.length ? audioMatches[0][1].toLowerCase() : null;
  const hasAudio = Boolean(audioMatches.length);
  return { codec, hasAudio, exitCode, logs: combined };
};

const getAudioExtension = (codec, fallbackExt) => {
  if (codec) {
    if (audioCodecExtensionMap[codec]) {
      return audioCodecExtensionMap[codec];
    }
    if (pcmCodecs.has(codec)) {
      return "wav";
    }
  }
  if (fallbackExt && containerFallbackExtensionMap[fallbackExt]) {
    return containerFallbackExtensionMap[fallbackExt];
  }
  return "mka";
};

const prepareArgs = (inputName, outputName) => {
  const hardwareThreads = navigator.hardwareConcurrency || 4;
  const threads = Math.max(1, Math.min(16, hardwareThreads));
  return [
    "-y",
    "-i",
    inputName,
    "-map",
    "0:a:0",
    "-vn",
    "-c:a",
    "copy",
    "-threads",
    `${threads}`,
    outputName,
  ];
};

const processTask = async (task, index, usedBaseNames) => {
  const originalName = task.file.name || getDisplayLabel(task.displayName);
  const originalExt = getExtension(originalName) || task.containerExt || "dat";
  const inputName = sanitizeName(`input_${index}.${originalExt}`);
  let outputName = "";
  try {
    appendLog(`写入临时文件：${inputName}`);
    await ffmpeg.writeFile(inputName, await fetchFile(task.file));

    setStatus(`正在分析音频流：${shortenLabel(task.displayName)}`);
    const audioInfo = await detectAudioStream(inputName);
    if (!audioInfo.hasAudio) {
      appendLog(`未检测到音频流，跳过文件：${task.displayName}`);
      return null;
    }
    const audioExt = getAudioExtension(audioInfo.codec, task.containerExt || originalExt);
    const baseCandidate = sanitizeName(getBaseName(getDisplayLabel(task.displayName))) || `audio_${index + 1}`;
    let baseName = baseCandidate;
    if (usedBaseNames) {
      const count = usedBaseNames.get(baseCandidate) || 0;
      if (count === 0) {
        usedBaseNames.set(baseCandidate, 1);
      } else {
        const nextIndex = count + 1;
        usedBaseNames.set(baseCandidate, nextIndex);
        baseName = `${baseCandidate}_${nextIndex}`;
      }
    }
    outputName = `${baseName}.${audioExt}`;

    const args = prepareArgs(inputName, outputName);
    appendLog(`执行命令：ffmpeg ${args.join(" ")}`);

    const resultCode = await ffmpeg.exec(args);
    if (resultCode !== 0) {
      throw new Error(`FFmpeg 处理失败，返回码 ${resultCode}`);
    }

    setStatus(`读取生成的音频：${shortenLabel(outputName)}`);
    const data = await ffmpeg.readFile(outputName);
    return {
      name: outputName,
      data,
      codec: audioInfo.codec,
      ext: audioExt,
    };
  } finally {
    try {
      if (inputName) {
        await ffmpeg.deleteFile?.(inputName);
      }
    } catch (error) {
      appendLog(`清理临时输入失败：${error.message || error}`);
    }
    try {
      if (outputName) {
        await ffmpeg.deleteFile?.(outputName);
      }
    } catch (error) {
      appendLog(`清理临时输出失败：${error.message || error}`);
    }
  }
};

const buildDownloadLinks = (results) => {
  clearResults();
  if (!results.length) {
    resultSummary.textContent = "未生成任何音频文件。";
    resultSection.hidden = false;
    return;
  }

  if (results.length <= 3) {
    resultSummary.textContent = `共提取 ${results.length} 个音频文件，可单独下载。`;
    for (const result of results) {
      const blob = new Blob([result.data.buffer.slice(result.data.byteOffset, result.data.byteOffset + result.data.byteLength)], {
        type: guessMime(result.ext),
      });
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
    }
  } else {
    resultSummary.textContent = `共提取 ${results.length} 个音频文件，已自动打包为 ZIP 下载。`;
    const zipEntries = Object.fromEntries(
      results.map((result) => [
        result.name,
        result.data,
      ]),
    );
    const zipData = zipSync(zipEntries, { level: 0 });
    const zipBlob = new Blob([zipData], { type: guessMime("zip") });
    const url = URL.createObjectURL(zipBlob);
    registerObjectUrl(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = `extracted_audio_${Date.now()}.zip`;
    link.textContent = "下载音频打包文件";
    const sizeSpan = document.createElement("span");
    sizeSpan.className = "download-size";
    sizeSpan.textContent = formatBytes(zipBlob.size);
    link.appendChild(sizeSpan);
    downloadList.appendChild(link);
  }

  resultSection.hidden = false;
  setStatus("提取完成，点击下载结果");
  updateProgress(100);
};

const runExtraction = async () => {
  if (selectedFiles.length === 0) return;
  convertBtn.disabled = true;
  resetProgress();
  clearLog();
  clearResults();
  setStatus("正在初始化...");

  try {
    await loadFFmpeg();

    setStatus("正在扫描文件...");
    const tasks = await gatherVideoSources(selectedFiles);
    if (!tasks.length) {
      setStatus("未找到可提取音频的视频文件");
      return;
    }

    taskContext.total = tasks.length;
    taskContext.completed = 0;
    taskContext.currentIndex = -1;
    taskContext.currentLabel = "";
    updateProgress(0);

    const results = [];
    const usedBaseNames = new Map();
    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i];
      taskContext.currentIndex = i;
      taskContext.currentLabel = shortenLabel(task.displayName);
      setStatus(`[${i + 1}/${taskContext.total}] 正在处理：${taskContext.currentLabel}`);

      try {
        const result = await processTask(task, i, usedBaseNames);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(error);
        appendLog(`处理失败（${task.displayName}）：${error.message || error}`);
      }

      taskContext.completed += 1;
      updateProgress((taskContext.completed / taskContext.total) * 100);
    }

    buildDownloadLinks(results);
  } catch (error) {
    console.error(error);
    appendLog(`错误：${error.message || error}`);
    setStatus("提取失败，请重试或更换文件");
  } finally {
    taskContext.total = 0;
    taskContext.completed = 0;
    taskContext.currentIndex = -1;
    taskContext.currentLabel = "";
    convertBtn.disabled = selectedFiles.length === 0;
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

ffmpeg.on("progress", ({ progress, time }) => {
  if (!taskContext.total) return;
  const fileProgress = Number.isFinite(progress) ? progress : 0;
  const overall = ((taskContext.completed + fileProgress) / taskContext.total) * 100;
  updateProgress(overall);
  const percentText = Number.isFinite(progress) ? `${(progress * 100).toFixed(0)}%` : "...";
  const timeText = Number.isFinite(time) ? `（耗时 ${time.toFixed(1)}s）` : "";
  const label = taskContext.currentLabel || "当前文件";
  setStatus(`[${taskContext.currentIndex + 1}/${taskContext.total}] ${label} 提取中：${percentText}${timeText}`);
});

convertBtn.addEventListener("click", () => {
  if (!selectedFiles.length) return;
  runExtraction();
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
