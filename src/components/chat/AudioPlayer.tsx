"use client"

import { useState, useRef } from "react"
import { Play, Pause, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AudioPlayerProps {
  src: string
  duration?: number
  transcription?: string | null
  transcriptionStatus?: string | null
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function AudioPlayer({
  src,
  duration,
  transcription,
  transcriptionStatus,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(duration || 0)
  const [showTranscription, setShowTranscription] = useState(false)

  function togglePlay() {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }

  function handleTimeUpdate() {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  function handleLoadedMetadata() {
    if (audioRef.current && audioRef.current.duration !== Infinity) {
      setAudioDuration(audioRef.current.duration)
    }
  }

  function handleEnded() {
    setPlaying(false)
    setCurrentTime(0)
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current || !audioDuration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = x / rect.width
    audioRef.current.currentTime = percent * audioDuration
  }

  const progress = audioDuration ? (currentTime / audioDuration) * 100 : 0

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 bg-neutral-100 rounded-lg px-3 py-2">
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          preload="metadata"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={togglePlay}
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        {/* Progress bar */}
        <div
          className="flex-1 h-1.5 bg-neutral-300 rounded-full cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-neutral-900 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDuration(currentTime)} / {formatDuration(audioDuration)}
        </span>

        {/* Transcription toggle */}
        {(transcription || transcriptionStatus === "pending" || transcriptionStatus === "processing") && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => setShowTranscription(!showTranscription)}
          >
            {showTranscription ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>

      {/* Transcription text */}
      {showTranscription && (
        <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm">
          {transcriptionStatus === "pending" && (
            <p className="text-muted-foreground italic">Aguardando transcrição...</p>
          )}
          {transcriptionStatus === "processing" && (
            <p className="text-muted-foreground italic">Transcrevendo...</p>
          )}
          {transcriptionStatus === "failed" && (
            <p className="text-red-500 italic">Falha na transcrição</p>
          )}
          {transcription && (
            <p className="text-neutral-700">{transcription}</p>
          )}
        </div>
      )}
    </div>
  )
}
