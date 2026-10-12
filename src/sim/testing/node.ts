// The little of Node the soak harness needs, without pulling Node's types into the game's build.
declare const process: { env: Record<string, string | undefined>; getBuiltinModule: (name: string) => unknown }

interface Fs {
  writeFileSync(path: string, data: string): void
  appendFileSync(path: string, data: string): void
  mkdirSync(path: string, o: { recursive: boolean }): void
  existsSync(path: string): boolean
  readFileSync(path: string, enc: 'utf8'): string
  readdirSync(path: string): string[]
}

export const fs = () => process.getBuiltinModule('node:fs') as Fs
export const env = (key: string): string | undefined => process.env[key]
export const envNum = (key: string, fallback: number): number => {
  const v = Number(process.env[key])
  return process.env[key] !== undefined && Number.isFinite(v) ? v : fallback
}
