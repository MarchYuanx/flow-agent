# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## 开发运行（推荐从仓库根目录启动）

在仓库根目录执行（会同时启动 `frontend` 与 `backend`）：

```bash
pnpm dev
```

只启动前端：

```bash
pnpm dev:frontend
```

只启动后端：

```bash
pnpm dev:backend
```

前端默认通过 `VITE_API_BASE_URL` 连接后端（未配置时默认 `http://localhost:3001`）。

## 业务模块（前端）

- **画布编排（核心）**：拖拽节点、连线形成流程图；支持缩放、MiniMap、框选多选与整体拖动（`src/pages/CanvasPage.tsx`）。
- **节点体系**：
  - **Text Input 节点**：输入文本，作为下游 Prompt 的上游输入（`src/nodes/TextInputNode.tsx`）。
  - **LLM Generate 节点**：消费上游文本或节点内 prompt，调用后端生成图片并展示结果（`src/nodes/LlmGenerateNode.tsx`）。
  - **Image 节点**：支持多图（上传/URL/模拟图）、预览、收藏、加入会话；支持图片 AI 操作与生成视频，并将结果落为新节点保持可追溯（`src/nodes/ImageNode.tsx`）。
- **对话面板（右侧）**：展示文本/图片消息；图片可从图片节点“一键加入会话”（`src/components/ChatPanel.tsx`）。
- **收藏夹**：收藏图片 URL，支持预览/删除/加入会话；本地持久化（`src/components/FavoritesModal.tsx`）。
- **图片预览**：全屏/大图预览，支持复制 URL、收藏等（`src/components/ImagePreviewModal.tsx`）。
- **运行日志与错误提示**：展示 DAG/节点/图片操作的执行过程与结果摘要，便于定位问题与演示（由 store 统一写入，页面展示）。

## 系统架构（前端视角）

### 目录分层

- **入口层**：`src/main.tsx`（挂载 React + 引入样式）、`src/App.tsx`
- **页面层**：`src/pages/CanvasPage.tsx`（组合画布、侧边栏、模态）
- **组件层**：`src/components/*`（Chat、收藏、预览、画布控制等）
- **节点层**：`src/nodes/*`（面向画布的节点 UI + 局部交互）
- **状态层（单一事实源）**：`src/store/canvasStore.ts`（nodes/edges、执行、日志、收藏、会话、UI 折叠、预览等）
- **领域逻辑层**：`src/utils/dagExecutor.ts`（DAG 拓扑排序、全量执行、到目标节点的子图执行）
- **接口层**：`src/hooks/useApi.ts`（封装后端 API、错误与响应结构校验）

### 数据流与调用链

- **画布交互**（拖拽/连线/选择）→ 通过 `useCanvasStore` 更新 `nodes/edges/selectedNodeId`
- **执行**：
  - **全图执行**：store `run()` → `executeDag()` → 逐节点执行 → 回填节点状态与结果
  - **单节点执行**：store `runNode(nodeId)` → `executeDagToTarget()`（只跑依赖子图）→ 回填目标节点结果
- **图片操作**：`ImageNode` 触发 store `runImageNodeAction()` → 调用 `useApi` 的图片操作/视频生成接口 → 结果写入新 Image 节点 + 写入会话消息
- **可观测性**：执行过程统一写 `logs`，并在页面侧展示；错误统一通过 `globalError` 与节点 `errorMessage` 呈现

### 后端接口（前端依赖）

- `POST /api/ai/generate`：根据 prompt 生成图片 URL
- `POST /api/ai/image/action`：对图片执行局部重绘/消除/文字重绘/微调等操作，返回新图 URL
- `POST /api/ai/video/generate`：根据图片生成视频 URL
- `VITE_API_BASE_URL`：配置 API 基地址（默认 `http://localhost:3001`）

## 重点难点（聚焦画布）

### 1) 画布手势冲突与多选体验

- **问题**：框选、多选拖动、画布平移/缩放等手势容易互相冲突，导致误操作。
- **方案**：
  - 采用“**框选为主**”的多选策略，并禁用 Shift 多选，降低交互复杂度与学习成本
  - 将画布平移约束为“**按住 Space 才可拖拽平移**”，避免与框选手势冲突

### 2) DAG 正确性与可执行性保障

- **问题**：用户可任意连线，必须避免环（cycle）导致无法执行；同时需要支持只运行某个节点（提高交互效率）。
- **方案**：
  - `dagExecutor` 采用 Kahn 拓扑排序检测环并在执行前失败提示
  - 支持 `executeDagToTarget`：从目标节点回溯依赖，仅执行依赖子图，避免全图重跑

### 3) 图片节点多图并发与结果回填一致性

- **问题**：多图并发操作时，需要稳定回填到对应索引，并给出可感知进度与最终聚合状态。
- **方案**：
  - 以“结果节点 + 图片索引”为粒度管理进度与回填（并发完成即更新）
  - 全部完成后根据成功率设置节点最终状态，并将成功图片写入会话，形成闭环

### 4) 跨区域状态收敛与可维护性

- **问题**：画布、对话、收藏、预览、日志等跨组件状态若分散管理，易产生耦合与状态不一致。
- **方案**：
  - Zustand 作为单一事实源统一收敛：`nodes/edges/selection/execution/logs/chat/favorites/preview/ui`
  - `useApi` 仅负责请求与校验，具体编排在 store 内完成，保证组件职责清晰

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
