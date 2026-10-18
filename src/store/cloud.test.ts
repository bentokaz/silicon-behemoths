// The sync folder and the online account, with the browser and the network
// replaced by fakes. No request in these tests leaves the machine: `fetch` is
// a stub that records what would have been sent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ idb: new Map<string, unknown>() }))
vi.mock('idb-keyval', () => ({
  get: async (k: string) => h.idb.get(k),
  set: async (k: string, v: unknown) => void h.idb.set(k, v),
}))

import { OFFLINE, checkCloud, chooseFolder, cloudAddressProblem, cloudBuiltIn, cloudConfig, cloudRemembers, cloudStatus, cloudUser, deleteRemote, folderState, forgetFolder, listRemote, pushRemote, sendFeedback, setCloudConfig, signIn, signOut, signUp } from './cloud'

const URL_ = 'https://project.example.test'
const KEY = 'anon-key'

/** localStorage, as a browser has it. */
function storage() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data }
}
const reply = (status: number, body: unknown, text = false) => ({ ok: status >= 200 && status < 300, status, json: async () => (text ? Promise.reject(new SyntaxError('Unexpected token <')) : body) }) as unknown as Response
const failing = async (p: Promise<unknown>) => p.then(() => 'did not fail', (e: Error) => e.message)

let store: ReturnType<typeof storage>
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>
const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined }))
const session = (expires = Date.now() + 3600e3) => store.setItem('sb-cloud-session', JSON.stringify({ access: 'token-1', refresh: 'refresh-1', expires, email: 'player@example.test' }))

beforeEach(() => {
  h.idb.clear()
  store = storage()
  fetchMock = vi.fn(async () => reply(200, []))
  vi.stubGlobal('localStorage', store)
  // the project that ships with the game is switched off here: these tests talk to nothing real
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_KEY', '')
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the project address', () => {
  it('takes an https address and nothing a browser should not be sent to', () => {
    expect(cloudAddressProblem(URL_, KEY)).toBeNull()
    expect(cloudAddressProblem('http://localhost:54321', KEY)).toBeNull()
    for (const bad of ['', '   ', 'project', 'ftp://project.example.test', 'http://project.example.test', 'javascript:alert(1)', 'https://user:pass@project.example.test', '//project.example.test']) expect(cloudAddressProblem(bad, KEY), bad).toEqual(expect.any(String))
    expect(cloudAddressProblem(URL_, ' ')).toMatch(/both/)
  })

  it('remembers a good one tidily and does not remember a bad one', () => {
    expect(cloudConfig()).toBeNull()
    expect(setCloudConfig('not an address', KEY)).toMatch(/not a web address/)
    expect(cloudConfig()).toBeNull()
    expect(setCloudConfig(`  ${URL_}///  `, ` ${KEY} `)).toBeNull()
    expect(cloudConfig()).toEqual({ url: URL_, key: KEY })
    // an address kept by an older version that no browser would talk to counts as none
    store.setItem('sb-cloud', JSON.stringify({ url: 'project', key: KEY }))
    expect(cloudConfig()).toBeNull()
    store.setItem('sb-cloud', '{not json')
    expect(cloudConfig()).toBeNull()
    // a project that comes with the game is used whatever the player has typed in
    expect(cloudBuiltIn()).toBe(false)
    vi.stubEnv('VITE_SUPABASE_URL', 'https://built-in.example.test')
    vi.stubEnv('VITE_SUPABASE_KEY', 'built-in-key')
    expect(cloudConfig()).toEqual({ url: 'https://built-in.example.test', key: 'built-in-key' })
    expect(cloudBuiltIn()).toBe(true)
  })
})

describe('signing in', () => {
  beforeEach(() => void setCloudConfig(URL_, KEY))

  it('keeps the session and sends the password nowhere but the project', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { email: 'player@example.test' } }))
    await signIn('player@example.test', 'correct horse')
    expect(cloudUser()).toBe('player@example.test')
    expect(calls()).toHaveLength(1)
    expect(calls()[0]).toMatchObject({ url: `${URL_}/auth/v1/token?grant_type=password`, method: 'POST', body: { email: 'player@example.test', password: 'correct horse' } })
    // the password is in the body of that one request and is not kept anywhere
    expect(JSON.stringify([...store.data])).not.toContain('correct horse')
    signOut()
    expect(cloudUser()).toBeNull()
  })

  it('says what the server said, or that it could not be reached', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error_description: 'Invalid login credentials' }))
    expect(await failing(signIn('a@b.c', 'wrong password'))).toBe('Invalid login credentials')
    fetchMock.mockResolvedValueOnce(reply(200, { user: { email: 'a@b.c' } }))
    expect(await failing(signUp('a@b.c', 'secret1'))).toMatch(/Check your email to confirm/)
    fetchMock.mockResolvedValueOnce(reply(502, null, true))
    expect(await failing(signIn('a@b.c', 'secret1'))).toMatch(/having trouble \(error 502\)/)
    fetchMock.mockResolvedValueOnce(reply(404, null, true))
    expect(await failing(signIn('a@b.c', 'secret1'))).toMatch(/did not answer like a save server \(error 404\)/)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await failing(signIn('a@b.c', 'secret1'))).toBe(OFFLINE)
    expect(cloudUser()).toBeNull()
    store.data.clear()
    expect(await failing(signIn('a@b.c', 'secret1'))).toBe('Online saves are not set up')
  })
})

describe('the online account', () => {
  beforeEach(() => void setCloudConfig(URL_, KEY))
  const file = { meta: { slot: 'main', savedAt: 5 }, state: { day: 1 } }

  it('does nothing at all while nobody is signed in', async () => {
    await pushRemote('main', file)
    expect(await listRemote()).toEqual([])
    await deleteRemote('main')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a save to the signed-in account and to nowhere else', async () => {
    session()
    fetchMock.mockResolvedValueOnce(reply(201, null))
    await pushRemote('main', file)
    expect(calls()).toHaveLength(1)
    expect(calls()[0]).toMatchObject({ url: `${URL_}/rest/v1/saves?on_conflict=user_id,slot`, method: 'POST', body: { slot: 'main', meta: file.meta, state: file.state } })
    expect(calls()[0].headers).toMatchObject({ apikey: KEY, Authorization: 'Bearer token-1' })
    expect(cloudStatus()).toMatchObject({ ok: true })
    for (const c of calls()) expect(c.url.startsWith(URL_ + '/')).toBe(true)
  })

  it('never fails the local save, and remembers what went wrong', async () => {
    session()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(pushRemote('main', file)).resolves.toBeUndefined()
    expect(cloudStatus()).toMatchObject({ ok: false, error: OFFLINE })
    fetchMock.mockResolvedValueOnce(reply(413, { message: 'too large' }))
    await expect(pushRemote('main', file)).resolves.toBeUndefined()
    expect(cloudStatus()).toMatchObject({ ok: false, error: 'This save is too large for the online account: too large' })
    fetchMock.mockResolvedValueOnce(reply(401, {}))
    await pushRemote('main', file)
    expect(cloudStatus()!.error).toMatch(/Sign in again/)
    fetchMock.mockResolvedValueOnce(reply(500, {}))
    await pushRemote('main', file)
    expect(cloudStatus()!.error).toMatch(/error 500/)
  })

  it('lists what is there, passes over rows that are not saves, and fetches one on asking', async () => {
    session()
    fetchMock.mockResolvedValueOnce(reply(200, [{ slot: 'main', meta: { slot: 'main', company: 'A', day: 3, cash: 1, savedAt: 9 } }, { slot: 'no label' }, null, { slot: 7, meta: {} }, { slot: 'bad', meta: { savedAt: 'x' } }]))
    const list = await listRemote()
    expect(list.map((r) => r.slot)).toEqual(['main'])
    fetchMock.mockResolvedValueOnce(reply(200, [{ state: { day: 3 } }]))
    expect(await list[0].load()).toEqual({ day: 3 })
    expect(calls()[1].url).toBe(`${URL_}/rest/v1/saves?select=state&slot=eq.main`)
    fetchMock.mockResolvedValueOnce(reply(500, { message: 'boom' }))
    expect(await list[0].load()).toBeUndefined()
    fetchMock.mockResolvedValueOnce(reply(200, { message: 'not a list' }))
    expect(await listRemote()).toEqual([])
    fetchMock.mockResolvedValueOnce(reply(403, {}))
    expect(await listRemote()).toEqual([])
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await listRemote()).toEqual([])
  })

  it('escapes a slot name in the address it asks for', async () => {
    session()
    await deleteRemote('my save & more/../x')
    expect(calls()[0]).toMatchObject({ method: 'DELETE', url: `${URL_}/rest/v1/saves?slot=eq.my%20save%20%26%20more%2F..%2Fx` })
  })

  it('renews a session that is running out, and only the server can end it', async () => {
    // about to expire, and the network is down: still signed in afterwards
    session(Date.now() + 1000)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await pushRemote('main', file)
    expect(cloudUser()).toBe('player@example.test')
    // a gateway error in between: the same
    fetchMock.mockResolvedValueOnce(reply(503, null, true))
    await pushRemote('main', file)
    expect(cloudUser()).toBe('player@example.test')
    // renewed: the new token is used for the request that follows
    fetchMock.mockResolvedValueOnce(reply(200, { access_token: 'token-2', refresh_token: 'refresh-2', expires_in: 3600, user: { email: 'player@example.test' } }))
    fetchMock.mockResolvedValueOnce(reply(201, null))
    await pushRemote('main', file)
    const sent = calls().slice(-2)
    expect(sent[0]).toMatchObject({ url: `${URL_}/auth/v1/token?grant_type=refresh_token`, body: { refresh_token: 'refresh-1' } })
    expect(sent[1].headers.Authorization).toBe('Bearer token-2')
    // the server says the session is over: signed out
    session(Date.now() - 1000)
    fetchMock.mockResolvedValueOnce(reply(400, { error_description: 'Invalid Refresh Token' }))
    await pushRemote('main', file)
    expect(cloudUser()).toBeNull()
  })

  it('reads a session that is not one as no session', async () => {
    store.setItem('sb-cloud-session', '"just a string"')
    expect(cloudUser()).toBeNull()
    store.setItem('sb-cloud-session', '{broken')
    expect(cloudUser()).toBeNull()
    await pushRemote('main', file)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the reported trouble: signing in that seemed to do nothing', () => {
  beforeEach(() => void setCloudConfig(URL_, KEY))
  const file = { meta: { slot: 'main', savedAt: 5 }, state: { day: 1 } }
  // a token as the server issues them: header.payload.signature, the payload naming the account
  const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub })).replace(/=+$/, '')}.y`
  const throwing = () => {
    throw new Error('SecurityError')
  }

  it('stays signed in for the visit where the browser keeps nothing (a frame inside the itch.io page)', async () => {
    // storage that takes every write and keeps none, as some browsers give a frame from another site
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    expect(setCloudConfig(URL_, KEY)).toBeNull()
    expect(cloudConfig()).toEqual({ url: URL_, key: KEY })
    fetchMock.mockResolvedValueOnce(reply(200, { access_token: jwt('u-1'), refresh_token: 'r', expires_in: 3600, user: { email: 'player@example.test', id: 'u-1' } }))
    await signIn(' Player@Example.test ', 'secret1')
    expect(calls()[0].body.email).toBe('player@example.test')
    expect(cloudUser()).toBe('player@example.test')
    expect(cloudRemembers()).toBe(false)
    fetchMock.mockResolvedValueOnce(reply(201, null))
    await pushRemote('main', file)
    expect(calls()[1].body).toMatchObject({ user_id: 'u-1', slot: 'main' })
    // storage that throws at every touch
    vi.stubGlobal('localStorage', { getItem: throwing, setItem: throwing, removeItem: throwing })
    expect(cloudUser()).toBe('player@example.test')
    signOut()
    expect(cloudUser()).toBeNull()
  })

  it('files a save under the account, read from the token when an older session did not keep it', async () => {
    store.setItem('sb-cloud-session', JSON.stringify({ access: jwt('u-9'), refresh: 'r', expires: Date.now() + 3600e3, email: 'p@example.test' }))
    fetchMock.mockResolvedValueOnce(reply(201, null))
    await pushRemote('main', file)
    expect(calls()[0].body).toMatchObject({ user_id: 'u-9', slot: 'main', meta: file.meta })
  })

  it('shows what the server said when it refuses a save or a listing', async () => {
    session()
    fetchMock.mockResolvedValueOnce(reply(400, { code: '23502', message: 'null value in column "user_id" violates not-null constraint', details: null, hint: null }))
    await pushRemote('main', file)
    expect(cloudStatus()!.error).toBe('The online account could not store the save (error 400): null value in column "user_id" violates not-null constraint')
    fetchMock.mockResolvedValueOnce(reply(404, { code: '42P01', message: 'relation "public.saves" does not exist' }))
    expect(await listRemote()).toEqual([])
    expect(cloudStatus()!.error).toMatch(/relation "public.saves" does not exist/)
    fetchMock.mockResolvedValueOnce(reply(403, { message: 'permission denied for table saves' }))
    expect(await checkCloud()).toMatch(/Sign in again: permission denied for table saves/)
    fetchMock.mockResolvedValueOnce(reply(200, []))
    expect(await checkCloud()).toBeNull()
  })

  it('replaces the row by hand where the table has no (user_id, slot) key to upsert on', async () => {
    session()
    const conflict = { ...reply(400, { code: '42P10' }), clone: () => reply(400, { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' }) } as unknown as Response
    fetchMock.mockResolvedValueOnce(conflict).mockResolvedValueOnce(reply(204, null)).mockResolvedValueOnce(reply(201, null))
    await pushRemote('main', file)
    expect(calls().map((c) => `${c.method} ${c.url.slice(URL_.length)}`)).toEqual(['POST /rest/v1/saves?on_conflict=user_id,slot', 'DELETE /rest/v1/saves?slot=eq.main', 'POST /rest/v1/saves'])
    expect(cloudStatus()).toMatchObject({ ok: true })
  })

  it('gives a sign-up refusal in the server words, and an unexplained one with its number', async () => {
    fetchMock.mockResolvedValueOnce(reply(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' }))
    expect(await failing(signUp('a@b.c', 'secret1'))).toBe('User already registered')
    fetchMock.mockResolvedValueOnce(reply(429, {}))
    expect(await failing(signIn('a@b.c', 'secret1'))).toBe('Sign-in failed (error 429)')
  })
})

describe('feedback', () => {
  const row = { kind: 'bug', message: 'It broke', contact: null, context: {} }
  it('reports whether it was sent, and never throws', async () => {
    expect(await sendFeedback(row)).toBe(false)
    setCloudConfig(URL_, KEY)
    fetchMock.mockResolvedValueOnce(reply(201, null))
    expect(await sendFeedback(row)).toBe(true)
    expect(calls()[0]).toMatchObject({ url: `${URL_}/rest/v1/feedback`, method: 'POST', body: row })
    // a publishable key is not a token: it goes in the apikey header only
    expect(calls()[0].headers.Authorization).toBeUndefined()
    fetchMock.mockResolvedValueOnce(reply(500, null))
    expect(await sendFeedback(row)).toBe(false)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await sendFeedback(row)).toBe(false)
  })
})

describe('the sync folder', () => {
  /** A folder as the browser hands one over, holding named files. */
  function folder(files: Record<string, string>, permission: 'granted' | 'prompt' = 'granted') {
    const written: Record<string, string> = {}
    return {
      name: 'Saves',
      files,
      written,
      queryPermission: async () => permission,
      requestPermission: async () => 'granted' as const,
      async *values() {
        for (const [name, text] of Object.entries(files)) yield { kind: 'file', name, getFile: async () => ({ text: async () => text }) }
        yield { kind: 'directory', name: 'sub.sbsave.json' }
      },
      getFileHandle: async (name: string) => ({ createWritable: async () => ({ write: async (text: string) => void (written[name] = text), close: async () => void (files[name] = written[name]) }) }),
      removeEntry: async (name: string) => void delete files[name],
    }
  }

  it('is simply not there in a browser without folder access', async () => {
    expect(await folderState()).toEqual({ state: 'unsupported' })
    await pushRemote('main', { meta: {}, state: {} })
    expect(await listRemote()).toEqual([])
  })

  it('writes each save as a file, reads back the sound ones and passes over the rest', async () => {
    const good = JSON.stringify({ meta: { slot: 'main', company: 'A', day: 3, cash: 1, savedAt: 9 }, state: { day: 3 } })
    const dir = folder({
      'main.sbsave.json': good,
      'cut short.sbsave.json': good.slice(0, 30),
      'bare.sbsave.json': JSON.stringify({ day: 3, companies: [] }),
      'no label.sbsave.json': JSON.stringify({ meta: { savedAt: 'x' }, state: {} }),
      'notes.txt': 'not a save',
      'package.json': '{"name":"x"}',
    })
    vi.stubGlobal('window', { showDirectoryPicker: async () => dir })
    expect(await folderState()).toEqual({ state: 'none' })
    expect(await chooseFolder()).toBe('Saves')
    expect(await folderState()).toEqual({ state: 'ready', name: 'Saves' })
    const list = await listRemote()
    expect(list.map((r) => r.slot)).toEqual(['main'])
    expect(await list[0].load()).toEqual({ day: 3 })
    // a slot name becomes a file name with nothing in it a file system would trip on
    await pushRemote('my/slot:*?', { meta: { slot: 'my/slot:*?', savedAt: 1 }, state: { day: 1 } })
    expect(Object.keys(dir.written)).toEqual(['my_slot_.sbsave.json'])
    expect(JSON.parse(dir.written['my_slot_.sbsave.json'])).toEqual({ meta: { slot: 'my/slot:*?', savedAt: 1 }, state: { day: 1 } })
    await deleteRemote('main')
    expect(dir.files['main.sbsave.json']).toBeUndefined()
    await forgetFolder()
    expect(await folderState()).toEqual({ state: 'none' })
  })

  it('leaves the folder alone until the browser allows it again', async () => {
    const dir = folder({}, 'prompt')
    vi.stubGlobal('window', { showDirectoryPicker: async () => dir })
    await chooseFolder()
    expect(await folderState()).toEqual({ state: 'locked', name: 'Saves' })
    await pushRemote('main', { meta: {}, state: {} })
    expect(dir.written).toEqual({})
    expect(await listRemote()).toEqual([])
  })
})
