import { defineConfig } from 'orval';

const input = '../../../schema/level1/openapi.yaml';

export default defineConfig({
  places: {
    input,
    output: {
      target: 'src/api/generated/places.ts',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: { getBaseUrlFromSpecification: true },
      override: {
        // 非2xxをrejectし、生成フックのisErrorでHTTPエラーを扱う。
        fetch: { forceSuccessResponse: true },
      },
    },
  },
  validation: {
    input,
    output: {
      target: 'src/api/generated/validation.ts',
      client: 'zod',
      override: { zod: { version: 4, generateReusableSchemas: true } },
    },
  },
});
