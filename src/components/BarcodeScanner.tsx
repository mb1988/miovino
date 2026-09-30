import { Keyboard, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createDetector, normalizeBarcode } from '../lib/barcode'

/**
 * Full-screen live barcode reader (rear camera). Scans a few times a second and reports the first valid
 * EAN/UPC. You can also type the digits when the camera isn't available.
 */
export function BarcodeScanner({ open, onClose, onDetected }: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'unavailable'>('starting')
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const typedCode = normalizeBarcode(typed)
  // Latest callback without restarting the camera when the parent re-renders.
  const detectedRef = useRef(onDetected)
  useEffect(() => {
    detectedRef.current = onDetected
  })

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera')
        const [s, detector] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
          createDetector(),
        ])
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        const v = videoRef.current!
        v.srcObject = s
        await v.play().catch(() => {})
        setState('live')
        const tick = async () => {
          if (cancelled) return
          if (v.readyState >= 2) {
            const found = await detector.detect(v).catch(() => [])
            const code = found.map((f) => normalizeBarcode(f.rawValue)).find(Boolean)
            if (code && !cancelled) {
              navigator.vibrate?.(60)
              detectedRef.current(code)
              return
            }
          }
          timer = setTimeout(tick, 250)
        }
        void tick()
      } catch {
        if (!cancelled) {
          setState('unavailable')
          setTyping(true)
        }
      }
    }
    void start()
    return () => {
      cancelled = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-cream-50">
        <span className="text-sm">Point at the barcode on the back label</span>
        <button aria-label="Close scanner" onClick={onClose} className="rounded-full bg-white/10 p-2">
          <X size={20} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {state === 'live' && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-40 -translate-y-1/2 rounded-2xl border-2 border-white/70">
            <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-rose-500/80" />
          </div>
        )}
        {state === 'starting' && <Loader2 className="absolute animate-spin text-cream-200" size={32} />}
        {state === 'unavailable' && <p className="absolute px-8 text-center text-cream-200">The camera isn&rsquo;t available here. Type the numbers under the barcode instead.</p>}
      </div>
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {typing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (typedCode) onDetected(typedCode)
            }}
          >
            <input autoFocus className="field flex-1 text-center tracking-widest" inputMode="numeric" placeholder="8 or 13 digits" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button type="submit" disabled={!typedCode} className="rounded-xl bg-wine-600 px-4 text-sm font-medium text-cream-50 disabled:opacity-40">
              Find
            </button>
          </form>
        ) : (
          <button onClick={() => setTyping(true)} className="mx-auto flex items-center gap-2 text-sm text-cream-200">
            <Keyboard size={18} /> Type the number instead
          </button>
        )}
        {typing && typed.replace(/\D/g, '').length >= 8 && !typedCode && <p className="mt-2 text-center text-xs text-rose-300">That number doesn&rsquo;t check out — look again at the digits.</p>}
      </div>
    </div>
  )
}
