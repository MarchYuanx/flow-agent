import { useCallback, useMemo, useState } from 'react'

export type GenerateImageRequest = {
  prompt: string
}

export type GenerateImageResponse = {
  images: string[]
}

export type ImageAction =
  | 'repaint_local'
  | 'erase'
  | 'repaint_text'
  | 'tweak'
  | 'generate_video'

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

function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  return raw && raw.trim().length > 0 ? raw.trim() : 'http://localhost:3001'
}

export function useApi() {
  const baseUrl = useMemo(() => getApiBaseUrl(), [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateImage = useCallback(async (prompt: string): Promise<string> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${baseUrl}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt } satisfies GenerateImageRequest),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

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

  return { baseUrl, loading, error, generateImage, applyImageAction, generateVideo }
}

