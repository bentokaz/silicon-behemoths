// The company logo uploader. In a file of its own so that the main menu, which
// offers it on the new-company form, does not pull the campus builder and its
// 3D view into the first download.
import { useRef } from 'react'
import { useStore } from '../store/game'
import { Btn, ConfirmIconBtn } from './ui'

/** Read an image file and return it as a 256 px square PNG data URL. */
export function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('That is not an image. Choose a PNG, JPEG, WebP or SVG file.'))
    if (file.size > 8e6) return reject(new Error('That image is larger than 8 MB. Choose a smaller one.'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const scale = Math.min(256 / img.width, 256 / img.height)
      const w = img.width * scale
      const h = img.height * scale
      c.getContext('2d')!.drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('That file could not be read as an image. Try a PNG or JPEG.')))
    img.src = url
  })
}

export function LogoPicker({ value, onChange }: { value?: string; onChange: (logo: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { say } = useStore.getState()
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-line2 bg-raise">{value ? <img src={value} alt="Company logo" className="h-full w-full object-contain" /> : <span className="label text-faint">none</span>}</div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) readLogo(file).then(onChange, (err: Error) => say(err.message, 'bad'))
        }}
      />
      <Btn small icon="export" onClick={() => input.current?.click()}>
        {value ? 'Replace' : 'Upload logo'}
      </Btn>
      {value && <ConfirmIconBtn icon="bin" title="Remove the logo" onClick={() => onChange(undefined)} />}
    </div>
  )
}
