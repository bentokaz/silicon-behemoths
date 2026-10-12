// The one piece of Node the tests use: reading a source file as text. (The project does not carry @types/node.)
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}
