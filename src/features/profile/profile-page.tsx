import { useState } from 'react';
import { isApiRequestError } from '@/shared/api/errors';
import { pushNotice } from '@/shared/realtime/notices';
import { PasswordChangeRequestSchema, ProfileUpdateRequestSchema } from '@/shared/schemas/user';
import { zodFieldErrors } from '@/shared/utils/form-errors';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { resizeAvatar, validateAvatarFile } from './avatar';
import { useChangePassword, useProfile, useUpdateProfile } from './queries';

function Field({
  id,
  label,
  error,
  ...input
}: { id: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="mb-0">{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...input} />
      {error && (
        <p id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const apiFields = (e: unknown): Record<string, string> => (isApiRequestError(e) ? (e.fields ?? {}) : {});
const apiMessage = (e: unknown) => (isApiRequestError(e) && !e.fields ? e.message : null);

function DataForm({ name, email }: { name: string; email: string }) {
  const update = useUpdateProfile();
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const errors = { ...apiFields(update.error), ...clientErrors };

  return (
    <form
      noValidate
      aria-labelledby="data-heading"
      onSubmit={(e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        const parsed = ProfileUpdateRequestSchema.safeParse({
          name: String(values.name).trim(),
          email: String(values.email).trim(),
        });
        setClientErrors(zodFieldErrors(parsed));
        if (parsed.success) update.mutate(parsed.data);
      }}
    >
      <h2 id="data-heading">Dados do colecionador</h2>
      <Field id="profile-name" name="name" label="Nome" defaultValue={name} autoComplete="name" error={errors.name} />
      <Field id="profile-email" name="email" type="email" label="E-mail" defaultValue={email} autoComplete="email" error={errors.email} />
      {apiMessage(update.error) && <p role="alert">{apiMessage(update.error)}</p>}
      <Button type="submit" disabled={update.isPending} aria-busy={update.isPending} className="justify-self-start">
        Salvar dados
      </Button>
    </form>
  );
}

function AvatarSection({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  const update = useUpdateProfile('Avatar atualizado.');
  const [error, setError] = useState<string | null>(null);
  const shown = error ?? apiFields(update.error).avatarUrl ?? apiMessage(update.error);

  return (
    <section aria-labelledby="avatar-heading">
      <h2 id="avatar-heading">Avatar</h2>
      {avatarUrl ? (
        <img src={avatarUrl} alt={`Avatar de ${name}`} width={96} height={96} className="mb-2 size-24 rounded-full object-cover" data-testid="avatar-image" />
      ) : (
        <div role="img" aria-label="Sem avatar" className="mb-2 flex size-24 items-center justify-center rounded-full border border-border bg-surface text-3xl font-bold text-primary">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <label htmlFor="avatar-file" className="mt-2">
        Escolher imagem
      </label>
      <input
        id="avatar-file"
        type="file"
        accept="image/*"
        aria-describedby={shown ? 'avatar-error' : undefined}
        aria-invalid={shown ? true : undefined}
        onChange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          input.value = '';
          if (!file) return;
          const invalid = validateAvatarFile(file);
          setError(invalid);
          if (invalid) return;
          resizeAvatar(file).then(
            (dataUrl) => update.mutate({ avatarUrl: dataUrl }),
            () => setError('Não foi possível processar esta imagem.')
          );
        }}
      />
      {shown && (
        <p id="avatar-error" role="alert">
          {shown}
        </p>
      )}
    </section>
  );
}

function PasswordForm() {
  const change = useChangePassword();
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const errors = { ...apiFields(change.error), ...clientErrors };

  return (
    <form
      noValidate
      aria-labelledby="password-heading"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
        const parsed = PasswordChangeRequestSchema.safeParse({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
        const fieldErrors = zodFieldErrors(parsed);
        if (parsed.success && values.newPassword !== values.confirmPassword) {
          fieldErrors.confirmPassword = 'As senhas não coincidem.';
        }
        setClientErrors(fieldErrors);
        if (parsed.success && !fieldErrors.confirmPassword) {
          change.mutate(parsed.data, {
            onSuccess: () => {
              form.reset();
              pushNotice('success', 'Senha alterada.');
            },
          });
        }
      }}
    >
      <h2 id="password-heading">Alterar senha</h2>
      <Field id="pw-current" name="currentPassword" type="password" label="Senha atual" autoComplete="current-password" error={errors.currentPassword} />
      <Field id="pw-new" name="newPassword" type="password" label="Nova senha" autoComplete="new-password" error={errors.newPassword} />
      <Field id="pw-confirm" name="confirmPassword" type="password" label="Confirmar nova senha" autoComplete="new-password" error={errors.confirmPassword} />
      {apiMessage(change.error) && <p role="alert">{apiMessage(change.error)}</p>}
      <Button type="submit" disabled={change.isPending} aria-busy={change.isPending} className="justify-self-start">
        Alterar senha
      </Button>
    </form>
  );
}

export function ProfilePage() {
  const profile = useProfile();
  return (
    <main className="mx-auto grid max-w-xl gap-8 p-4 sm:p-8">
      <h1>Perfil do colecionador</h1>
      {profile.isPending && (
        <div aria-busy="true" aria-label="Carregando perfil" role="status" className="grid gap-4">
          <Skeleton className="size-24 rounded-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}
      {profile.isError && (
        <div role="alert">
          <p>Não foi possível carregar o perfil.</p>
          <Button variant="outline" onClick={() => void profile.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {profile.data && (
        <>
          <AvatarSection name={profile.data.name} avatarUrl={profile.data.avatarUrl} />
          {/* `key`: ao confirmar a edição, o formulário volta a refletir o valor salvo. */}
          <DataForm key={`${profile.data.name}|${profile.data.email}`} name={profile.data.name} email={profile.data.email} />
        </>
      )}
      <PasswordForm />
    </main>
  );
}
