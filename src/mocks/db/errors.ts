import type { ApiError } from '@/shared/schemas/common';

/** Falha de domínio do mock: vira uma resposta HTTP com o envelope `ApiError`. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiFailure';
  }

  toBody(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.fields && { fields: this.fields }),
      ...(this.details && { details: this.details }),
    };
  }
}

export const validationFailure = (fields: Record<string, string>) =>
  new ApiFailure(400, 'VALIDATION_ERROR', 'Dados inválidos.', fields);

/** Converte issues do Zod em `fields` (primeira mensagem por campo). */
export function zodFields(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}
