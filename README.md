# 音视频操作工具集 · Audio & Video Toolkit

本项目是一个完全在浏览器中运行的音视频处理工具集合，依托 WebAssembly 版 FFmpeg 与压缩处理库实现常见的提取、转换功能，无需安装客户端或上传文件到服务器。

This project is a browser-based collection of audio & video utilities powered by the WebAssembly build of FFmpeg and compression helpers. Everything runs locally, so no native installation or file uploads are required.

## 功能概览 · Features

- **批量视频音频提取器 / Batch Audio Extractor**
  - 支持拖放或选择多个视频文件以及 ZIP 压缩包，一次性提取其中所有视频的原始音轨。
  - 自动识别常见视频容器（MP4、MKV、MOV 等），并保留源音频的编码格式与质量。
  - 处理进度与日志实时展示，完成后可逐个或打包下载生成的音频文件。
- **全能格式转换 / Universal Converter**
  - 接收音频、视频及 ZIP 文件，自动列出其中的所有媒体文件、编码、分辨率等元数据。
  - 提供音频 / 视频双模式，内建多档质量预设，同时允许自定义容器、编码器、码率或 CRF 参数。
  - 支持批量转换与打包下载，日志与进度条帮助追踪处理状态。

## 使用方式 · How to Use

1. 将仓库克隆或下载到本地，使用任意静态文件服务器（如 `python -m http.server`）启动站点：
   ```bash
   cd audio
   python -m http.server 8000
   ```
2. 在浏览器访问 `http://localhost:8000/index.html`，选择需要的工具并按页面提示操作。
3. 所有处理均在当前设备完成；请保持页面开启直至日志显示任务结束。

1. Clone or download the repository and start any static file server (e.g. `python -m http.server`).
2. Open `http://localhost:8000/index.html` in your browser, pick a tool, and follow the on-screen steps.
3. Keep the tab open until the logs show that processing has finished; everything runs locally on your device.

## 技术栈 · Tech Stack

- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) 用于媒体解码与编码。 / WebAssembly FFmpeg for media processing.
- [fflate](https://github.com/101arrowz/fflate) 在浏览器中解压与压缩 ZIP 文件。 / fflate for in-browser ZIP extraction and packing.
- 原生 HTML、CSS、JavaScript 构建的静态前端，无需额外框架或构建步骤。 / Plain HTML, CSS, and JavaScript without additional build tooling.

## 隐私与限制 · Privacy & Limitations

- 所有文件处理都在本地执行，不会上传到任何服务器。 / All work happens locally; no files are uploaded.
- 浏览器需支持 WebAssembly 与较大的内存分配，移动设备可能受性能限制。 / Requires WebAssembly support and sufficient memory; performance may vary on mobile.
- ZIP 文件中的层级结构会被保留在输出文件名中，便于追踪来源。 / ZIP hierarchy information is kept in output filenames for traceability.

## 贡献指南 · Contribution

欢迎通过 issue 或 pull request 提交改进建议。建议在提交前使用本地静态服务器手动验证上传、分析与转换流程是否可用。

Issues and pull requests are welcome. Please verify the upload, analysis, and conversion flows locally using a static server before submitting changes.

