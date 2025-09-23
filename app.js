// app.js
import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/ffmpeg.js";
import { fetchFile, toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";

const $ = (s) => document.querySelector(s);
const logBox = $("#log");
const log = (...args) => { logBox.textContent += args.join(' ') + "\n"; logBox.scrollTop = logBox.scrollHeight; };

// --- 显示跨源隔离状态
const isoPill = $("#iso");
const setIso = () => isoPill.textContent = window.crossOriginIsolated ? "✅ 已隔离 (SharedArrayBuffer 可用)" : "⚠️ 未隔离 (将尝试通过 SW 启用)";
setIso();

const ffmpeg = new FFmpeg();
ffmpeg.on('log', ({ message }) => log(message));

/** 是否改为本地核心三件套（/ffmpeg-core） */
const USE_LOCAL_CORE = true;

/** 核心资源（多线程 core-mt），建议固定版本 */
const CORE_VERSION = "0.12.10";
const CORE_BASE = USE_LOCAL_CORE
  ? "./ffmpeg-core" // ← 若把三件套放仓库里，改用相对路径
  : `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`;

/** FFmpeg 类 Worker 的脚本（避免跨源 module worker，转成 Blob URL 使用） */
const FFMPEG_ESM_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm";

let loaded = false;
async function loadFFmpeg() {
  if (loaded) return;

  if (!window.crossOriginIsolated) {
    log("提示：当前未跨源隔离。若首次打开，SW 安装后会刷新一次，再次尝试加载。");
  }

  log("开始加载 ffmpeg 核心（~30+MB）...");
  const coreURL   = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
  const wasmURL   = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
  const workerURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.worker.js`, 'text/javascript');

  // 关键：为 @ffmpeg/ffmpeg 的类 worker 指定同源 Blob，避免跨源模块 worker 受限
  const classWorkerURL = await toBlobURL(`${FFMPEG_ESM_BASE}/worker.js`, 'text/javascript');

  // 加载（0.12+ 的标准写法）
  await ffmpeg.load({ coreURL, wasmURL, workerURL, classWorkerURL });
  loaded = true;
  $("#btn-mp3").disabled = false;
  $("#btn-trim").disabled = false;
  log("✅ ffmpeg 核心加载完成。");
}

/** 选择文件后缓存 File 引用 */
let pickedFile = null;
$("#file").addEventListener("change", (e) => {
  pickedFile = e.target.files?.[0] ?? null;
  if (pickedFile) log("已选择：", pickedFile.name, `${(pickedFile.size/1024/1024).toFixed(2)} MB`);
});

$("#btn-load").addEventListener("click", loadFFmpeg);

/** 转 MP3 示例 */
$("#btn-mp3").addEventListener("click", async () => {
  if (!pickedFile) return alert("请先选择一个音/视频文件");
  if (!loaded) await loadFFmpeg();

  const inputName = `input_${Date.now()}.${(pickedFile.name.split('.').pop()||'dat')}`;
  await ffmpeg.writeFile(inputName, await fetchFile(pickedFile));

  // 转码为 192kbps MP3（示例）
  const output = `output_${Date.now()}.mp3`;
  await ffmpeg.exec(["-i", inputName, "-vn", "-b:a", "192k", output]);

  const data = await ffmpeg.readFile(output);
  const blob = new Blob([data.buffer], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  $("#download").innerHTML = `下载：<a href="${url}" download="${output}">${output}</a>`;
  log("🎧 已生成 MP3：", output);
});

/** 裁剪一段并转为 16k 单声道 WAV（示例） */
$("#btn-trim").addEventListener("click", async () => {
  if (!pickedFile) return alert("请先选择一个音/视频文件");
  if (!loaded) await loadFFmpeg();

  const ss = parseFloat($("#ss").value || "0");
  const t  = parseFloat($("#t").value || "5");
  const inputName = `clip_${Date.now()}.${(pickedFile.name.split('.').pop()||'dat')}`;
  await ffmpeg.writeFile(inputName, await fetchFile(pickedFile));

  const output = `clip_${Date.now()}.wav`;
  await ffmpeg.exec(["-ss", String(ss), "-t", String(t), "-i", inputName, "-ac", "1", "-ar", "16000", output]);

  const data = await ffmpeg.readFile(output);
  const blob = new Blob([data.buffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  $("#download").innerHTML = `下载：<a href="${url}" download="${output}">${output}</a>`;
  log("✂️ 已裁剪并导出 WAV：", output);
});