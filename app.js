import { FFmpeg } from "./vendor/ffmpeg/classes.js";
import { fetchFile } from "./vendor/util/index.js";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const convertBtn = document.getElementById("convert-btn");
const fileInfo = document.getElementById("file-info");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progress-bar");
const logOutput = document.getElementById("log-output");
const resultSection = document.getElementById("result");
const downloadLink = document.getElementById("download-link");

const ffmpeg = new FFmpeg();
let ffmpegReady = false;
let currentFile = null;
let currentObjectUrl = null;

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

const guessMime = (ext) => {
  switch (ext) {
    case "mp4":
    case "m4v":
    case "m4a":
      return "audio/mp4";
    case "mov":
      return "audio/quicktime";
    case "webm":
      return "audio/webm";
    case "mkv":
      return "audio/x-matroska";
    case "mpg":
    case "mpeg":
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "flv":
      return "audio/x-flv";
    case "ogg":
    case "ogv":
    case "oga":
      return "audio/ogg";
    default:
      return "audio/octet-stream";
  }
};

const setStatus = (message) => {
  statusEl.textContent = message;
};

const resetProgress = () => {
  progressBar.style.width = "0%";
};

const updateProgress = (value) => {
  const clamped = Math.max(0, Math.min(100, value));
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

const selectFile = (file) => {
  currentFile = file;
  resultSection.hidden = true;
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  if (file) {
    fileInfo.textContent = `${file.name}（${formatBytes(file.size)}）`;
    convertBtn.disabled = false;
    setStatus("准备就绪，点击开始提取音频");
  } else {
    fileInfo.textContent = "尚未选择文件";
    convertBtn.disabled = true;
    setStatus("等待操作");
  }
};

const prepareArgs = (inputName, outputName) => {
  const hardwareThreads = navigator.hardwareConcurrency || 4;
  const threads = Math.max(1, Math.min(16, hardwareThreads));
  return [
    "-i",
    inputName,
    "-vn",
    "-acodec",
    "copy",
    "-threads",
    `${threads}`,
    outputName,
  ];
};

const runExtraction = async () => {
  if (!currentFile) return;
  convertBtn.disabled = true;
  resetProgress();
  clearLog();
  setStatus("初始化中...");

  let ext = "m4a";
  let safeBase = "output";
  let inputName = "input.m4a";
  let outputName = "output_audio.m4a";

  try {
    await loadFFmpeg();

    ext = getExtension(currentFile.name) || "m4a";
    safeBase = sanitizeName(currentFile.name.replace(/\.[^.]*$/, "")) || "output";
    inputName = `input.${ext}`;
    outputName = `${safeBase}_audio.${ext}`;

    appendLog(`写入文件: ${inputName}`);
    await ffmpeg.writeFile(inputName, await fetchFile(currentFile));

    const args = prepareArgs(inputName, outputName);
    appendLog(`执行命令: ffmpeg ${args.join(" ")}`);
    setStatus("正在提取音频...");

    const resultCode = await ffmpeg.exec(args);
    if (resultCode !== 0) {
      throw new Error(`FFmpeg 处理失败，返回码 ${resultCode}`);
    }

    setStatus("读取生成的音频...");
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: guessMime(ext) });
    currentObjectUrl = URL.createObjectURL(blob);
    downloadLink.href = currentObjectUrl;
    downloadLink.download = outputName;
    resultSection.hidden = false;
    setStatus("提取完成，点击下载音频");
    updateProgress(100);
  } catch (error) {
    console.error(error);
    appendLog(`错误: ${error.message || error}`);
    setStatus("提取失败，请重试或更换文件");
  } finally {
    try {
      await ffmpeg.deleteFile?.(inputName);
      await ffmpeg.deleteFile?.(outputName);
    } catch (cleanupError) {
      if (cleanupError) {
        appendLog(`清理缓存失败: ${cleanupError.message || cleanupError}`);
      }
    }
    convertBtn.disabled = !currentFile;
  }
};

ffmpeg.on("log", ({ type, message }) => {
  if (!message) return;
  appendLog(`[${type ?? "log"}] ${message}`);
});

ffmpeg.on("progress", ({ progress, time }) => {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    const percent = Math.min(100, Math.max(0, progress * 100));
    updateProgress(percent);
    const timeText = typeof time === "number" && Number.isFinite(time)
      ? `（耗时 ${time.toFixed(1)}s）`
      : "";
    setStatus(`提取中：${percent.toFixed(0)}%${timeText}`);
  }
});

convertBtn.addEventListener("click", () => {
  if (!currentFile) return;
  runExtraction();
});

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  selectFile(file || null);
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
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    fileInput.files = event.dataTransfer.files;
    selectFile(file);
  }
});

window.addEventListener("beforeunload", () => {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }
});

setStatus("等待操作");
