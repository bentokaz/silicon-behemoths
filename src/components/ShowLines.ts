// The words and the clock of a keynote's pre-show (Show.tsx), apart so they can be tested without the 3D view.

/** Seconds as a broadcast clock: 00:07. */
export const clockText = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** What the press says while the house fills, by how strong the device is (0-1). Made-up outlets. */
export function pressLines(wow: number, points: string[], name: string): [string, string][] {
  const best = points[0] ?? 'design'
  const next = points[1] ?? best
  if (wow >= 0.7)
    return [
      [`Everyone here is talking about the ${best.toLowerCase()}. If the rumours hold, ${name} is the one to beat.`, 'The Circuit'],
      [`Queues outside since dawn. We have not seen a crowd like this in years.`, 'Byte Weekly'],
      [`Early hands-on reports put its ${next.toLowerCase()} at the top of the class.`, 'Signal and Noise'],
    ]
  if (wow >= 0.4)
    return [
      [`Solid, by the sound of it. The question is the price.`, 'The Circuit'],
      [`Word is the ${best.toLowerCase()} is the headline. We will see if the rest keeps up.`, 'Byte Weekly'],
      [`A full house, and a curious one.`, 'Signal and Noise'],
    ]
  return [
    [`Expectations are modest. It will need a surprise tonight.`, 'The Circuit'],
    [`Plenty of empty seats near the back. The stream will tell.`, 'Byte Weekly'],
    [`The ${best.toLowerCase()} had better be good: there is not much else in the leaks.`, 'Signal and Noise'],
  ]
}

/** First impressions from the hands-on area after the show, by the press score (0-100). Made-up outlets. */
export function handsOnLines(press: number, name: string, best: string): [string, string][] {
  const b = best.toLowerCase()
  if (press >= 75)
    return [
      [`Ten minutes with ${name} and we did not want to hand it back.`, 'The Circuit'],
      [`The ${b} is every bit as good as the stage made it look.`, 'Byte Weekly'],
    ]
  if (press >= 50)
    return [
      [`${name} feels well made. The ${b} is the highlight.`, 'The Circuit'],
      [`Good in the hand, though we will want more time with it.`, 'Signal and Noise'],
    ]
  return [
    [`${name} did not win the room at the demo tables.`, 'Byte Weekly'],
    [`The ${b} is fine. Not much else stood out.`, 'Signal and Noise'],
  ]
}
