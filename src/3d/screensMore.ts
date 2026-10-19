// Screen artwork for the e-reader and the action camera. An e-reader shows a page of a book in the greys of
// e-ink, with no glow; an action camera's screens show what the lens sees, with the recording overlay over it.

type Ctx = CanvasRenderingContext2D
type Palette = [string, string, string]

const SERIF = 'Georgia, "Times New Roman", serif'
const SANS = '"Segoe UI", system-ui, sans-serif'

/** Original prose for the pages. */
const BOOKS: { title: string; chapter: string; text: string }[] = [
  {
    title: 'The Lighthouse Keeper’s Ledger',
    chapter: 'Chapter Seven',
    text: 'The tide had turned an hour before dawn, and with it the wind. Mara counted the steps up to the lamp room as she always did, one hundred and twelve, and found the glass already furred with salt. She wiped it in long strokes while the beam swept the dark water below, and somewhere past the reef a fishing boat answered with two short flashes. She wrote the time in the ledger, then the weather, then a line she would cross out later: that the sea looked as if it were waiting for something. By the time the sky had gone the colour of pewter she had trimmed the wick, wound the clock and eaten half an apple, and the boat was a dot against the headland.',
  },
  {
    title: 'Notes on Small Machines',
    chapter: 'On Springs',
    text: 'Every clock begins with a spring that wants to be somewhere else. Wound tight, it presses outward against its barrel, and the whole art of the clockmaker lies in letting it get its way slowly. The escapement is the gatekeeper: it lets the spring advance one tooth at a time, and each release is a tick. Take the escapement away and the spring empties itself in a second, with a noise like a startled bird. I have done this, once, by accident, and the hands spun round the dial as if the afternoon were in a hurry to be over.',
  },
  {
    title: 'A Winter in the Orchard',
    chapter: 'December',
    text: 'The pruning starts when the leaves are down and the sap has gone to ground. Grandfather walked the rows with his saw on his shoulder and talked to each tree in turn, telling it which limbs would go. Crossing branches first, he said, then anything growing inward, then anything that would shade the fruit in summer. I carried the cut wood to the fire at the end of the row, and by dusk the whole orchard smelled of apple smoke. The trees looked smaller afterwards, and colder, but he promised they would thank us in August.',
  },
]

/** A page of a book: off-white paper, dark grey type, a running head and the reading progress at the foot. */
export function drawEreader(g: Ctx, w: number, h: number, seed: number, tag: string) {
  const book = BOOKS[((seed % BOOKS.length) + BOOKS.length) % BOOKS.length]
  // e-ink paper is never white: a warm light grey with a faint grain
  g.fillStyle = '#e3e2dc'
  g.fillRect(0, 0, w, h)
  let s = 12345 + seed * 97
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  g.globalAlpha = 0.05
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? '#9a9890' : '#ffffff'
    g.fillRect(rnd() * w, rnd() * h, 2, 2)
  }
  g.globalAlpha = 1
  const u = Math.min(w, h * 0.75) / 100
  const margin = 8 * u
  const ink = '#26262a'
  // the running head
  g.textBaseline = 'middle'
  g.fillStyle = '#6b6a66'
  g.font = `400 ${2.6 * u}px ${SANS}`
  g.textAlign = 'left'
  g.fillText(book.title, margin, 5 * u)
  g.textAlign = 'right'
  g.fillText('10:42', w - margin, 5 * u)
  g.fillStyle = '#b9b8b2'
  g.fillRect(margin, 8 * u, w - 2 * margin, Math.max(1, 0.15 * u))
  // the chapter heading
  g.fillStyle = ink
  g.textAlign = 'center'
  g.font = `600 ${5.2 * u}px ${SERIF}`
  g.fillText(book.chapter, w / 2, 17 * u)
  // the text, set ragged-right in a book face, a drop-word in small capitals
  const size = 3.9 * u
  const lead = size * 1.55
  g.font = `400 ${size}px ${SERIF}`
  g.textAlign = 'left'
  const words = book.text.split(' ')
  const maxW = w - 2 * margin
  let line = ''
  let y = 26 * u
  const lines: string[] = []
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width > maxW && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  const bottom = h - 11 * u
  // the book runs on past the page: repeat it until the page is full
  let i = 0
  while (y < bottom) {
    const text = lines[i % lines.length]
    const last = i % lines.length === lines.length - 1
    // justify every full line by spreading its words, as a book does
    const parts = text.split(' ')
    const natural = parts.reduce((a, p) => a + g.measureText(p).width, 0)
    const gap = !last && parts.length > 1 ? (maxW - natural) / (parts.length - 1) : g.measureText(' ').width
    let x = margin + (i % lines.length === 0 ? 4 * u : 0)
    for (const p of parts) {
      g.fillText(p, x, y)
      x += g.measureText(p).width + gap
    }
    y += lead
    i++
  }
  // the foot: how far through the book, and the panel's name
  g.fillStyle = '#b9b8b2'
  g.fillRect(margin, h - 7.5 * u, w - 2 * margin, Math.max(1, 0.3 * u))
  g.fillStyle = '#4a4a4e'
  g.fillRect(margin, h - 7.5 * u, (w - 2 * margin) * (0.18 + 0.23 * (seed % 3)), Math.max(1, 0.3 * u))
  g.font = `400 ${2.4 * u}px ${SANS}`
  g.fillStyle = '#6b6a66'
  g.textAlign = 'left'
  g.fillText(`${18 + 23 * (seed % 3)}%   ·   12 min left in chapter`, margin, h - 4 * u)
  if (tag) {
    g.textAlign = 'right'
    g.fillText(tag.split('  ')[0], w - margin, h - 4 * u)
  }
}

/** What an action camera's lens sees: a trail running into hills, under the recording overlay. */
export function drawActioncam(g: Ctx, w: number, h: number, [deep, mid, hi]: Palette, seed: number, tag: string) {
  // the sky, the hills and the trail
  const sky = g.createLinearGradient(0, 0, 0, h * 0.6)
  sky.addColorStop(0, '#6fa7d8')
  sky.addColorStop(1, '#d9e8f2')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  const hills = (y0: number, amp: number, color: string, k: number) => {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, h)
    for (let x = 0; x <= w + 8; x += 8) g.lineTo(x, h * y0 + Math.sin(x / (w * 0.13) + k + seed) * amp * h + Math.sin(x / (w * 0.05) + k * 2) * amp * h * 0.3)
    g.lineTo(w, h)
    g.fill()
  }
  hills(0.5, 0.05, '#8aa3b4', 0.3)
  hills(0.58, 0.06, mid, 1.7)
  hills(0.7, 0.04, deep, 2.9)
  // the trail runs from the bottom of the frame to the horizon
  g.fillStyle = '#c9a77a'
  g.beginPath()
  g.moveTo(w * 0.28, h)
  g.quadraticCurveTo(w * 0.52, h * 0.78, w * 0.5, h * 0.64)
  g.lineTo(w * 0.53, h * 0.64)
  g.quadraticCurveTo(w * 0.62, h * 0.8, w * 0.78, h)
  g.fill()
  g.fillStyle = hi
  g.globalAlpha = 0.35
  g.beginPath()
  g.arc(w * 0.8, h * 0.18, Math.min(w, h) * 0.07, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
  // the overlay: a third-lines grid, the mode, the timer with its red dot, the battery
  const u = Math.min(w, h * 1.4) / 100
  g.strokeStyle = 'rgba(255,255,255,0.28)'
  g.lineWidth = Math.max(1, 0.25 * u)
  for (const k of [1, 2]) {
    g.beginPath()
    g.moveTo((w * k) / 3, 0)
    g.lineTo((w * k) / 3, h)
    g.moveTo(0, (h * k) / 3)
    g.lineTo(w, (h * k) / 3)
    g.stroke()
  }
  const bar = 9 * u
  g.fillStyle = 'rgba(0,0,0,0.42)'
  g.fillRect(0, 0, w, bar)
  g.fillRect(0, h - bar, w, bar)
  g.textBaseline = 'middle'
  g.font = `700 ${4.6 * u}px ${SANS}`
  g.fillStyle = '#ff3b30'
  g.beginPath()
  g.arc(w / 2 - 15 * u, bar / 2, 1.7 * u, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffffff'
  g.textAlign = 'left'
  g.fillText(`00:0${3 + (seed % 6)}:47`, w / 2 - 11 * u, bar / 2)
  g.font = `600 ${3.8 * u}px ${SANS}`
  g.fillText('4K 60', 3 * u, bar / 2)
  // the battery
  const bw = 8 * u
  const bx = w - bw - 4 * u
  g.strokeStyle = '#ffffff'
  g.lineWidth = Math.max(1, 0.5 * u)
  g.strokeRect(bx, bar / 2 - 2 * u, bw, 4 * u)
  g.fillStyle = '#ffffff'
  g.fillRect(bx + bw, bar / 2 - 1 * u, 0.9 * u, 2 * u)
  g.fillStyle = '#7dff8a'
  g.fillRect(bx + 0.6 * u, bar / 2 - 1.4 * u, (bw - 1.2 * u) * 0.7, 2.8 * u)
  // the foot: the lens and stabilisation, and the panel the screen is
  g.fillStyle = '#ffffff'
  g.font = `500 ${3.4 * u}px ${SANS}`
  g.textAlign = 'left'
  g.fillText('WIDE   ·   LOCK', 3 * u, h - bar / 2)
  if (tag) {
    g.textAlign = 'right'
    g.globalAlpha = 0.85
    g.fillText(tag, w - 3 * u, h - bar / 2)
    g.globalAlpha = 1
  }
}
