# 原始开发提交时间线

以下49次提交来自开发历史，仅保留日期、技术摘要与短哈希；摘要已中性化整理，不是原始提交消息的逐字引用。哈希属于本地原始历史，不是公开快照仓库中的可点击提交。原始Git对象保存在私有本地bundle备份中。

```text
ad2ec6a | 2026-10-14 | M0: 项目初始化 —— Vite+TS strict 脚手架、模拟核心(types/rng/spatial-hash/force-curves/integrator/engine)、调试渲染、浏览器主循环、34 项测试全绿
f417c8b | 2026-11-03 | M1: Particle Life 核心模拟 —— 分段正弦力+空间哈希、三种随机矩阵(全随机/对称/稀疏)、wrap/repel、Preset序列化、可复现；51测试全绿，500粒子单步1.6ms
5baa7eb | 2026-11-03 | M1修订: 修复视觉校准三问题 —— 对角线自排斥防坍缩(k>0+宽核)、稀疏矩阵无旁观类型、渲染插值环绕感知防边缘闪动；节奏放缓(45/32/9)；新增回归测试
e91127b | 2026-11-03 | M2: Deep Ocean 视觉 —— 预渲染光晕精灵+1/4分辨率加色辉光层+拖尾渐隐+速度平滑亮度(时间域低通)+深海色板；错误面板自检；61测试全绿
0104dbd | 2026-11-03 | M2修订: 持续运动不冻结(gamma 0.5/jitter 30,防结晶)+亮度全面下调(光晕透明度减半/合成0.6/亮度上限0.85/拖尾0.95)；新增不冻结回归测试(平均速度3.9单位/秒)
4bfdfcf | 2026-11-03 | M2修订2: 抑环(同类自聚0.5-1.0→0.15-0.4, jitter 30→45, forceScale 45→40) + 限曝(光晕峰值0.22/合成0.5/亮度上限0.75) + 光晕逐像素生成+抖动消除色带；62测试全绿
d67ee30 | 2026-11-03 | M2修订3(结构性): 引入定向自驱动(洋流式运动,theta缓慢随机游走,3秒方向自相关0.47) + 光晕两遍合成(source-over硬上限防烧白+lighter低强度融合) + 拖尾0.88防累积过曝; 新增洋流判别测试; 63测试通过
7440f14 | 2026-11-04 | v0.4.0: 粒子寿命系统 —— 正态分布寿命(均值90s/实测93.9±43.4)、虚空随机重生、生灭渐隐(lifeFade 4s)、数量恒定；Rng.normal(Box-Muller)；4项新测试；67测试全绿
b4fddd9 | 2026-11-04 | v0.4.1: 密度感知调光 —— 模拟层统计局部密度(相互作用邻居数),渲染层光晕亮度÷(1+密度): N粒子合计<N·a/(1+N)<a,数学上封死密集区过曝; 核心亮度保留35%下限; 修复两粒子测试的隐藏干扰(count=4)
758f011 | 2026-11-04 | M3: Boids 鱼群模式（Reynolds 三规则 + 转向力）
4d827b5 | 2026-11-04 | v0.5.1: Boids 活力改版——个体方向性 + 距离加权影响
8d08fe9 | 2026-11-04 | v0.5.2: 琥珀亮色族群 + 同类偏好（视觉校准）
0b91546 | 2026-11-04 | M4: 控制面板——实时参数调节 + 双模式切换 + 预设持久化
9e7dd05 | 2026-11-04 | M5: 性能基准工具链 + 性能报告 + 渲染后端决策 + Tauri 评估
b4f060e | 2026-11-04 | v0.7.1: 回填实机浏览器基准数据，闭环 ADR-001
d27e1d8 | 2026-11-04 | v0.7.2: 修复拖尾>0.9 背景永久积色晕 + 个体光晕大小差异
2d253ce | 2026-11-04 | v0.7.3: 长拖尾背景染色——按修订方案加周期性硬清空
c312db7 | 2026-11-04 | Revert "v0.7.3: 长拖尾背景染色——按修订方案加周期性硬清空"
5a5cdd1 | 2026-11-05 | v0.7.5: 长拖尾微清洁——连续微调方案（无闪烁版）
50c8ad0 | 2026-11-05 | v0.7.6: 微清洁从周期脉冲改为恒定增益——消除可感知闪烁
6e828ff | 2026-11-05 | v0.7.7: 呼吸式微清洁——方波改正弦，bug 驯化为呼吸特性
243b289 | 2026-11-05 | v0.7.8: 呼吸周期在 5-10s 间以 45s 慢正弦游走，相位累加无跳变
a71ef36 | 2026-11-05 | v0.7.9: 呼吸改为向上变亮——以当前亮度为最小值，峰值 +35%
bbbea16 | 2026-11-05 | M6: 修复 Rust 托盘代码——适配 tauri 2.12 API（菜单句柄入状态、with_id 参数序、ManagerExt 导入）
f1a99f8 | 2026-11-05 | M6: 版本号对齐 v0.7.9
bb6b8a2 | 2026-11-05 | M6: Cargo.lock 版本对齐
a2ea381 | 2026-11-05 | M6 收尾: 添加 README 指路牌指向移交手册
2fd3125 | 2026-11-05 | feat: add Windows desktop wallpaper mode and optional performance overlay
bc8e107 | 2026-11-05 | fix: remove wallpaper frame and console, add tray click settings
38d8d5b | 2026-11-05 | fix: disable wallpaper shadow insets and use full monitor bounds
a9b33c1 | 2026-11-05 | docs: confirm v0.8.2 stable release and defer Easter eggs
385c9e1 | 2026-11-05 | feat: add optional cursor interaction and pixel Easter egg stamps
11c1c79 | 2026-11-05 | feat: add green creeper tint and collapsible settings with startup controls
4acd6be | 2026-11-05 | feat: sleep covered wallpaper and add adaptive background scheduling
bcc7d08 | 2026-11-05 | fix: support raised desktop hosts and remove partial-cover FPS reduction
7a046bb | 2026-11-05 | fix: enable all-trail breathing and improve glow gradient sampling
619348d | 2026-11-05 | feat: introduce Life and Competition ecological variants for v1.0.0
1853077 | 2026-11-05 | feat: distinguish pack and solitary ecology with restrained energy cues
774e1ec | 2026-11-06 | fix: track newborn cues and moderate pack predator reproduction
9186c70 | 2026-11-06 | feat: add emergent grazer and pack predator leaders
194e59d | 2026-11-06 | feat: strengthen leaders and gather schools around them
0046433 | 2026-11-06 | feat: add forward guards and emergency defense to ecology
7470d31 | 2026-11-06 | feat: add per-species ecology baseline controls
9ddace3 | 2026-11-06 | feat: add floating console layout and species sliders
ef333f3 | 2026-11-06 | feat: add individual mutation and inherited evolution mode
bf16dd7 | 2026-11-07 | feat: stabilize inherited lineages and soften conflicts
4dea3de | 2026-11-07 | fix: clarify evolution observations and unlock experimental capacity
4a2dd51 | 2026-11-07 | feat: add connected habitats and effective energy-conserving hunts
ab086f4 | 2026-11-07 | feat: add seeded terrain cues and energy-funded paired reproduction
```
