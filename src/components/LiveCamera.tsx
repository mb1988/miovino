import { Camera, ImageUp, Loader2, X } from 'lucide-react'
import { t } from '../lib/i18n'
import { useEffect, useRef, useState } from 'react'

/**
 * Full-screen live viewfinder (rear camera). Falls back to the system camera / file picker when
 * getUserMedia is unavailable or permission is denied. Needs HTTPS (or localhost).
 */
export function LiveCamera({ open, onClose, onCapture, hint }: { open: boolean; onClose: () => void; onCapture: (photo: Blob) => void; hint?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'unavailable'>('starting')

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | undefined
    let cancelled = false
    setState('starting')
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
        setState('live')
      })
      .catch(() => !cancelled && setState('unavailable'))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [open])

  if (!open) return null

  const shoot = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && (onCapture(b), onClose()), 'image/jpeg', 0.92)
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-cream-50">
        <span className="text-sm">{hint ?? t('Fill the frame with the front label')}</span>
        <button aria-label={t('Close camera')} onClick={onClose} className="rounded-full bg-white/10 p-2">
          <X size={20} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {state === 'live' && <div className="pointer-events-none absolute inset-x-10 inset-y-16 rounded-3xl border-2 border-white/60" />}
        {state === 'starting' && <Loader2 className="absolute animate-spin text-cream-200" size={32} />}
        {state === 'unavailable' && (
          <div className="absolute px-8 text-center text-cream-200">
            <p className="mb-4">{t('Live camera isn\'t available here (permission denied, or the page isn\'t on HTTPS).')}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-around p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-1 text-xs text-cream-200" aria-label={t('Choose from library')}>
          <ImageUp size={26} />
          {t('Library')}
        </button>
        <button
          onClick={state === 'live' ? shoot : () => fileRef.current?.click()}
          aria-label={t('Take photo')}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 active:bg-white/40"
        >
          <Camera size={30} className="text-white" />
        </button>
        <span className="w-12" />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture={state === 'unavailable' ? 'environment' : undefined}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) {
            onCapture(f)
            onClose()
          }
        }}
      />
    </div>
  )
}
