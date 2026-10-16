/** Resultado de `safeParse` → mensagem por campo (primeira issue de cada caminho). Vazio se válido. */
export function zodFieldErrors(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}): Record<string, string> {
  const fields: Record<string, string> = {};
  if (result.success) return fields;
  for (const issue of result.error?.issues ?? []) {
    const key = issue.path.map(String).join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}
