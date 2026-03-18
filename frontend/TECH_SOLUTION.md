# 前端技术方案（Flow Canvas）

> 目标：在浏览器中提供一套“可视化编排 + 可执行”的 AI 工作流画布。用户通过拖拽节点、连线形成 DAG，并支持全图执行、单节点执行、图片节点多图处理、会话与收藏等能力。

## 1. 项目设计

### 1.1 设计目标

- **低门槛编排**：拖拽节点 + 连线即可构建流程；节点可编辑参数并即时反馈结果。
- **可执行性**：工作流必须可验证（无环）、可部分执行（只跑目标节点依赖）、可观测（日志/状态/错误）。
- **强交互体验**：画布缩放、框选、多选整体拖动、按空格平移等符合常见设计工具习惯。
- **多模态闭环**：LLM 节点产出图片 URL，图片节点支持“AI 操作/生成视频/加入会话/收藏/预览”。

### 1.2 技术栈选型

- **React 19 + TypeScript（strict）**：组件化与类型约束保证复杂交互下的可维护性。
- **Vite**：快速开发、构建简单。
- **@xyflow/react**：成熟的流程画布能力（Nodes/Edges/Viewport/Selection）。
- **Zustand**：轻量全局状态，适配画布这种高频状态变更场景。
- **TailwindCSS**：快速构建一致的暗色 UI 与交互态样式。
- **Fetch API**：直接对接后端 AI 能力（生成、图片操作、视频生成）。

### 1.3 架构分层（以“可演进”为核心）

- **页面层**：`CanvasPage` 聚合画布与面板，负责“装配”而非业务实现。
- **节点层**：`TextInputNode / LlmGenerateNode / ImageNode` 仅承载节点 UI 与局部交互。
- **状态层（单一事实源）**：`useCanvasStore` 统一管理 nodes/edges、执行状态、日志、收藏、会话等。
- **领域逻辑层（纯逻辑）**：`dagExecutor` 实现 DAG 校验、拓扑排序、执行策略（全量/到目标）。
- **接口层**：`useApi` 封装 baseUrl、请求与响应校验，向 store 注入可调用函数。

## 2. 核心模块

### 2.1 画布模块（重点）

#### 2.1.1 画布渲染与交互（ReactFlow 装配）

- **节点类型映射**：统一由 `nodeTypes` 映射 `text_input / llm_generate / image`。
- **拖拽创建节点**：Palette 拖拽时写入 `dataTransfer`，在画布 `onDrop` 中转为节点并落点到 Flow 坐标。
- **选择/多选策略**
  - 空白处拖拽：直接框选（`selectionOnDrag`）
  - **禁用 Shift 多选**：避免交互冲突，强制用框选做多选（`multiSelectionKeyCode={null}`）
  - 多选后拖动任一选中节点：整体移动（Flow 默认行为）
- **视图手势冲突处理**
  - **按住 Space 才允许拖拽平移**：避免与框选手势冲突（`panOnDrag={false}` + `panActivationKeyCode='Space'`）
- **工程化体验**
  - `FlowControls` 提供 zoom in/out/fitView
  - MiniMap 便于大画布导航

#### 2.1.2 DAG 运行模型（全量执行 / 单节点执行）

- **拓扑排序（Kahn）**：对 nodes/edges 计算入度与邻接表，排序长度不足则判定 **存在环** 并报错。
- **执行时的“产物模型”**：执行过程中维护 `outputs`：
  - `text_input` 产出 text
  - `image` 产出 url（不请求后端）
  - `llm_generate` 消费上游 text（若存在）或自身 prompt，调用后端生成图片 url
- **单节点运行**：从目标节点向上游回溯依赖集合，只执行依赖子图，避免全图重跑导致等待与 UI 抖动。

#### 2.1.3 图片节点（多图 + AI 操作编排）

- **多图数据结构**：`images[] + activeIndex`，支持缩略图切换当前图。
- **输入方式**
  - 手动填 URL
  - 本地上传（`URL.createObjectURL`）
  - 模拟上传（便于 demo）
- **AI 操作执行策略**
  - 对每张图并发执行，前端提供 **模拟进度条**（改善感知性能）
  - 结果落到新的 Image 节点，并自动连边到源节点（保持可追溯）
  - 成功结果追加到 Chat（image message），形成“画布→会话”的闭环
- **可用性操作**：预览大图、复制 URL、打开新标签下载、收藏、加入会话、删除当前图片/删除节点

### 2.2 状态管理模块（Zustand Store）

- **单一事实源**：nodes/edges/selectedNodeId/isRunning/globalError/logs/chatMessages/favorites/uiCollapsed/preview 等全部集中管理。
- **持久化**
  - 收藏夹与 UI 折叠态使用 localStorage 存储版本化 key，便于未来升级迁移。
- **可观测性（日志）**
  - DAG、节点、图片操作统一写日志，并做容量限制防止无限增长。
  - 页面层对日志结果做字段清洗（避免展示 url 等敏感/冗余字段）。

### 2.3 接口模块（useApi）

- **统一 baseUrl**：`VITE_API_BASE_URL`，默认 `http://localhost:3001`。
- **请求封装**：三类能力
  - 图片生成：`/api/ai/generate`
  - 图片操作：`/api/ai/image/action`
  - 视频生成：`/api/ai/video/generate`
- **强校验**：对 HTTP 状态与响应 JSON 结构做校验，失败抛错并在 UI 侧呈现。

## 3. 项目重难点与解决方案（重点在画布）

### 3.1 画布交互复杂度高：框选、多选、平移、拖拽落点

- **难点**：常见冲突是“拖拽平移画布”与“框选”抢手势，造成误操作。
- **方案**：
  - 将平移收敛为“Space + 拖拽”显式手势
  - 禁用 Shift 多选，统一使用框选做多选，减少学习成本与实现复杂度

### 3.2 DAG 正确性：防环、边合法性、可部分执行

- **难点**：画布连线自由度高，必须在执行前保证流程可执行（DAG），并支持“只跑我关心的节点”。
- **方案**：
  - 拓扑排序检测 cycle，执行前直接失败并提示修正连线
  - `executeDagToTarget` 做依赖回溯 + 子图执行，提升交互效率

### 3.3 异步 AI 操作体验：并发、多图进度、结果回填一致性

- **难点**：多图并发时，UI 要持续反馈进度，且需要把每张图的结果稳定写回到正确位置，避免错位与闪烁。
- **方案**：
  - 为“结果节点 + 每张图”建立独立进度 key（如 `targetId::idx`），并在 store 中集中管理 timer 生命周期
  - 分片回填：每张图完成就写回 `images[idx]` 并更新 overall progress
  - 全部完成后根据成功率设置节点最终状态（success/error）并输出聚合日志

### 3.4 复杂状态的可维护性：避免组件间耦合

- **难点**：画布 + 面板 + 模态 + 节点工具栏容易形成“跨组件 props 链 + 状态分裂”。
- **方案**：
  - Zustand 将跨区域状态统一收敛（selected、preview、favoritesOpen、chatMessages、logs…）
  - API 函数注入 store（页面装配一次），节点/执行逻辑不直接依赖 hook 层实现细节

## 4. 运行与构建（开发协作）

- **monorepo + pnpm workspace**：前后端并行开发
- **常用命令**
  - 根目录：`pnpm dev`（前后端一起起）
  - 前端：`pnpm --filter frontend dev`
  - 构建：`pnpm --filter frontend build`
- **环境变量**
  - `VITE_API_BASE_URL`：配置后端 API 地址

## 5. 可扩展性设计（后续演进方向）

- **节点体系扩展**：新增 node type（例如 JSON Transform、HTTP Request、条件分支）只需：
  - 扩展 `NodeType` 与 `nodeTypes` 映射
  - 补齐 store 初始化 data 与 `dagExecutor` 中执行分支
- **执行引擎增强**
  - 支持多输入聚合（当前 llm_generate 取第一个上游 text，可扩展为拼接/模板）
  - 引入节点级缓存（相同输入不重复跑）
  - 引入可中断/可取消执行（AbortController）
- **协作与保存**
  - 将 nodes/edges 持久化到后端，支持多人协作与版本回滚

