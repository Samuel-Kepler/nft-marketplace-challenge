import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { isApiRequestError } from '@/shared/api/errors';
import { LoginRequestSchema, RegisterRequestSchema } from '@/shared/schemas/user';
import { zodFieldErrors } from '@/shared/utils/form-errors';
import { Button } from '@/shared/ui/button';
import { safeRedirect } from './guard';
import { useLogin, useRegister } from './session';

const FIELDS = {
  login: [
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'password', label: 'Senha', type: 'password' },
  ],
  register: [
    { name: 'name', label: 'Nome', type: 'text' },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'password', label: 'Senha', type: 'password' },
  ],
} as const;

/** Formulário de login/cadastro: valida no cliente (Zod), mostra erros da API por campo e volta ao fluxo anterior. */
export function AuthForm({ mode, redirect }: { mode: 'login' | 'register'; redirect?: string }) {
  const navigate = useNavigate();
  const login = useLogin();
  const register = useRegister();
  const mutation = mode === 'login' ? login : register;
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const apiError = isApiRequestError(mutation.error) ? mutation.error : null;
  const errors: Record<string, string | undefined> = { ...apiError?.fields, ...clientErrors };

  return (
    <form
      noValidate
      className="max-w-none"
      onSubmit={(e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        const onSuccess = () => void navigate({ href: safeRedirect(redirect) });
        if (mode === 'login') {
          const parsed = LoginRequestSchema.safeParse(values);
          setClientErrors(zodFieldErrors(parsed));
          if (parsed.success) login.mutate(parsed.data, { onSuccess });
        } else {
          const parsed = RegisterRequestSchema.safeParse(values);
          setClientErrors(zodFieldErrors(parsed));
          if (parsed.success) register.mutate(parsed.data, { onSuccess });
        }
      }}
    >
      {FIELDS[mode].map(({ name, label, type }) => (
        <div key={name}>
          <label htmlFor={`auth-${name}`}>{label}</label>
          <input
            id={`auth-${name}`}
            name={name}
            type={type}
            autoComplete={name === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : name}
            aria-invalid={errors[name] ? true : undefined}
            aria-describedby={errors[name] ? `auth-${name}-error` : undefined}
          />
          {errors[name] && (
            <p id={`auth-${name}-error`} role="alert">
              {errors[name]}
            </p>
          )}
        </div>
      ))}
      {apiError && !apiError.fields && <p role="alert">{apiError.message}</p>}
      <Button type="submit" size="lg" disabled={mutation.isPending} aria-busy={mutation.isPending}>
        {mode === 'login' ? 'Entrar' : 'Criar conta'}
      </Button>
    </form>
  );
}
