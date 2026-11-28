import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../../schema/level0/openapi.yaml',
  output: 'src/api/generated',
  plugins: [
    '@hey-api/typescript',
    '@hey-api/client-fetch',
    '@hey-api/sdk',
    // SDKに加えてuseQuery・useMutationへ渡すオプションを生成する。
    '@tanstack/react-query',
  ],
});
