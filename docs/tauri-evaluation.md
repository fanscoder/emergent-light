# M5 Tauri 桌面封装评估

日期：2026-11-04 ｜ 结论：**可行，建议进入封装阶段时采用 Tauri v2；本里程碑不实现**（设计文档 M5 原定范围：输出评估结论，暂不实现）

## 1. 需求拆解（壁纸应用形态）

| 需求 | 技术点 | Tauri v2 支持情况 |
|---|---|---|
| 全屏无边框窗口 | `decorations: false` + `fullscreen: true` | ✅ 配置即可 |
| 深色背景全屏渲染 | 本应用自绘深色背景，**不需要窗口透明** | ✅ 无特殊要求 |
| 鼠标穿透（不挡桌面操作） | `setIgnoreCursorEvents(true)`（JS API：`getCurrentWindow().setIgnoreCursorEvents`） | ✅ 支持，可运行时切换 |
| 控制面板可交互 | 全局热键切换 ignore-cursor-events（穿透 ⇄ 可操作） | ✅ 需自管状态机 |
| 常驻托盘/开机启动 | `tauri-plugin-autostart` + tray icon | ✅ 官方插件 |
| 安装包体积 | Tauri 相比 Electron 显著更小（系统 WebView2） | ✅ Windows 10/11 自带 WebView2 运行时 |

## 2. 已知风险（来自社区 issue 调研，2026-11）

1. **Windows 10 透明窗口合成竞争 bug**（tauri-apps/tauri#15947）：高频切换 `set_ignore_cursor_events` 的透明 always-on-top 窗口可能偶发桌面壁纸变黑/透明区变黑。缓解：结构性修复 `noRedirectionBitmap`（WS_EX_NOREDIRECTIONBITMAP，PR #15410 已提供）在 2.12 线落地；且本应用背景不透明、切换频率低（只在快捷键操作时切换），触发概率进一步降低。
2. 区域化穿透（只有面板可点、画面穿透）可用社区插件 `tauri-plugin-polygon`（多边形注册点击区域），但我们的形态更简单：整窗穿透 + 热键切回可操作，不需要逐区域管理。
3. "真正垫在桌面图标下面"（WorkerW 方案）超出 Tauri 常规能力，需要 Win32 hack（向 Progman 发消息派生 WorkerW 再把自己的窗口塞进去），维护成本高且系统更新易碎。**建议放弃"图标之下"，采用"全屏窗口 + 鼠标穿透"形态**——观感等价（不挡操作），实现稳健。
4. macOS 若未来需要：透明窗口需 `macOSPrivateApi: true` + CSS 透明 + Rust/objc shim 三层配合（私人 API，App Store 分发会被拒）。当前验证平台为Windows，仅作记录。

## 3. 实施路线建议（未来 M6+，不在本里程碑）

1. `npm create tauri-app` 接入现有 Vite 构建产物，Rust 侧仅做窗口配置与两个命令（穿透切换、自启动开关）。
2. 配置文件 `tauri.conf.json`：`decorations: false`、`fullscreen: true`、`alwaysOnTop: false`（壁纸不该压过其他窗口；要"垫底"靠穿透形态自然达成）。
3. 前端：全局热键（如 Ctrl+Alt+P）切换 `setIgnoreCursorEvents`；托盘菜单提供"打开控制台/退出"。
4. 验收：打包 MSI/NSIS 安装包，开机自启后全屏渲染、不响应鼠标（除热键唤出的面板）、任务管理器中 CPU/GPU 占用与浏览器版持平。

## 4. 决策记录

- 桌面封装技术选型：**Tauri v2**（Electron 排除理由：安装包体积与内存占用与"安静壁纸"定位冲突；技术设计文档已确认暂不引入 Electron）。
- 窗口形态：**全屏不透明 + 鼠标穿透**，放弃 WorkerW 垫底方案。
- 时机：浏览器版验收稳定后（完成日常使用验收）再启动 M6。
