import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  MiniMap,
  ReactFlow,
  SelectionMode,
  type OnConnect,
  type NodeTypes,
  type ReactFlowInstance,
  type XYPosition,
} from '@xyflow/react'
import { FlowControls } from '../components/FlowControls'
import { LeftPanel } from '../components/LeftPanel'
import { RightPanelShell } from '../components/RightPanelShell'
// ImagePreviewModal 已移动到图片节点工具栏内部使用
import { FavoritesModal } from '../components/FavoritesModal'
import { ImagePreviewModal } from '../components/ImagePreviewModal'
import { useApi } from '../hooks/useApi'
import { TextInputNode } from '../nodes/TextInputNode'
import { LlmGenerateNode } from '../nodes/LlmGenerateNode'
import { ImageNode } from '../nodes/ImageNode'
import { VideoNode } from '../nodes/VideoNode'
import { useCanvasStore, type CanvasNode, type NodeType } from '../store/canvasStore'

export function CanvasPage() {
  const reactFlowRef = useRef<HTMLDivElement | null>(null)
  const rfInstanceRef = useRef<ReactFlowInstance<CanvasNode> | null>(null)

  const api = useApi()

  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const globalError = useCanvasStore((s) => s.globalError)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange)
  const onConnectStore = useCanvasStore((s) => s.onConnect)
  const addNode = useCanvasStore((s) => s.addNode)
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId)
  const setGenerateImageFn = useCanvasStore((s) => s.setGenerateImageFn)
  const setApplyImageActionFn = useCanvasStore((s) => s.setApplyImageActionFn)
  const setGenerateVideoFn = useCanvasStore((s) => s.setGenerateVideoFn)
  const setSaveCanvasFn = useCanvasStore((s) => s.setSaveCanvasFn)
  const openFavorites = useCanvasStore((s) => s.openFavorites)
  const preview = useCanvasStore((s) => s.preview)
  const closePreview = useCanvasStore((s) => s.closePreview)
  const appendChatMessage = useCanvasStore((s) => s.appendChatMessage)
  const isFavorite = useCanvasStore((s) => s.isFavorite)
  const toggleFavorite = useCanvasStore((s) => s.toggleFavorite)
  const logs = useCanvasStore((s) => s.logs)
  const clearLogs = useCanvasStore((s) => s.clearLogs)
  const leftPanelCollapsed = useCanvasStore((s) => s.leftPanelCollapsed)
  const rightPanelCollapsed = useCanvasStore((s) => s.rightPanelCollapsed)
  const toggleLeftPanel = useCanvasStore((s) => s.toggleLeftPanel)
  const toggleRightPanel = useCanvasStore((s) => s.toggleRightPanel)
  // 图片节点的 AI 操作已改为“选中出现操作栏”，不在画布层用弹出菜单触发

  const onConnect: OnConnect = useCallback(
    (connection) => onConnectStore(connection),
    [onConnectStore],
  )

  const fitViewOptions = useMemo(() => ({ padding: 0.2, maxZoom: 1.2 }), [])
  const nodeTypes = useMemo(
    () =>
      ({
        text_input: TextInputNode,
        llm_generate: LlmGenerateNode,
        image: ImageNode,
        video: VideoNode,
      }) satisfies NodeTypes,
    [],
  )

  const screenToFlowPosition = useCallback(
    (client: { x: number; y: number }): XYPosition => {
      const rf = rfInstanceRef.current
      const wrapper = reactFlowRef.current
      if (!rf || !wrapper) return { x: 0, y: 0 }
      const bounds = wrapper.getBoundingClientRect()
      return rf.screenToFlowPosition({
        x: client.x - bounds.left,
        y: client.y - bounds.top,
      })
    },
    [],
  )

  // 仍保留 ImagePreviewModal（可用于未来从节点工具栏触发全屏预览）

  useEffect(() => {
    setGenerateImageFn(api.generateImage)
    setApplyImageActionFn(api.applyImageAction)
    setGenerateVideoFn(api.generateVideo)
    setSaveCanvasFn(api.saveCanvas)
    return () => {
      setGenerateImageFn(null)
      setApplyImageActionFn(null)
      setGenerateVideoFn(null)
      setSaveCanvasFn(null)
    }
  }, [
    api.applyImageAction,
    api.generateImage,
    api.generateVideo,
    api.saveCanvas,
    setApplyImageActionFn,
    setGenerateImageFn,
    setGenerateVideoFn,
    setSaveCanvasFn,
  ])

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full w-full">
        <LeftPanel
          collapsed={leftPanelCollapsed}
          toggleCollapsed={toggleLeftPanel}
          openFavorites={openFavorites}
          apiBaseUrl={api.baseUrl}
          onCopyApiBaseUrl={async () => {
            try {
              await navigator.clipboard.writeText(api.baseUrl)
              appendChatMessage({ role: 'system', kind: 'text', text: '已复制后端 API 地址。' })
            } catch {
              appendChatMessage({ role: 'system', kind: 'text', text: '复制失败，请手动复制。' })
            }
          }}
          onOpenApiBaseUrl={() => {
            try {
              window.open(api.baseUrl, '_blank', 'noopener,noreferrer')
            } catch {
              // no-op
            }
          }}
          logs={logs}
          clearLogs={clearLogs}
          globalError={globalError}
          apiError={api.error}
        />

        <main className="relative flex-1" ref={reactFlowRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={fitViewOptions}
            proOptions={{ hideAttribution: true }}
            // 避免滚轮事件被 Flow 拦截，影响侧边栏滚动
            preventScrolling={false}
            // 框选 + 多选 + 整体拖动
            // - 左键拖拽空白处：直接框选
            // - 点击：单选
            // - 选中多个节点后，拖动任意一个选中节点：整体移动
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            // 去掉 Shift 多选：仅保留框选来做多选
            multiSelectionKeyCode={null}
            // 避免“拖拽平移画布”和“框选”手势冲突：按住 Space 才允许拖拽平移
            panOnDrag={false}
            panActivationKeyCode={'Space'}
            onInit={(instance) => {
              rfInstanceRef.current = instance
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => {
              e.preventDefault()
              const type = e.dataTransfer.getData(
                'application/flow-canvas-node',
              ) as NodeType
              if (!type) return

              const position = screenToFlowPosition({
                x: e.clientX,
                y: e.clientY,
              })
              addNode(type, position)
            }}
            onPaneClick={() => {
              setSelectedNodeId(null)
            }}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id)
            }}
          >
            <Background />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-950/60 shadow-2xl shadow-black/40 backdrop-blur"
              maskColor="rgba(2, 6, 23, 0.55)"
              nodeColor={(n) => {
                if (n.selected) return 'rgba(251, 191, 36, 0.95)' // amber-400
                if (n.type === 'image') return 'rgba(56, 189, 248, 0.70)' // sky-400
                if (n.type === 'llm_generate') return 'rgba(232, 121, 249, 0.65)' // fuchsia-400
                return 'rgba(148, 163, 184, 0.55)' // slate-400
              }}
              nodeStrokeColor={(n) => (n.selected ? 'rgba(251, 191, 36, 1)' : 'rgba(30, 41, 59, 1)')}
              nodeBorderRadius={6}
              style={{ width: 210, height: 156 }}
            />
            <FlowControls />
          </ReactFlow>

          {/* 收藏夹弹窗：全局入口（也可从图片节点里打开） */}
          <FavoritesModal />

          {/* 全局预览：收藏夹/其他入口可复用 */}
          {preview ? (
            <ImagePreviewModal
              title={preview.title}
              imageUrl={preview.imageUrl}
              onClose={closePreview}
              isFavorite={isFavorite(preview.imageUrl)}
              onToggleFavorite={() => toggleFavorite(preview.imageUrl)}
              onCopyUrl={async () => {
                try {
                  await navigator.clipboard.writeText(preview.imageUrl)
                  appendChatMessage({ role: 'system', kind: 'text', text: '已复制图片 URL。' })
                } catch {
                  appendChatMessage({ role: 'system', kind: 'text', text: '复制失败，请手动复制。' })
                }
              }}
            />
          ) : null}

          {/* tips 已改为左侧按钮 popover */}
        </main>

        <RightPanelShell collapsed={rightPanelCollapsed} onToggle={toggleRightPanel} />
      </div>
    </div>
  )
}

