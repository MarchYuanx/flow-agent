import { useCallback } from 'react'

export function RunButton(props: {
  disabled?: boolean
  loading?: boolean
  onClick: () => void
}) {
  const { disabled, loading, onClick } = props

  const handleClick = useCallback(() => {
    if (disabled || loading) return
    onClick()
  }, [disabled, loading, onClick])

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      aria-label={loading ? '运行中' : '运行'}
      title={loading ? '运行中' : '运行'}
      className={[
        'inline-flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold',
        'border border-slate-800 bg-slate-950/60 text-slate-100',
        'hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-60',
      ].join(' ')}
    >
      {loading ? (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 animate-spin text-blue-200"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M12 4a8 8 0 0 1 7.8 6h-2.2A6 6 0 1 0 12 18v2a8 8 0 0 1 0-16Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-200" aria-hidden="true">
          <path fill="currentColor" d="M8 5v14l11-7L8 5Z" />
        </svg>
      )}
    </button>
  )
}

