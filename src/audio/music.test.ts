import { describe, expect, it } from 'vitest'
import { type Mood, TRACKS, nowPlaying, setMusicLevel, setMusicMood, tracksFor } from './music'

describe('background music', () => {
  it('has several tracks for every mood, each with whole bars of patterns', () => {
    for (const m of ['calm', 'focus', 'drive', 'bright', 'show'] as Mood[]) expect(tracksFor(m).length, m).toBeGreaterThanOrEqual(m === 'show' ? 1 : 2)
    expect(new Set(TRACKS.map((t) => t.name)).size).toBe(TRACKS.length)
    for (const t of TRACKS) {
      for (const p of [t.bass, t.arp, t.kick, t.hat]) if (p) expect(p, t.name).toHaveLength(16)
      expect(t.chords.length).toBeGreaterThan(1)
      expect(t.bpm).toBeGreaterThan(60)
    }
  })
  it('does nothing and throws nothing where there is no audio', () => {
    expect(() => (setMusicMood('focus'), setMusicLevel(0.4), setMusicMood('none'), setMusicLevel(0))).not.toThrow()
    expect(nowPlaying()).toBeNull()
  })
})
