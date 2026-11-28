import { z } from 'zod';

export function areaNameSchema(generatedName: z.ZodString) {
  return z.string().superRefine((name, context) => {
    const result = generatedName.safeParse(name);
    if (result.success) return;
    for (const issue of result.error.issues) {
      // OpenAPIの文字数はコードポイント数。ZodのUTF-16での長さ超過だけを補正する。
      if (issue.code === 'too_big' && issue.origin === 'string' && Array.from(name).length <= issue.maximum) continue;
      context.addIssue({ code: 'custom', message: issue.message });
    }
  });
}
