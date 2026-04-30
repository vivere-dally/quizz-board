declare namespace YT {
  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions)
    playVideo(): void
    pauseVideo(): void
    stopVideo(): void
    destroy(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    getCurrentTime(): number
    getDuration(): number
    setVolume(volume: number): void
    getVolume(): number
  }

  type PlayerOptions = {
    videoId?: string
    width?: number | string
    height?: number | string
    playerVars?: {
      autoplay?: 0 | 1
      start?: number
      end?: number
      rel?: 0 | 1
      modestbranding?: 0 | 1
      controls?: 0 | 1
      fs?: 0 | 1
      [key: string]: unknown
    }
    events?: {
      onReady?: (event: PlayerEvent) => void
      onStateChange?: (event: OnStateChangeEvent) => void
      onError?: (event: OnErrorEvent) => void
    }
  }

  type PlayerEvent = { target: Player }
  type OnStateChangeEvent = { data: number; target: Player }
  type OnErrorEvent = { data: number; target: Player }
}

interface Window {
  onYouTubeIframeAPIReady?: () => void
}
