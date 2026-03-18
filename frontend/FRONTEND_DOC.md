# 前端文档（业务模块与组件实现）

本文档面向开发者，重点描述前端各业务模块、组件的设计目的、数据流与关键实现逻辑，便于快速上手与后续扩展。

## 1. 技术栈与约束

- **构建**：Vite
- **框架**：React + TypeScript（strict）
- **画布**：`@xyflow/react`
- **状态**：Zustand（单一事实源）
- **样式**：TailwindCSS

核心原则：

- **“页面负责装配”**：页面层只做组合与依赖注入，复杂 UI 与交互封装到组件/节点内。
- **“store 为单一事实源”**：跨区域状态（nodes/edges、日志、收藏、预览、会话、UI 折叠、AI 任务状态）统一收敛在 `useCanvasStore`。
- **“领域逻辑可测试/可复用”**：DAG 执行逻辑集中在 `utils/dagExecutor.ts`，与 UI 解耦。

## 2. 目录结构（前端）

```text
src/
  main.tsx                 # 应用入口（挂载 React Root、引入样式）
  App.tsx                  # 顶层组件（渲染 CanvasPage）
  pages/CanvasPage.tsx     # 页面装配（左侧栏 + 画布 + 右侧对话 + 模态）
  components/              # 通用组件（面板、模态、状态展示等）
  nodes/                   # 画布节点组件（Text / LLM / Image）
  store/canvasStore.ts     # Zustand store（单一事实源）
  hooks/useApi.ts          # 后端 API 封装
  utils/dagExecutor.ts     # DAG 执行器（拓扑排序 + 全量/子图执行）
```

## 3. 业务模块总览

### 3.1 画布编排（核心）

目标：提供“拖拽创建节点 + 连线形成 DAG + 选择/多选/平移/缩放”等基础能力。

- **入口页面**：`src/pages/CanvasPage.tsx`
- **画布引擎**：`@xyflow/react`（Nodes/Edges/Viewport）
- **关键状态**：`useCanvasStore().nodes / edges / selectedNodeId`

核心交互策略（为避免手势冲突）：

- **框选为主**：`selectionOnDrag` + `selectionMode=Partial`
- **禁用 Shift 多选**：`multiSelectionKeyCode={null}`（避免多选与其它交互冲突）
- **按住 Space 才可平移**：`panOnDrag={false}` + `panActivationKeyCode='Space'`

#### 3.1.1 节点拖拽创建（Palette → Canvas）

**设计目标**：让“创建节点”具备明显的可发现性（左侧面板拖拽），且落点准确（以鼠标 drop 点映射到画布坐标系）。

实现拆解：

- **拖拽源（PaletteItem）**：在 `LeftPanel` 的节点列表中，每个条目是一个可拖拽元素：
  - `draggable`
  - `onDragStart` 写入 `dataTransfer`：key 为 `application/flow-canvas-node`，value 为 `NodeType`（`text_input|llm_generate|image`）
- **拖拽目标（ReactFlow）**：在 `CanvasPage` 内的 `ReactFlow` 上处理：
  - `onDragOver`：`preventDefault()` 并设置 `dropEffect='move'` 允许 drop
  - `onDrop`：
    - 从 `dataTransfer` 读取节点类型
    - 使用 `ReactFlowInstance.screenToFlowPosition()` 将屏幕坐标转换为 Flow 坐标
    - 调用 `useCanvasStore().addNode(type, position)` 落地创建

关键点：

- **坐标转换必须依赖容器 bounding rect**，否则会出现“落点偏移”。
- **节点创建只走 store**，确保 nodes/edges 的状态源统一。

#### 3.1.2 连线与连接交互（Connect）

**设计目标**：连接操作要“好点、好连、不误触”，并且为 DAG 执行提供明确的依赖关系。

实现拆解：

- **端点（Handle）**：节点组件内通过 `Handle` 暴露连接点：
  - `TextInputNode`：右侧 `source`（作为上游输出）
  - `LlmGenerateNode`：左侧 `target`（消费上游文本/图片）
  - `ImageNode`：右侧 `source`（图片节点可作为后续操作的上游）
- **可点击性与可见性优化**：
  - 端点加大尺寸、加边框、提高 `zIndex`，并向外微移（避免被节点边框/圆角遮挡）
- **连接事件（onConnect）**：
  - `ReactFlow` 的 `onConnect` 交给 store：`useCanvasStore().onConnect(connection)`
  - store 内部使用 `addEdge` 追加 edge，保证连线变更逻辑集中

连接规则（当前实现约束）：

- 前端不强制类型校验（例如 text→llm_generate 是常见路径），主要把“正确性”交由 **DAG 执行器** 在运行时校验：
  - 非法边（指向不存在节点）→ 抛 `DagInvalidEdgeError`
  - 存在环（cycle）→ 抛 `DagCycleError`

### 3.2 DAG 执行（全图 / 单节点）

目标：将画布连线视作 DAG，按依赖顺序逐节点执行，支持“只执行目标节点的依赖子图”。

- **领域逻辑**：`src/utils/dagExecutor.ts`
- **触发入口**：
  - 全图：`useCanvasStore().run()`
  - 单节点：`useCanvasStore().runNode(nodeId)`（由 `LlmGenerateNode` 的 Run 触发）

关键实现：

- **拓扑排序（Kahn）**：校验非法边、检测环（cycle）并抛错。
- **执行输出模型**：执行阶段维护 `outputs` 映射，确保上游输出可被下游消费：
  - `text_input` 输出 `{kind:'text', text}`
  - `image` 输出 `{kind:'image', url}`（静态，不请求后端）
  - `llm_generate` 优先消费上游 text，否则用节点内 prompt 调用后端生成图片 URL
- **子图执行**：从目标节点向上游回溯依赖集合，仅执行集合内节点，避免全图重跑。

### 3.3 图片节点与 AI 操作编排（重点）

目标：图片节点支持多图输入与展示，并支持 AI 操作（局部重绘/抠图/超清/文字重绘/生成视频等），同时保证多图并发下的状态一致性与可观测性。

组件：`src/nodes/ImageNode.tsx`  
编排：`useCanvasStore().runImageNodeAction()`

#### 3.3.1 多图模型

- `images: string[]`：多张图 URL（可来自上传/手填/模拟）
- `activeIndex: number`：当前选中展示的图片

输入方式：

- 本地上传：`URL.createObjectURL(file)`（便于快速预览）
- 手动 URL：直接编辑当前图片 URL
- 模拟上传：生成示例 URL（用于演示/调试）

#### 3.3.2 统一的 AI 任务状态（aiTask）

为解决“不同动作、单图/多图、多并发下状态字段散乱”的问题，图片 AI 操作统一使用 `ImageData.aiTask` 表达任务状态：

- `action / prompt`：本次任务动作与参数
- `status: idle|running|success|error`
- `progress: number`：整体进度（0~100）
- `items?: { index, status, progress, errorMessage? }[]`：多图时每张图的细粒度状态
- `createdAt / updatedAt`：便于日志与调试

UI 展示逻辑：

- 任务执行中（`aiTask.status === 'running'`）时展示进度面板
- 多图时取 `items[idx].progress` 展示分图进度，并用整体平均值展示总体进度

#### 3.3.2.1 AI 任务交互设计（动作入口 → 状态反馈 → 结果沉淀）

**设计目标**：让 AI 操作具备“低打扰、高反馈、可追溯”的交互体验，适配单图/多图并发与多轮迭代。

交互闭环：

- **动作入口（ImageNode 工具栏）**
  - 节点被选中时展示操作栏（悬浮在节点上方）
  - 常用动作提供直达入口（如“再次生成/超清/抠图”），更多动作收在 More 菜单中
  - 对需要 prompt 的动作（局部重绘/文字重绘/微调/生成视频等）使用 composer 输入框统一承载
- **任务状态反馈（aiTask）**
  - 点击“开始”后：store 将目标节点/结果节点的 `aiTask.status` 置为 `running`
  - 前端使用模拟进度（progress timer）驱动 `aiTask.progress` 与 `items[idx].progress` 渐进更新
  - 某张图失败时：写入 `items[idx].status='error'` 与 `errorMessage`，总体任务仍可继续（最终聚合 success/error）
- **结果沉淀（新节点 + 连线）**
  - 图片操作的输出不覆盖源节点：创建新的 Image 结果节点并连边到源节点
  - 每张图完成后按索引回填到结果节点的 `images[idx]`，并追加到会话（chat image message）

关键实现要点：

- **多图并发的一致性**：以 `items[idx]` 作为并发粒度，确保不会“写错图/错位回填”。
- **任务聚合状态**：全部完成后根据成功数设置结果节点状态（success/error）并写入摘要错误（例如部分失败比例）。
- **可观测性**：执行全程写入 `logs`（scope=image_action），并在左侧面板展示。

#### 3.3.3 结果节点与可追溯

图片 AI 操作的结果不会覆盖原节点，而是创建一个新的 **Image 结果节点**并连边到源节点：

- 便于回溯“这张图是由哪张图/哪个动作生成”
- 便于多轮迭代（节点链路天然记录历史）
- 便于单独选中结果节点继续操作

#### 3.3.4 会话与收藏闭环

- **加入会话**：图片可一键追加为 chat 的 image message（`ChatPanel` 展示）
- **收藏夹**：收藏图片 URL 并持久化到 localStorage，支持预览/删除/加入会话

### 3.4 对话面板（Chat）

组件：`src/components/ChatPanel.tsx`

设计要点：

- 支持 `text` 与 `image` 两种消息类型（`chatMessages` 存在 store 中）
- 新消息自动滚动到底部（requestAnimationFrame）
- 输入框：Enter 发送、Shift+Enter 换行

### 3.5 收藏夹与预览（Modal）

- 收藏夹：`src/components/FavoritesModal.tsx`
  - 从 store 读取 `favorites`，按时间倒序渲染
  - 交互：预览、加入会话、删除
- 图片预览：`src/components/ImagePreviewModal.tsx`
  - ESC 关闭、点击遮罩关闭
  - 可选：复制 URL、收藏/取消收藏

## 4. 组件设计与实现逻辑

### 4.1 页面装配：CanvasPage

文件：`src/pages/CanvasPage.tsx`

职责边界：

- **依赖注入**：把 `useApi()` 返回的 `generateImage/applyImageAction/generateVideo` 注入 store（`setGenerateImageFn` 等）
- **画布类型映射**：构建 `nodeTypes`（Text/LLM/Image）
- **组合布局**：LeftPanel + ReactFlow + RightPanel + 全局模态

不做的事：

- 不在页面里写复杂 UI（日志渲染、tips、右侧折叠等都组件化）
- 不在页面里写 DAG/AI 编排逻辑（统一在 store + utils）

### 4.2 左侧面板：LeftPanel

文件：`src/components/LeftPanel.tsx`

包含模块：

- 顶部工具区：折叠、操作提示（popover）、打开收藏夹
- 节点 Palette：拖拽时写 `dataTransfer`，由画布 `onDrop` 消费
- API Base URL 卡片：复制/打开（通过上层传入回调实现）
- 日志模块：渲染 store `logs`，对结果做脱敏（不展示 url 字段）
- 错误提示：优先展示 `globalError`，否则展示 `api.error`

### 4.3 右侧面板壳：RightPanelShell

文件：`src/components/RightPanelShell.tsx`

职责：提供“折叠/展开”的外壳与按钮，内部挂载 `ChatPanel`。

### 4.4 节点组件（Text / LLM / Image）

#### TextInputNode

文件：`src/nodes/TextInputNode.tsx`

- 输入文本写回 store：`updateNodeData(id, updater)`
- 输出端点：source handle（右侧）

#### LlmGenerateNode

文件：`src/nodes/LlmGenerateNode.tsx`

- prompt 编辑写回 store
- “Run” 按钮触发 `useCanvasStore().runNode(id)`：执行到当前节点（依赖子图）
- 输入端点：target handle（左侧）

#### ImageNode

文件：`src/nodes/ImageNode.tsx`

- 多图输入：上传/URL/模拟
- 展示：缩略图列表 + 预览区域（执行中展示进度面板）
- 工具栏（选中时出现）：再次生成/超清/抠图等动作入口 + 更多操作菜单
- 输出端点：source handle（右侧）

### 4.5 通用状态展示：StatusPill

文件：`src/components/StatusPill.tsx`

目的：统一渲染 `RunStatus`（idle/running/success/error）视觉样式，避免各节点重复实现。

## 5. 状态管理（useCanvasStore）

文件：`src/store/canvasStore.ts`

关键域：

- **画布**：`nodes / edges`
- **选择**：`selectedNodeId`
- **执行**：`run / runNode / runImageNodeAction`
- **日志**：`logs`（有上限，防止无限增长）
- **会话**：`chatMessages`
- **收藏与 UI**：`favorites`、`favoritesOpen`、`leftPanelCollapsed/rightPanelCollapsed`（localStorage 持久化）
- **预览**：`preview`（全局预览模态）
- **API 注入**：`generateImageFn / applyImageActionFn / generateVideoFn`

## 6. 接口层（useApi）

文件：`src/hooks/useApi.ts`

- `VITE_API_BASE_URL`（默认 `http://localhost:3001`）
- `generateImage(prompt)`：`POST /api/ai/generate`
- `applyImageAction(req)`：`POST /api/ai/image/action`
- `generateVideo(req)`：`POST /api/ai/video/generate`

实现要点：

- 对 `res.ok` 与 JSON 结构做校验，失败抛错并设置 `error`
- store 负责捕获并把错误转换为 UI 可读信息（节点状态/全局错误/日志）

## 7. 扩展点建议

- **新增节点类型**：
  - 扩展 store 的 `NodeType` 与节点 data
  - 在 `CanvasPage` 中加入 `nodeTypes` 映射
  - 在 `dagExecutor` 中补齐执行分支（或引入可注册的执行器映射）
- **AI 任务增强**：
  - 在 `aiTask` 中引入 `abortController` 支持取消
  - 引入去重与缓存（相同输入不重复跑）
  - 对失败 item 增加“一键重试失败项”

## 8. 实现细节（深度版）

本章按“从外到内”的顺序补齐实现细节：页面装配 → 组件 → hooks → store → utils → 约束与扩展。内容尽量贴合当前代码与命名，便于直接搜索定位。

### 8.1 页面装配与依赖注入（CanvasPage）

文件：`src/pages/CanvasPage.tsx`

**核心职责**：

- **注册节点渲染器**：通过 `nodeTypes` 映射 node type → React 组件
  - `text_input → TextInputNode`
  - `llm_generate → LlmGenerateNode`
  - `image → ImageNode`
  - `video → VideoNode`
- **注入 API 函数到 store**：`useApi()` 返回的接口函数在 `useEffect` 内注入：
  - `setGenerateImageFn(api.generateImage)`
  - `setApplyImageActionFn(api.applyImageAction)`
  - `setGenerateVideoFn(api.generateVideo)`
  - 卸载时置空，避免 stale 引用与误调用
- **装配布局**：
  - 左侧：`LeftPanel`
  - 中间：`ReactFlow` + `FlowControls` + `FavoritesModal` + `ImagePreviewModal`
  - 右侧：`RightPanelShell`

**页面不做的事（边界）**：

- 不负责 DAG/AI 执行策略（交给 store + utils）
- 不负责日志渲染与脱敏（交给 LeftPanel）
- 不负责 tips 打开/关闭（交给 LeftPanel）

### 8.2 组件：LeftPanel（左侧业务容器）

文件：`src/components/LeftPanel.tsx`

#### 8.2.1 节点 Palette：拖拽创建节点

拖拽链路分为两端：

- **拖拽源（PaletteItem）**：在 `onDragStart` 中写入：
  - `dataTransfer.setData('application/flow-canvas-node', type)`
  - `dataTransfer.effectAllowed = 'move'`
- **拖拽目标（ReactFlow）**：在 `CanvasPage` 的 `ReactFlow.onDrop` 中读取：
  - `const type = e.dataTransfer.getData('application/flow-canvas-node') as NodeType`
  - `screenToFlowPosition({x,y})` 将屏幕坐标转为画布坐标
  - `addNode(type, position)` 创建节点

约束：

- **不提供 `video` 的 palette 入口**，确保“视频节点只能通过任务生成”。

#### 8.2.2 Tips Popover：关闭策略

tips 关闭由两类事件触发：

- **ESC**：`keydown` 监听 Escape
- **点击外部**：`pointerdown` 判断点击目标是否在 popover 或 anchor button 内

监听仅在 `tipsOpen=true` 时挂载，避免全局常驻监听。

#### 8.2.3 日志渲染与结果脱敏（sanitizeResult）

- UI 层限量：`logs.slice(-60)`（避免长列表卡顿）
- 结果脱敏：`sanitizeResult()` 递归过滤字段：
  - **过滤包含 url 的 key**（`/url/i`）、`source`、`sourceImageUrl`
  - 避免把 image/video 的长链接直接铺在日志面板

### 8.3 组件：RightPanelShell（右侧折叠壳）

文件：`src/components/RightPanelShell.tsx`

- 只负责折叠/展开 UI 与按钮
- 内部渲染 `ChatPanel`
- 折叠状态由 store 持久化（`UI_KEY`）

### 8.4 hooks：useApi（接口封装）

文件：`src/hooks/useApi.ts`

#### 8.4.1 Base URL 决策

- 读取 `import.meta.env.VITE_API_BASE_URL`
- 为空时 fallback 到 `http://localhost:3001`

#### 8.4.2 请求与响应强校验

`useApi` 的特点是“宁可前端报错，也不吞掉结构错误”：

- `generateImage(prompt)`：校验响应必须含 `images: string[]` 且可取到 `images[0]`
- `applyImageAction(req)`：校验响应必须含 `imageUrl: string`
- `generateVideo(req)`：校验响应必须含 `videoUrl: string`

失败路径：

- `setError(message)` 供左侧面板展示
- `throw` 给 store 捕获并落地到节点状态/logs/globalError

### 8.5 store：canvasStore（单一事实源）

文件：`src/store/canvasStore.ts`

#### 8.5.1 核心数据模型

- `NodeType`：`text_input | llm_generate | image | video`
- `RunStatus`：`idle | running | success | error`
- 节点 data：
  - `TextInputData`：`text + status`
  - `LlmGenerateData`：`prompt + resultImageUrl + status`
  - `ImageData`：`images[] + activeIndex + status + aiTask? + source*`
  - `VideoData`：`videos[] + activeIndex + status + aiTask? + source*`
- 任务统一状态：
  - `ImageAiTask`：`action/prompt/status/progress/items/createdAt/updatedAt`

#### 8.5.2 nodes/edges 的集中变更

- `onNodesChange`：`applyNodeChanges`
- `onEdgesChange`：`applyEdgeChanges`
- `onConnect`：`addEdge`
  - **额外约束**：若 source 节点为 `video`，忽略连接（视频节点只能终止）

#### 8.5.3 节点创建：addNode

store 支持创建 `text_input/llm_generate/image/video`：

- id：`${type}-${nodeSeq++}`
- 初始化 data：
  - `video` 默认 `videos=[]`，但 **不会在 UI 里被手动创建**（只是保证类型闭环）

#### 8.5.4 DAG 执行：run / runNode

- `run()`：
  - 统一置 `isRunning=true`
  - 清理旧错误/旧结果，避免误以为复用旧图
  - 调用 `executeDag` → 回填 `llm_generate.resultImageUrl`
  - 错误统一落 `globalError` 并标记节点 `error`
- `runNode(nodeId)`：
  - 调用 `executeDagToTarget`
  - 只更新本次实际执行到的节点状态，减少 UI 抖动

#### 8.5.5 图片/视频任务：runImageNodeAction（编排中心）

此函数覆盖：

- 图片动作：局部重绘/抠图/文字重绘/微调等（创建新的 image 结果节点）
- 视频动作：`generate_video`（创建新的 video 结果节点）

关键设计：

- **任务统一状态（aiTask）**：
  - 多图并发用 `aiTask.items[idx]` 做最小粒度（progress/status/errorMessage）
  - `aiTask.progress` 作为整体进度（items 平均值）
- **结果节点不覆盖源节点**：
  - 图片任务产出新的 `image-*`，并创建 edge：`image → image`
  - 视频任务产出新的 `video-*`，并创建 edge：`image → video`
- **进度模拟**：
  - `progressTimers` 管理 interval
  - `startProgress` 进度先到 92%，完成瞬间跳 100%
  - 删除节点时 `stopAllProgressForNode` 清理定时器，避免泄漏

#### 8.5.6 持久化（localStorage）

- 收藏：`flow-canvas:favorites:v1`
  - `loadFavorites` 做容错与修复
  - `persistFavorites` 写回
- UI 折叠：`flow-canvas:ui:v1`
  - `loadUi` / `persistUi`

#### 8.5.7 日志体系（logs）

- `appendLog()`：统一写入日志并限量（`slice(-250)`）
- scope：
  - `dag`：全图执行
  - `node`：单节点执行
  - `image_action`：图片/视频任务

### 8.6 utils：dagExecutor（DAG 引擎）

文件：`src/utils/dagExecutor.ts`

#### 8.6.1 正确性：topoSort

- 构建 `nodeById/inDegree/outAdj`
- 非法边（指向不存在节点）→ `DagInvalidEdgeError`
- 排序长度不足 → `DagCycleError`

#### 8.6.2 执行：executeTopo

- `outputs` 保存每个节点产物，供下游消费
- 当前逻辑：
  - `text_input`：产出 text
  - `image`：产出 image(url)
  - `llm_generate`：产出 image(url)（调用后端）
  - `video`：当前不参与消费，仅写入 outputs 便于未来扩展

#### 8.6.3 子图执行：executeDagToTarget

- target 反向回溯祖先依赖集合 `need`
- `shouldExecute(id)` 只执行 need 中节点

### 8.7 节点交互与约束（Node 层）

#### 8.7.1 连接点（Handle）可见性

为了避免端点被边框/圆角遮挡，节点统一：

- 加大 Handle
- 增加边框/阴影
- 向外偏移（`left/right: -7`）
- `zIndex` 提高

并且：

- `ImageNode`：`target + source`（支持“图片→图片”连线）
- `VideoNode`：**仅 target**（终止节点）

#### 8.7.2 悬浮工具栏与裁剪

图片节点工具栏会向外溢出（`absolute -top-*`）：

- 根容器不能 `overflow-hidden`
- 若要裁剪内部内容，应在内部子容器做裁剪，而不是根容器

### 8.8 工程化运行与调试

- 根目录推荐：`pnpm dev`（前后端并行）
- 默认端口：
  - 前端：5173
  - 后端：3001
- 端口占用排查：参考根 `README.md` 的 FAQ

