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
  /** The account's id, which every save row is filed under. Older sessions lack it: it is read from the token. */
  uid?: string
}
const CFG = 'sb-cloud'
const SES = 'sb-cloud-session'
const env = import.meta.env as Record<string, string | undefined>

/**
 * What the browser would not keep. Inside the itch.io page the game runs in a
 * frame from another site, and some browsers give such a frame no storage, or
 * storage that is thrown away: whatever could not be written is kept here for
 * as long as the page is open, so signing in still works for this visit.
 */
const memory: { config?: CloudConfig | null; session?: Session | null } = {}
let remembered = true
/** False when the browser would not keep the sign-in: the player will need to sign in again on their next visit. */
export const cloudRemembers = () => remembered

function readStored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}
/** Writes to the browser's storage; false (and kept in memory instead by the caller) when it will not take it. */
function store(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
    // a frame whose storage is a no-op takes the write and keeps nothing
    if (value !== null && localStorage.getItem(key) === null) throw new Error('not kept')
    return true
  } catch {
    return false
  }
}

export function cloudConfig(): CloudConfig | null {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_KEY) return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_KEY }
  const c = (readStored(CFG) as CloudConfig | null) ?? memory.config ?? null
  // an address stored by an older version that no browser would talk to is as good as none
  return c && typeof c === 'object' && c.url && c.key && !cloudAddressProblem(c.url, c.key) ? c : null
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
  const cfg = { url: url.trim().replace(/\/+$/, ''), key: key.trim() }
  // kept for this visit even where the browser will not keep it for the next
  const kept = store(CFG, cfg)
  memory.config = kept ? undefined : cfg
  remembered = kept
  return null
}
/** Forget the project typed in, to enter another. */
export function forgetCloudConfig() {
  memory.config = null
  store(CFG, null)
}
const isSession = (s: unknown): s is Session => !!s && typeof s === 'object' && typeof (s as Session).access === 'string' && typeof (s as Session).expires === 'number'
const session = (): Session | null => {
  const s = readStored(SES)
  if (isSession(s)) return s
  return memory.session && isSession(memory.session) ? memory.session : null
}
function keepSession(s: Session | null) {
  const kept = store(SES, s)
  memory.session = kept ? undefined : s
  if (s) remembered = kept
}
export const cloudUser = () => session()?.email ?? null
export const signOut = () => {
  memory.session = null
  store(SES, null)
}

/** The account id a token was issued for: its "sub" claim. */
function subject(jwt: string): string | undefined {
  try {
    const part = jwt.split('.')[1]
    if (!part) return undefined
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))) as { sub?: unknown }
    return typeof json.sub === 'string' ? json.sub : undefined
  } catch {
    return undefined
  }
}
const userId = (s: Session) => s.uid || subject(s.access)

/** Thrown when the server could not be reached or did not answer as itself: nothing is known about the account either way. */
class Unreachable extends Error {}
export const OFFLINE = 'The online save server could not be reached. Check your connection and try again.'

/** The server's own words for what went wrong, from the body of its answer: Supabase's auth and data servers each phrase it their own way. */
async function serverWords(res: Response): Promise<string | undefined> {
  try {
    const d = (await res.json()) as Record<string, unknown> | null
    if (!d || typeof d !== 'object') return undefined
    const parts = [d.error_description, d.msg, d.message, d.error, d.details, d.hint].filter((v): v is string => typeof v === 'string' && !!v.trim())
    return parts.length ? [...new Set(parts)].join('. ').replace(/\.\./g, '.') : undefined
  } catch {
    return undefined
  }
}

async function auth(path: string, body: object): Promise<Session> {
  const cfg = cloudConfig()
  if (!cfg) throw new Error('Online saves are not set up')
  let res: Response
  try {
    res = await fetch(`${cfg.url}/auth/v1/${path}`, { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Unreachable(OFFLINE)
  }
  let data: { access_token?: string; refresh_token?: string; expires_in?: number; user?: { email?: string; id?: string }; msg?: string; error_description?: string; message?: string; error?: string }
  try {
    data = ((await res.json()) ?? {}) as typeof data
  } catch {
    // an error page from something in between, not an answer from the project
    throw new Unreachable(res.status >= 500 ? `The online save server is having trouble (error ${res.status}). Try again in a little while.` : `The project address did not answer like a save server (error ${res.status}). Check the address.`)
  }
  if (res.status >= 500) throw new Unreachable(`The online save server is having trouble (error ${res.status}). Try again in a little while.`)
  if (!res.ok || !data.access_token) {
    const said = data.error_description ?? data.msg ?? data.message ?? data.error
    throw new Error(said ? String(said) : res.ok ? 'Check your email to confirm the account, then sign in' : `Sign-in failed (error ${res.status})`)
  }
  const s: Session = { access: data.access_token, refresh: data.refresh_token ?? '', expires: Date.now() + (Number.isFinite(data.expires_in) ? data.expires_in! : 3600) * 1000, email: data.user?.email ?? '', uid: data.user?.id ?? subject(data.access_token) }
  keepSession(s)
  return s
}
/** Email addresses are compared without case and stray spaces: a phone keyboard adds both. */
const tidyEmail = (email: string) => String(email ?? '').trim().toLowerCase()
export const signIn = (email: string, password: string) => auth('token?grant_type=password', { email: tidyEmail(email), password })
export const signUp = (email: string, password: string) => auth('signup', { email: tidyEmail(email), password })

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

/** How the last exchange with the online account went: when, and what the server said if it refused. */
export interface SyncStatus {
  at: number
  ok: boolean
  error?: string
}
let lastSync: SyncStatus | null = null
/** The outcome of the most recent online save or listing in this session, or null if none has been tried. */
export const cloudStatus = (): SyncStatus | null => lastSync

/** A refusal from the data server, in words the player can act on, with the server's own message after them. */
async function refusal(res: Response, doing: string): Promise<string> {
  const said = await serverWords(res)
  const why = res.status === 413 ? 'This save is too large for the online account' : res.status === 401 || res.status === 403 ? `The online account refused to ${doing}. Sign in again` : `The online account could not ${doing} (error ${res.status})`
  return said ? `${why}: ${said}` : why
}

async function cloudWrite(slot: string, file: { meta: object; state: unknown }) {
  const s = session()
  const uid = s ? userId(s) : undefined
  // the account is named in the row: a table whose user_id has no default would otherwise refuse it
  const row = { ...(uid ? { user_id: uid } : {}), slot, meta: file.meta, state: file.state }
  let res: Response | null
  try {
    res = await rest('saves?on_conflict=user_id,slot', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) })
    // a table without the (user_id, slot) key cannot be upserted into: replace the row by hand instead
    if (res && res.status === 400 && ((await res.clone?.().json().catch(() => null)) as { code?: string } | null)?.code === '42P10') {
      await rest(`saves?slot=eq.${encodeURIComponent(slot)}`, { method: 'DELETE' })
      res = await rest('saves', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) })
    }
  } catch {
    lastSync = { at: Date.now(), ok: false, error: OFFLINE }
    throw new Error(OFFLINE)
  }
  // not signed in: there is nothing to report
  if (!res) return
  lastSync = res.ok ? { at: Date.now(), ok: true } : { at: Date.now(), ok: false, error: await refusal(res, 'store the save') }
  if (!res.ok) throw new Error(lastSync.error)
}
const goodRow = (r: unknown): r is { slot: string; meta: RemoteSave['meta'] } => {
  const row = r as { slot?: unknown; meta?: RemoteSave['meta'] } | null
  return !!row && typeof row.slot === 'string' && !!row.meta && typeof row.meta === 'object' && typeof row.meta.savedAt === 'number'
}
async function cloudList(): Promise<RemoteSave[]> {
  let res: Response | null
  try {
    res = await rest('saves?select=slot,meta')
  } catch {
    lastSync = { at: Date.now(), ok: false, error: OFFLINE }
    return []
  }
  if (!res) return []
  if (!res.ok) {
    lastSync = { at: Date.now(), ok: false, error: await refusal(res, 'list your saves') }
    return []
  }
  const rows = (await res.json().catch(() => null)) as unknown
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

/**
 * Asks the account for its saves once, to see that online saving works end to
 * end. Null when it does (or nobody is signed in), else what the server said:
 * a missing table, a refused rule, an expired session.
 */
export async function checkCloud(): Promise<string | null> {
  let res: Response | null
  try {
    res = await rest('saves?select=slot&limit=1')
  } catch {
    return OFFLINE
  }
  if (!res) return session() ? 'The session has ended. Sign in again.' : null
  if (res.ok) return null
  return refusal(res, 'read your saves')
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
      // an anon key is a token and may be sent as one; the newer publishable keys are not, and the server refuses them there
      headers: { apikey: cfg.key, ...(cfg.key.split('.').length === 3 ? { Authorization: `Bearer ${cfg.key}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
    return res.ok
  } catch {
    return false
  }
}
