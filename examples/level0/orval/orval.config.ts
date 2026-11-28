import { defineConfig } from 'orval';

export default defineConfig({
  places: {
    input: '../../../schema/level0/openapi.yaml',
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
});
