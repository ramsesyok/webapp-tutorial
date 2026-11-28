import { readFile, writeFile } from 'node:fs/promises';

const zodFile = new URL('../src/api/generated/zod.gen.ts', import.meta.url);
const source = await readFile(zodFile, 'utf8');
// Hey API 0.99.0 が正規表現に出力するUnicodeの行区切り文字をエスケープする。
await writeFile(zodFile, source.replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029'));
