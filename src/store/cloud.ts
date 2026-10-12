// Saves beyond this browser: a folder the player picks (for example inside
// OneDrive or Google Drive), and an optional online account on a Supabase
// project. Both mirror the saves kept in the browser; neither is required.
import { get, set } from 'idb-keyval'

export interface RemoteSave {
  slot: string
  meta: { slot: string; company: string; day: number; cash: number; savedAt: number }
  /** Fetches the full save. */
  load: () => Promise<unknown>
}

// ---------------------------------------------------------------- sync folder

const DIR_KEY = 'sb-sync-dir'
type Dir = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
  values?: () => AsyncIterable<FileSystemHandle>
}
export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window
const fileName = (slot: string) => `${slot.replace(/[^\w -]+/g, '_')}.sbsave.json`

async function dir(ask = false): Promise<Dir | null> {
  if (!folderSupported()) return null
  const handle = (await get<Dir>(DIR_KEY).catch(() => undefined)) ?? null
  if (!handle) return null
  const state = await handle.queryPermission?.({ mode: 'readwrite' })
  if (state === 'granted') return handle
  // browsers forget the permission between visits; asking again needs a click
  if (ask && (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted') return handle
  return null
}

/** 'none' when no folder is chosen, 'locked' when the browser wants permission again. */
export async function folderState(): Promise<{ state: 'unsupported' | 'none' | 'locked' | 'ready'; name?: string }> {
  if (!folderSupported()) return { state: 'unsupported' }
  const handle = await get<Dir>(DIR_KEY).catch(() => undefined)
  if (!handle) return { state: 'none' }
  return { state: (await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted' ? 'ready' : 'locked', name: handle.name }
}

export async function chooseFolder(): Promise<string> {
  const handle = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Dir> }).showDirectoryPicker({ mode: 'readwrite', id: 'silicon-behemoths' })
  await set(DIR_KEY, handle)
  return handle.name
}
export const unlockFolder = async () => !!(await dir(true))
export const forgetFolder = () => set(DIR_KEY, undefined)

async function folderWrite(slot: string, file: unknown) {
  const d = await dir()
  if (!d) return
  const h = await d.getFileHandle(fileName(slot), { create: true })
  const w = await h.createWritable()
  await w.write(JSON.stringify(file))
  await w.close()
}
async function folderList(): Promise<RemoteSave[]> {
  const d = await dir()
  if (!d?.values) return []
  const out: RemoteSave[] = []
  for await (const entry of d.values()) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.sbsave.json')) continue
    try {
      const file = await (entry as FileSystemFileHandle).getFile()
      // the meta sits at the front of the file; reading it all is still quick
      const data = JSON.parse(await file.text()) as { meta?: RemoteSave['meta']; state?: unknown }
      if (data.meta && data.state && typeof data.meta.slot === 'string' && typeof data.meta.savedAt === 'number') out.push({ slot: data.meta.slot, meta: data.meta, load: async () => data.state })
    } catch {
      /* not one of ours */
    }
  }
  return out
}
async function folderDelete(slot: string) {
  const d = await dir()
  await d?.removeEntry(fileName(slot)).catch(() => {})
}

// ---------------------------------------------------------------- online account (Supabase)

interface CloudConfig {
  url: string
  key: string
}
interface Session {
  access: string
  refresh: string
  expires: number
  email: string
}
const CFG = 'sb-cloud'
const SES = 'sb-cloud-session'
const env = import.meta.env as Record<string, string | undefined>

export function cloudConfig(): CloudConfig | null {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_KEY) return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_KEY }
  try {
    const c = JSON.parse(localStorage.getItem(CFG) ?? 'null') as CloudConfig | null
    // an address stored by an older version that no browser would talk to is as good as none
    return c?.url && c.key && !cloudAddressProblem(c.url, c.key) ? c : null
  } catch {
    return null
  }
}
/** True when the project address comes with the game rather than from the player. */
export const cloudBuiltIn = () => !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_KEY)
/**
 * Why a project address cannot be used, or null. It must be a web address the
 * browser will talk to from a page served over https: https itself, or http
 * on this computer for a project run locally.
 */
export function cloudAddressProblem(url: string, key: string): string | null {
  if (typeof url !== 'string' || typeof key !== 'string' || !url.trim() || !key.trim()) return 'Enter both the project address and its key'
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return 'That is not a web address. It should look like https://your-project.supabase.co'
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return 'The project address must begin with https://'
  if (u.username || u.password) return 'The project address must not contain a user name or password'
  return null
}
/** Remember a project. Returns why not, or null; an address that cannot be used is not stored. */
export function setCloudConfig(url: string, key: string): string | null {
  const problem = cloudAddressProblem(url, key)
  if (problem) return problem
  try {
    localStorage.setItem(CFG, JSON.stringify({ url: url.trim().replace(/\/+$/, ''), key: key.trim() }))
  } catch {
    return 'The browser will not let the game remember the project (private browsing or blocked site data)'
  }
  return null
}
const session = (): Session | null => {
  try {
    const s = JSON.parse(localStorage.getItem(SES) ?? 'null') as Session | null
    return s && typeof s === 'object' && typeof s.access === 'string' && typeof s.expires === 'number' ? s : null
  } catch {
    return null
  }
}
export const cloudUser = () => session()?.email ?? null
export const signOut = () => {
  try {
    localStorage.removeItem(SES)
  } catch {
    /* nothing was stored */
  }
}

/** Thrown when the server could not be reached or did not answer as itself: nothing is known about the account either way. */
class Unreachable extends Error {}
export const OFFLINE = 'The online save server could not be reached. Check your connection and try again.'

async function auth(path: string, body: object): Promise<Session> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('Online saves are not set up')
  let res: Response
  try {
    res = await fetch(`${cfg.url}/auth/v1/${path}`, { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Unreachable(OFFLINE)
  }
  let data: { access_token?: string; refresh_token?: string; expires_in?: number; user?: { email?: string }; msg?: string; error_description?: string; message?: string }
  try {
    data = ((await res.json()) ?? {}) as typeof data
  } catch {
    // an error page from something in between, not an answer from the project
    throw new Unreachable(res.status >= 500 ? `The online save server is having trouble (error ${res.status}). Try again in a little while.` : `The project address did not answer like a save server (error ${res.status}). Check the address.`)
  }
  if (res.status >= 500) throw new Unreachable(`The online save server is having trouble (error ${res.status}). Try again in a little while.`)
  if (!res.ok || !data.access_token) throw new Error(data.error_description ?? data.msg ?? data.message ?? (res.ok ? 'Check your email to confirm the account, then sign in' : 'Sign-in failed'))
  const s: Session = { access: data.access_token, refresh: data.refresh_token ?? '', expires: Date.now() + (Number.isFinite(data.expires_in) ? data.expires_in! : 3600) * 1000, email: data.user?.email ?? '' }
  try {
    localStorage.setItem(SES, JSON.stringify(s))
  } catch {
    /* signed in for now; it will not be remembered */
  }
  return s
}
export const signIn = (email: string, password: string) => auth('token?grant_type=password', { email, password })
export const signUp = (email: string, password: string) => auth('signup', { email, password })

async function token(): Promise<string | null> {
  const s = session()
  if (!s || !cloudConfig()) return null
  if (s.expires - Date.now() > 60e3) return s.access
  try {
    return (await auth('token?grant_type=refresh_token', { refresh_token: s.refresh })).access
  } catch (e) {
    // only the server saying the session is over ends it: a train tunnel must not sign anyone out
    if (!(e instanceof Unreachable)) signOut()
    return null
  }
}
async function rest(path: string, init: RequestInit = {}): Promise<Response | null> {
  const cfg = cloudConfig()
  const t = await token()
  if (!cfg || !t) return null
  return fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers: { apikey: cfg.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
}

/** How the last copy sent to the online account went: when, and what the server said if it refused. */
export interface SyncStatus {
  at: number
  ok: boolean
  error?: string
}
let lastSync: SyncStatus | null = null
/** The outcome of the most recent online save in this session, or null if none has been tried. */
export const cloudStatus = (): SyncStatus | null => lastSync

async function cloudWrite(slot: string, file: { meta: object; state: unknown }) {
  let res: Response | null
  try {
    res = await rest('saves?on_conflict=user_id,slot', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ slot, meta: file.meta, state: file.state }) })
  } catch {
    lastSync = { at: Date.now(), ok: false, error: OFFLINE }
    throw new Error(OFFLINE)
  }
  // not signed in: there is nothing to report
  if (!res) return
  lastSync = res.ok ? { at: Date.now(), ok: true } : { at: Date.now(), ok: false, error: res.status === 413 ? 'This save is too large for the online account' : res.status === 401 || res.status === 403 ? 'The online account refused the save. Sign in again.' : `The online account could not store the save (error ${res.status})` }
  if (!res.ok) throw new Error(lastSync.error)
}
const goodRow = (r: unknown): r is { slot: string; meta: RemoteSave['meta'] } => {
  const row = r as { slot?: unknown; meta?: RemoteSave['meta'] } | null
  return !!row && typeof row.slot === 'string' && !!row.meta && typeof row.meta === 'object' && typeof row.meta.savedAt === 'number'
}
async function cloudList(): Promise<RemoteSave[]> {
  const res = await rest('saves?select=slot,meta')
  if (!res?.ok) return []
  const rows = (await res.json()) as unknown
  if (!Array.isArray(rows)) return []
  return rows.filter(goodRow).map((r) => ({
    slot: r.slot,
    meta: r.meta,
    load: async () => {
      const one = await rest(`saves?select=state&slot=eq.${encodeURIComponent(r.slot)}`)
      if (!one?.ok) return undefined
      const found = (await one.json()) as unknown
      return Array.isArray(found) ? (found[0] as { state?: unknown } | undefined)?.state : undefined
    },
  }))
}
async function cloudDelete(slot: string) {
  await rest(`saves?slot=eq.${encodeURIComponent(slot)}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------- used by the save module

/** Copy a save to wherever the player has set up. Never throws: local saving must not depend on it. */
export async function pushRemote(slot: string, file: { meta: object; state: unknown }) {
  await Promise.allSettled([folderWrite(slot, file), cloudWrite(slot, file)])
}
export async function listRemote(): Promise<RemoteSave[]> {
  const lists = await Promise.allSettled([folderList(), cloudList()])
  return lists.flatMap((l) => (l.status === 'fulfilled' ? l.value : []))
}
export async function deleteRemote(slot: string) {
  await Promise.allSettled([folderDelete(slot), cloudDelete(slot)])
}

// ---------------------------------------------------------------- feedback

export interface FeedbackRow {
  kind: string
  message: string
  contact: string | null
  context: Record<string, unknown>
}

/** Sends a report to the maker. Needs no account: anyone may add a row, nobody but the owner can read them. */
export async function sendFeedback(row: FeedbackRow): Promise<boolean> {
  const cfg = cloudConfig()
  if (!cfg) return false
  try {
    const res = await fetch(`${cfg.url}/rest/v1/feedback`, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
    return res.ok
  } catch {
    return false
  }
}
