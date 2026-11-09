# Emergent Light · 混沌与涌现的光点

深海光点风格的粒子模拟与 Windows 动态壁纸。当前版本 **2.3.0**。

支持粒子生命、鱼群、生态鱼群、生态粒子生命，以及独立的“变异与进化”模式。进化模式包含八轴遗传、种子地理、猎食、双亲繁殖与可关闭的低概率出芽。

## 下载安装（Windows x64）

| 版本 | 适合体验的内容 | 下载入口 |
|---|---|---|
| **2.3.0 · 推荐** | 种子地理、八轴遗传、双亲繁殖、可关闭出芽 | [最新版安装包](https://github.com/fanscoder/emergent-light/releases/tag/v2.3.0) |
| 1.5.0 · 经典生态 | 群猎/独猎、头领护卫、浮动控制台 | [历史节点](https://github.com/fanscoder/emergent-light/releases/tag/v1.5.0) |
| 2.0.0 · 初代遗传 | 六轴遗传、出芽突变与遗传外观，生态稳定性不及后续版本 | [历史节点](https://github.com/fanscoder/emergent-light/releases/tag/v2.0.0) |

每个Release包含安装包和SHA-256校验文件，源码标签对应实际版本。不同版本共用应用标识；切换前可导出预设，旧版不支持全部新版参数。

## 浏览器体验

安装 Node.js 后，在项目目录运行：

```sh
npm ci
npm run dev
```

打开终端提示的本地地址。浏览器可体验模拟；桌面壁纸、系统托盘与开机自启需要 Windows 桌面版。

## Windows 桌面版构建

准备 Node.js、Rust、Visual Studio C++ 构建工具和 WebView2，保持构建工具与目标架构匹配。

```sh
npm ci
npm run tauri -- build
```

安装包生成在 `src-tauri/target/release/bundle/nsis/`。当前已验证的安装目标为 Windows x64；ARM64 原生构建尚未验收。Windows x64安装包可从[Releases](https://github.com/fanscoder/emergent-light/releases)下载。

## 操作

控制台支持拖动、缩放、折叠，参数附说明。在进化模式中可开关地理线索、配对与出芽。默认配对为主；仅保留低概率出芽不保证种群延续。实验范围可提升到1000个体，流畅度取决于设备。

Windows 桌面版点击“桌面壁纸”进入壁纸模式，通过系统托盘图标返回设置。快捷键与完整说明见应用内指南。

## 开发与验证

```sh
npm run build
npm test
```

维护说明见 [维护指南](docs/handover.md)、[技术设计](docs/technical-design.md) 与 [2.3.0 版本记录](docs/release-v2.3.0.md)。历史记录中的路径已做去标识处理；部分历史验证脚本和截图属于本地工作环境，不包含在源码中。

本仓库为去除个人路径及开发环境记录后的首次公开快照；开发历史另行保存。未包含依赖目录、构建缓存、账号凭据或用户预设。Minecraft 苦力怕形状彩蛋为可选效果；本项目与 Mojang/Microsoft 无关联。

## 开发历程

项目愿景、设计演变、49次原始提交年表与阶段截图，见[开发历程索引](docs/history/README.md)。
