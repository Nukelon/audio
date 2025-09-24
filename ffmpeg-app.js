import { FFmpeg } from "./vendor/ffmpeg/classes.js";
import { fetchFile } from "./vendor/util/index.js";
import { unzipSync } from "./vendor/fflate.min.js";

const dropZone = document.getElementById("file-drop-zone");
const fileInput = document.getElementById("file-input");
const breadcrumbsEl = document.getElementById("breadcrumbs");
const fileTableBody = document.getElementById("file-table-body");
const emptyStateEl = document.getElementById("file-empty-state");
const goUpBtn = document.getElementById("go-up-btn");
const fileStatusEl = document.getElementById("file-status");
const terminalOutput = document.getElementById("terminal-output");
const terminalForm = document.getElementById("terminal-form");
const terminalInput = document.getElementById("terminal-input");
const terminalRunBtn = document.getElementById("terminal-run-btn");

const ffmpeg = new FFmpeg();
let ffmpegReady = false;
let showLogsInTerminal = false;
const ffmpegLogBuffer = [];
const MAX_LOG_BUFFER = 8000;

const rootNode = createDirectoryNode("");
let currentPath = [];
let isProcessing = false;

const mediaExtensions = new Set([
  "3g2",
  "3gp",
  "aac",
  "ac3",
  "aif",
  "aiff",
  "alac",
  "amr",
  "ape",
  "asf",
  "avi",
  "caf",
  "dts",
  "eac3",
  "flac",
  "flv",
  "m2ts",
  "m4a",
  "m4v",
  "mka",
  "mkv",
  "mov",
  "mp2",
  "mp3",
  "mp4",
  "mpg",
  "mpeg",
  "mts",
  "mxf",
  "oga",
  "ogg",
  "ogv",
  "opus",
  "ts",
  "vob",
  "wav",
  "webm",
  "wma",
  "wmv",
]);

ffmpeg.on("log", ({ message }) => {
  const text = typeof message === "string" ? message : "";
  ffmpegLogBuffer.push(text);
  if (ffmpegLogBuffer.length > MAX_LOG_BUFFER) {
    ffmpegLogBuffer.splice(0, ffmpegLogBuffer.length - MAX_LOG_BUFFER);
  }
  if (showLogsInTerminal && text) {
    appendTerminalLine(text, "output");
  }
});

const setFileStatus = (message) => {
  if (!fileStatusEl) return;
  fileStatusEl.textContent = message || "";
};

async function loadFFmpeg() {
  if (ffmpegReady) return;
  setFileStatus("正在加载 FFmpeg 核心...");
  try {
    await ffmpeg.load({
      coreURL: new URL("./ffmpeg-core/ffmpeg-core.js", window.location.href).href,
      wasmURL: new URL("./ffmpeg-core/ffmpeg-core.wasm", window.location.href).href,
      workerURL: new URL("./ffmpeg-core/ffmpeg-core.worker.js", window.location.href).href,
    });
    ffmpegReady = true;
    await ensureWorkspace();
    setFileStatus("FFmpeg 已就绪");
  } catch (error) {
    console.error(error);
    setFileStatus(`加载 FFmpeg 失败：${error?.message || error}`);
    throw error;
  }
}

function createDirectoryNode(name) {
  return {
    name,
    type: "directory",
    children: new Map(),
  };
}

function createFileNode({ name, data, originalName }) {
  return {
    name,
    type: "file",
    data,
    size: data?.length || 0,
    originalName: originalName || name,
    meta: null,
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "未知";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : value < 10 ? 2 : 1)} ${units[exponent]}`;
}

function formatFrameRate(frameRate) {
  if (!frameRate || !Number.isFinite(frameRate)) return "—";
  return `${frameRate.toFixed(frameRate % 1 === 0 ? 0 : 2)} fps`;
}

function formatBitrate(bitrate) {
  if (!bitrate) return "—";
  return bitrate.replace(/\s+/g, " ");
}

function getExtension(name = "") {
  const match = /\.([^.]+)$/.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

function isZipFile(name = "") {
  return /\.zip$/i.test(name);
}

function normalizePath(path = "") {
  return path.split(/[\\/]+/).filter(Boolean);
}

function normalizeWorkspaceRelativePath(path = "") {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const stack = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (stack.length) stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function ensureUniqueName(directoryNode, desiredName) {
  if (!directoryNode || directoryNode.type !== "directory") return desiredName;
  if (!directoryNode.children.has(desiredName)) {
    return desiredName;
  }
  const extMatch = desiredName.match(/(.*?)(\.[^.]*)?$/);
  const base = (extMatch?.[1] || desiredName).trim();
  const ext = extMatch?.[2] || "";
  let index = 1;
  let candidate = `${base} (${index})${ext}`;
  while (directoryNode.children.has(candidate)) {
    index += 1;
    candidate = `${base} (${index})${ext}`;
  }
  return candidate;
}

function getNodeAtPath(pathSegments) {
  let node = rootNode;
  for (const segment of pathSegments) {
    if (!node || node.type !== "directory") return null;
    node = node.children.get(segment);
    if (!node) return null;
  }
  return node;
}

function ensureDirectorySegments(pathSegments) {
  let node = rootNode;
  const actualSegments = [];
  for (const segment of pathSegments) {
    if (!segment) continue;
    let child = node.children.get(segment);
    if (!child || child.type !== "directory") {
      let dirName = segment;
      if (child?.type === "file" || node.children.has(segment)) {
        dirName = ensureUniqueName(node, segment);
      }
      child = createDirectoryNode(dirName);
      node.children.set(dirName, child);
    }
    node = child;
    actualSegments.push(child.name);
  }
  return { node, segments: actualSegments };
}

async function ensureWorkspace() {
  await loadFFmpeg();
  try {
    await ffmpeg.createDir("workspace");
  } catch (error) {
    // ignore when directory already exists
  }
}

function getWorkspacePath(segments) {
  if (!segments || segments.length === 0) return "workspace";
  return `workspace/${segments.join("/")}`;
}

async function ensureDirectoryInFFmpeg(segments) {
  await ensureWorkspace();
  let current = "workspace";
  for (const segment of segments) {
    if (!segment) continue;
    current = `${current}/${segment}`;
    try {
      await ffmpeg.createDir(current);
    } catch (error) {
      // ignore if exists
    }
  }
}

async function writeFileToFFmpeg(pathSegments, data) {
  await ensureDirectoryInFFmpeg(pathSegments.slice(0, -1));
  const fsPath = getWorkspacePath(pathSegments);
  await ffmpeg.writeFile(fsPath, data);
}

async function removeDirectoryContents(fsPath) {
  let entries;
  try {
    entries = await ffmpeg.listDir(fsPath);
  } catch (error) {
    return;
  }
  for (const entry of entries) {
    if (!entry || entry.name === "." || entry.name === "..") continue;
    const childPath = `${fsPath}/${entry.name}`;
    if (entry.isDir) {
      await removeDirectoryContents(childPath);
      try {
        await ffmpeg.deleteDir(childPath);
      } catch (error) {
        // ignore
      }
    } else {
      try {
        await ffmpeg.deleteFile(childPath);
      } catch (error) {
        // ignore
      }
    }
  }
}

async function removePathFromFFmpeg(pathSegments, isDirectory) {
  await ensureWorkspace();
  const fsPath = getWorkspacePath(pathSegments);
  if (isDirectory) {
    await removeDirectoryContents(fsPath);
    try {
      await ffmpeg.deleteDir(fsPath);
    } catch (error) {
      // ignore failures
    }
  } else {
    try {
      await ffmpeg.deleteFile(fsPath);
    } catch (error) {
      // ignore failures
    }
  }
}

function shouldAnalyzeFile(name) {
  const ext = getExtension(name);
  return mediaExtensions.has(ext);
}

function parseMediaInfo(log = "") {
  const audioMatch = log.match(/Audio:\s*([^,\s]+)/i);
  const videoMatch = log.match(/Video:\s*([^,\s]+)/i);
  const containerMatch = log.match(/Input #0,\s*([^,]+),/i);
  const frameRateMatch = log.match(/\s([\d.]+)\s*fps/);
  const bitrateMatch = log.match(/bitrate:\s*([^\n]+)/i);
  return {
    audioCodec: audioMatch ? audioMatch[1].toLowerCase() : null,
    videoCodec: videoMatch ? videoMatch[1].toLowerCase() : null,
    container: containerMatch ? containerMatch[1].trim() : null,
    frameRate: frameRateMatch ? Number(frameRateMatch[1]) : null,
    bitrate: bitrateMatch ? bitrateMatch[1].trim() : null,
  };
}

async function analyzeMediaForNode(node, pathSegments) {
  if (!node || node.type !== "file") return;
  const ext = getExtension(node.name);
  if (!shouldAnalyzeFile(node.name)) {
    node.meta = {
      container: ext || null,
      audioCodec: null,
      videoCodec: null,
      frameRate: null,
      bitrate: null,
    };
    return;
  }
  await ensureWorkspace();
  const fsPath = getWorkspacePath(pathSegments);
  const startIndex = ffmpegLogBuffer.length;
  try {
    await ffmpeg.exec(["-hide_banner", "-loglevel", "info", "-i", fsPath]);
  } catch (error) {
    // non-zero exit code is expected when仅分析
  }
  const logs = ffmpegLogBuffer.slice(startIndex).join("\n");
  const info = parseMediaInfo(logs);
  node.meta = {
    container: info.container || ext || null,
    audioCodec: info.audioCodec,
    videoCodec: info.videoCodec,
    frameRate: info.frameRate,
    bitrate: info.bitrate,
  };
}

function appendTerminalLine(message, type = "output") {
  if (!terminalOutput) return;
  const line = document.createElement("div");
  line.className = `terminal-line terminal-${type}`;
  line.textContent = message;
  terminalOutput.appendChild(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function renderBreadcrumbs() {
  if (!breadcrumbsEl) return;
  breadcrumbsEl.innerHTML = "";
  const homeButton = document.createElement("button");
  homeButton.type = "button";
  homeButton.className = "link-button";
  homeButton.dataset.path = "";
  homeButton.textContent = "根目录";
  breadcrumbsEl.appendChild(homeButton);
  let accumulated = [];
  currentPath.forEach((segment, index) => {
    const separator = document.createElement("span");
    separator.textContent = " / ";
    breadcrumbsEl.appendChild(separator);
    accumulated = [...accumulated, segment];
    if (index === currentPath.length - 1) {
      const span = document.createElement("span");
      span.textContent = segment;
      breadcrumbsEl.appendChild(span);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "link-button";
      button.dataset.path = accumulated.join("/");
      button.textContent = segment;
      breadcrumbsEl.appendChild(button);
    }
  });
}
function createCell(content, className) {
  const cell = document.createElement("td");
  if (className) {
    cell.className = className;
  }
  if (content instanceof Node) {
    cell.appendChild(content);
  } else {
    cell.textContent = content;
  }
  return cell;
}

function createActionButton(label, action, path) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "table-action";
  button.dataset.action = action;
  button.dataset.path = path;
  button.textContent = label;
  return button;
}

function renderFileTable() {
  if (!fileTableBody) return;
  const directoryNode = getNodeAtPath(currentPath) || rootNode;
  const entries = Array.from(directoryNode.children.values());
  entries.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name, "zh-Hans");
    }
    return a.type === "directory" ? -1 : 1;
  });

  fileTableBody.innerHTML = "";
  const table = fileTableBody.closest("table");
  if (!entries.length) {
    if (emptyStateEl) emptyStateEl.hidden = false;
    if (table) table.hidden = true;
  } else {
    if (emptyStateEl) emptyStateEl.hidden = true;
    if (table) table.hidden = false;
  }

  for (const entry of entries) {
    const row = document.createElement("tr");
    const fullPath = [...currentPath, entry.name].join("/");
    row.dataset.path = fullPath;
    row.dataset.type = entry.type;

    if (entry.type === "directory") {
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "link-button file-name-button";
      openButton.dataset.action = "open";
      openButton.dataset.path = fullPath;
      openButton.textContent = entry.name;
      row.appendChild(createCell(openButton));
      row.appendChild(createCell("—", "file-size-column"));
      row.appendChild(createCell("—"));
      row.appendChild(createCell("—"));
      row.appendChild(createCell("—"));
      row.appendChild(createCell("—"));
      row.appendChild(createCell("—"));
      const actionsCell = document.createElement("td");
      const actionsWrapper = document.createElement("div");
      actionsWrapper.className = "file-actions";
      actionsWrapper.appendChild(createActionButton("删除", "delete", fullPath));
      actionsCell.appendChild(actionsWrapper);
      row.appendChild(actionsCell);
    } else {
      row.appendChild(createCell(entry.name));
      row.appendChild(createCell(formatBytes(entry.size), "file-size-column"));
      const containerLabel = entry.meta?.container || getExtension(entry.name) || "—";
      row.appendChild(createCell(containerLabel));
      row.appendChild(createCell(entry.meta?.videoCodec || "—"));
      row.appendChild(createCell(entry.meta?.audioCodec || "—"));
      row.appendChild(createCell(formatFrameRate(entry.meta?.frameRate)));
      row.appendChild(createCell(formatBitrate(entry.meta?.bitrate)));
      const actionsCell = document.createElement("td");
      const actionsWrapper = document.createElement("div");
      actionsWrapper.className = "file-actions";
      actionsWrapper.appendChild(createActionButton("下载", "download", fullPath));
      if (isZipFile(entry.name)) {
        actionsWrapper.appendChild(createActionButton("解压", "unzip", fullPath));
      }
      actionsWrapper.appendChild(createActionButton("删除", "delete", fullPath));
      actionsCell.appendChild(actionsWrapper);
      row.appendChild(actionsCell);
    }

    fileTableBody.appendChild(row);
  }

  renderBreadcrumbs();
  if (goUpBtn) {
    goUpBtn.disabled = currentPath.length === 0;
  }
}
function splitPath(path = "") {
  if (!path) return [];
  return path.split("/").filter(Boolean);
}

async function addFileToTree({ data, relativePath, originalName }) {
  const pathSegments = normalizePath(relativePath);
  if (!pathSegments.length) return;
  const directories = pathSegments.slice(0, -1);
  const fileName = pathSegments[pathSegments.length - 1];
  const { node: parentDir, segments: dirSegments } = ensureDirectorySegments(directories);
  const resolvedName = ensureUniqueName(parentDir, fileName);
  const fileNode = createFileNode({ name: resolvedName, data, originalName });
  parentDir.children.set(resolvedName, fileNode);
  const absoluteSegments = [...dirSegments, resolvedName];
  await writeFileToFFmpeg(absoluteSegments, data);
  await analyzeMediaForNode(fileNode, absoluteSegments);
}

async function handleFileList(fileList, targetPath) {
  if (!fileList || !fileList.length) return;
  setFileStatus("正在导入文件...");
  isProcessing = true;
  await loadFFmpeg();
  for (const file of Array.from(fileList)) {
    if (!file) continue;
    try {
      const relative = file.webkitRelativePath || file.relativePath || file.name;
      const data = await fetchFile(file);
      const basePath = targetPath.length ? `${targetPath.join("/")}/` : "";
      await addFileToTree({
        data,
        originalName: file.name,
        relativePath: `${basePath}${relative}`,
      });
    } catch (error) {
      console.error(error);
      appendTerminalLine(`导入 ${file.name} 失败：${error?.message || error}`, "error");
    }
  }
  isProcessing = false;
  setFileStatus("文件导入完成");
  renderFileTable();
}

async function downloadFile(path) {
  const segments = splitPath(path);
  const node = getNodeAtPath(segments);
  if (!node || node.type !== "file") return;
  const blob = new Blob([node.data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = node.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

async function deletePath(path) {
  const segments = splitPath(path);
  if (!segments.length) return;
  const parentSegments = segments.slice(0, -1);
  const parent = getNodeAtPath(parentSegments) || rootNode;
  const target = getNodeAtPath(segments);
  if (!target) return;
  parent.children.delete(target.name);
  await removePathFromFFmpeg(segments, target.type === "directory");
  renderFileTable();
}

async function unzipFile(path) {
  const segments = splitPath(path);
  const fileNode = getNodeAtPath(segments);
  if (!fileNode || fileNode.type !== "file") return;
  try {
    const result = unzipSync(fileNode.data);
    setFileStatus("正在解压压缩包...");
    for (const [entryName, content] of Object.entries(result)) {
      if (entryName.endsWith("/")) continue;
      const normalized = normalizePath(entryName);
      if (!normalized.length) continue;
      const baseSegments = segments.slice(0, -1);
      const absolute = [...baseSegments, ...normalized];
      await addFileToTree({
        data: content,
        originalName: normalized[normalized.length - 1],
        relativePath: absolute.join("/"),
      });
    }
    setFileStatus("解压完成");
    renderFileTable();
  } catch (error) {
    console.error(error);
    setFileStatus(`解压失败：${error?.message || error}`);
  }
}
function parseCommandLine(input) {
  const args = [];
  const regex = /(?:"([^"]*)"|'([^']*)'|\S+)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    args.push(match[1] ?? match[2] ?? match[0]);
  }
  return args;
}

function transformArgsForWorkspace(args) {
  return args.map((arg) => {
    if (arg === ".\\" || arg === "./") {
      return "workspace";
    }
    if (arg.startsWith(".\\")) {
      const relative = normalizeWorkspaceRelativePath(arg.slice(2));
      return relative ? `workspace/${relative}` : "workspace";
    }
    if (arg.startsWith("./")) {
      const relative = normalizeWorkspaceRelativePath(arg.slice(2));
      return relative ? `workspace/${relative}` : "workspace";
    }
    return arg;
  });
}

async function rebuildTreeFromWorkspace() {
  await ensureWorkspace();
  const newRoot = createDirectoryNode("");
  const traverse = async (segments, parent) => {
    const fsPath = getWorkspacePath(segments);
    let entries;
    try {
      entries = await ffmpeg.listDir(fsPath);
    } catch (error) {
      return;
    }
    for (const entry of entries) {
      if (!entry || entry.name === "." || entry.name === "..") continue;
      const childSegments = [...segments, entry.name];
      if (entry.isDir) {
        const dirNode = createDirectoryNode(entry.name);
        parent.children.set(entry.name, dirNode);
        await traverse(childSegments, dirNode);
      } else {
        const data = await ffmpeg.readFile(getWorkspacePath(childSegments));
        const fileNode = createFileNode({ name: entry.name, data, originalName: entry.name });
        parent.children.set(entry.name, fileNode);
        await analyzeMediaForNode(fileNode, childSegments);
      }
    }
  };
  await traverse([], newRoot);
  rootNode.children.clear();
  for (const [name, child] of newRoot.children) {
    rootNode.children.set(name, child);
  }
  if (!getNodeAtPath(currentPath)) {
    currentPath = [];
  }
  renderFileTable();
}

async function runTerminalCommand(commandString) {
  const trimmed = commandString.trim();
  if (!trimmed) return;
  const parsed = parseCommandLine(trimmed);
  if (!parsed.length) return;
  if (parsed[0].toLowerCase() === "ffmpeg") {
    parsed.shift();
  }
  if (!parsed.length) {
    appendTerminalLine("请提供需要执行的参数。", "error");
    return;
  }
  await loadFFmpeg();
  const args = transformArgsForWorkspace(parsed);
  appendTerminalLine(`$ ${commandString}`, "command");
  terminalRunBtn.disabled = true;
  terminalInput.disabled = true;
  showLogsInTerminal = true;
  setFileStatus("正在执行 FFmpeg 命令...");
  let exitCode = 0;
  try {
    exitCode = await ffmpeg.exec(args);
    showLogsInTerminal = false;
    if (exitCode === 0) {
      appendTerminalLine("命令执行完成。", "status");
    } else {
      appendTerminalLine(`命令执行失败，返回码 ${exitCode}`, "error");
    }
    setFileStatus("正在同步命令结果...");
    await rebuildTreeFromWorkspace();
    setFileStatus("命令输出已更新到文件管理器");
  } catch (error) {
    showLogsInTerminal = false;
    appendTerminalLine(`执行失败：${error?.message || error}`, "error");
    setFileStatus(`执行失败：${error?.message || error}`);
  } finally {
    showLogsInTerminal = false;
    terminalRunBtn.disabled = false;
    terminalInput.disabled = false;
  }
}

function clearDragState() {
  dropZone?.classList.remove("is-dragover");
}

function registerEventListeners() {
  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const files = event.target?.files;
      if (files?.length) {
        handleFileList(files, currentPath);
      }
      fileInput.value = "";
    });
  }

  if (dropZone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("is-dragover");
      });
    });
    ["dragleave", "dragend"].forEach((eventName) => {
      dropZone.addEventListener(eventName, () => {
        clearDragState();
      });
    });
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      clearDragState();
      const files = event.dataTransfer?.files;
      if (files?.length) {
        handleFileList(files, currentPath);
      }
    });
  }

  if (fileTableBody) {
    fileTableBody.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-action]");
      if (actionButton) {
        const action = actionButton.dataset.action;
        const path = actionButton.dataset.path || "";
        if (action === "download") {
          downloadFile(path);
        } else if (action === "delete") {
          deletePath(path);
        } else if (action === "unzip") {
          unzipFile(path);
        } else if (action === "open") {
          currentPath = splitPath(path);
          renderFileTable();
        }
        return;
      }
    });
  }

  if (breadcrumbsEl) {
    breadcrumbsEl.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-path]");
      if (!target) return;
      const path = target.dataset.path || "";
      currentPath = splitPath(path);
      renderFileTable();
    });
  }

  if (goUpBtn) {
    goUpBtn.addEventListener("click", () => {
      if (!currentPath.length) return;
      currentPath = currentPath.slice(0, -1);
      renderFileTable();
    });
  }

  if (terminalForm) {
    terminalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = terminalInput?.value || "";
      if (!value.trim()) return;
      terminalInput.value = "";
      runTerminalCommand(value);
    });
  }
}

function init() {
  renderFileTable();
  registerEventListeners();
  setFileStatus("等待上传文件或执行命令");
}

init();
