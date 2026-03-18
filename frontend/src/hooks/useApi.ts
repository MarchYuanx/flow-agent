import { useCallback, useMemo, useState } from 'react'

export type ImageAction =
  | 'repaint_local'
  | 'erase'
  | 'repaint_text'
  | 'tweak'
  | 'generate_video'

export type AiType = 'llm_generate' | ImageAction

export type GenerateImageResponse = {
  images: string[]
}

export type GenerateImageRequest =
  | {
      aiType: 'llm_generate'
      prompt: string
    }
  | {
      aiType: ImageAction
      imageUrl: string
      prompt?: string
    }

export type ImageActionRequest = {
  imageUrl: string
  action: ImageAction
  prompt?: string
}

export type ImageActionResponse = {
  imageUrl: string
}

export type VideoGenerateRequest = {
  imageUrl: string
  prompt?: string
}

export type VideoGenerateResponse = {
  videoUrl: string
}

export type CanvasSaveRequest = {
  canvasId: string
  nodes: unknown[]
  edges: unknown[]
}

function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  return raw && raw.trim().length > 0 ? raw.trim() : 'http://localhost:3001'
}

export function useApi() {
  const baseUrl = useMemo(() => getApiBaseUrl(), [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateImage = useCallback(async (req: GenerateImageRequest): Promise<string> => {
    setLoading(true)
    setError(null)
    try {
      if (req.aiType === 'llm_generate') {
        const res = await fetch(`${baseUrl}/api/ai/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: req.prompt, aiType: req.aiType } satisfies { prompt: string; aiType: 'llm_generate' }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data: unknown = await res.json()
        if (
          typeof data !== 'object' ||
          data === null ||
          !('images' in data) ||
          !Array.isArray((data as { images?: unknown }).images)
        ) {
          throw new Error('响应格式不正确')
        }

        const first = (data as GenerateImageResponse).images[0]
        if (typeof first !== 'string' || first.length === 0) {
          throw new Error('未返回图片 URL')
        }
        return first
      }

      // aiType 为图片编辑动作时：走通用 image/action 接口
      if (req.aiType === 'generate_video') {
        // generate_video 走视频生成接口
        const res = await fetch(`${baseUrl}/api/ai/video/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: req.imageUrl,
            prompt: req.prompt,
            aiType: req.aiType,
          } satisfies VideoGenerateRequest & { aiType: 'generate_video' }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: unknown = await res.json()
        if (
          typeof data !== 'object' ||
          data === null ||
          !('videoUrl' in data) ||
          typeof (data as { videoUrl?: unknown }).videoUrl !== 'string'
        ) {
          throw new Error('响应格式不正确')
        }
        const url = (data as VideoGenerateResponse).videoUrl
        if (!url) throw new Error('未返回 videoUrl')
        return url
      }

      // 去背景/抠图/局部重绘等图片动作：走 image/action
      const res = await fetch(`${baseUrl}/api/ai/image/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: req.imageUrl,
          action: req.aiType,
          aiType: req.aiType,
          prompt: req.prompt,
        } satisfies ImageActionRequest & { aiType: ImageAction }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: unknown = await res.json()
      if (
        typeof data !== 'object' ||
        data === null ||
        !('imageUrl' in data) ||
        typeof (data as { imageUrl?: unknown }).imageUrl !== 'string'
      ) {
        throw new Error('响应格式不正确')
      }

      const url = (data as ImageActionResponse).imageUrl
      if (!url) throw new Error('未返回 imageUrl')
      return url
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误'
      setError(message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  const applyImageAction = useCallback(
    async (req: ImageActionRequest): Promise<string> => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${baseUrl}/api/ai/image/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req satisfies ImageActionRequest),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: unknown = await res.json()
        if (
          typeof data !== 'object' ||
          data === null ||
          !('imageUrl' in data) ||
          typeof (data as { imageUrl?: unknown }).imageUrl !== 'string'
        ) {
          throw new Error('响应格式不正确')
        }
        const url = (data as ImageActionResponse).imageUrl
        if (!url) throw new Error('未返回 imageUrl')
        return url
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误'
        setError(message)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [baseUrl],
  )

  const generateVideo = useCallback(
    async (req: VideoGenerateRequest): Promise<string> => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${baseUrl}/api/ai/video/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req satisfies VideoGenerateRequest),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: unknown = await res.json()
        if (
          typeof data !== 'object' ||
          data === null ||
          !('videoUrl' in data) ||
          typeof (data as { videoUrl?: unknown }).videoUrl !== 'string'
        ) {
          throw new Error('响应格式不正确')
        }
        const url = (data as VideoGenerateResponse).videoUrl
        if (!url) throw new Error('未返回 videoUrl')
        return url
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误'
        setError(message)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [baseUrl],
  )

  const saveCanvas = useCallback(
    async (req: CanvasSaveRequest): Promise<void> => {
      try {
        const res = await fetch(`${baseUrl}/api/canvas/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req satisfies CanvasSaveRequest),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误'
        setError(message)
        throw e
      }
    },
    [baseUrl],
  )

  return { baseUrl, loading, error, generateImage, applyImageAction, generateVideo, saveCanvas }
}

