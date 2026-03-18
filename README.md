# Flow Canvas（前后端一体）

一个最小可用的 **AI Agent 工作流画布**（Frontend + Backend）：在浏览器中通过拖拽节点、连线形成 **DAG**，支持全图执行/单节点执行，以及图片节点的多图处理、收藏、预览与会话面板。

## 功能概览

- **画布编排**：拖拽节点、连线、缩放、MiniMap、框选多选、Space 拖拽平移
- **DAG 执行**：拓扑排序校验环（cycle）；支持全图运行与目标节点依赖子图运行
- **节点体系**：
  - Text Input：提供文本输入
  - LLM Generate：基于上游文本/本节点 prompt 调用后端生成图片 URL
  - Image：多图（上传/URL/模拟）、预览、收藏、加入会话；支持图片 AI 操作/生成视频并把结果落为新节点
- **可观测性**：运行日志、错误提示、会话消息（文本/图片）

## 目录结构

```text
flow-canvas/
  frontend/     # Vite + React + TS + Tailwind + @xyflow/react + Zustand
  backend/      # NestJS（提供 /api/ai/* 接口）
  package.json  # 根脚本：一键启动前后端
  pnpm-workspace.yaml
```

## 技术栈

- **前端**：Vite、React、TypeScript（strict）、TailwindCSS、@xyflow/react、Zustand
- **后端**：NestJS
- **包管理**：pnpm workspace（monorepo）

## 快速开始

### 1) 安装依赖

在仓库根目录执行：

```bash
pnpm i
```

### 2) 一键启动前后端（推荐）

```bash
pnpm dev
```

- 前端默认：`http://localhost:5173/`
- 后端默认：`http://localhost:3001/`

### 3) 分别启动（可选）

```bash
pnpm dev:frontend
pnpm dev:backend
```

## 环境变量

### 前端

- **`VITE_API_BASE_URL`**：后端 API 基地址  
  - 未配置时默认：`http://localhost:3001`

在 `frontend/` 下创建 `.env.local` 示例：

```bash
VITE_API_BASE_URL=http://localhost:3001
```

## 常用命令

在仓库根目录：

- **`pnpm dev`**：并行启动 `frontend` + `backend`
- **`pnpm build`**：构建所有 workspace 包
- **`pnpm lint`**：对所有 workspace 包执行 lint

## 文档入口

- **前端技术方案**：`frontend/TECH_SOLUTION.md`
- **简历版项目描述**：`frontend/RESUME.md`
- **前端 README（含业务/架构/难点）**：`frontend/README.md`

## 常见问题（FAQ）

### 端口被占用怎么办？

- 前端默认端口：5173（Vite）
- 后端默认端口：3001（Nest）

在 Windows PowerShell 可用以下方式定位占用进程（示例端口 5173/3001）：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173,3001 | Select-Object LocalPort,OwningProcess
```

结束对应进程（示例 PID=12345）：

```powershell
Stop-Process -Id 12345 -Force
```

---

如需扩展节点类型、执行引擎策略（缓存/取消/多输入聚合）或接入后端持久化与协作，可基于 `frontend/src/utils/dagExecutor.ts` 与 `frontend/src/store/canvasStore.ts` 继续演进。

