import { createFileRoute, Link } from '@tanstack/react-router';
import { AuthForm } from '@/features/auth/auth-form';
import { parseAuthSearch, redirectIfAuthenticated } from '@/features/auth/guard';

export const Route = createFileRoute('/auth/register')({
  validateSearch: parseAuthSearch,
  beforeLoad: redirectIfAuthenticated,
  component: RegisterPage,
});

function RegisterPage() {
  const { redirect } = Route.useSearch();
  return (
    <main className="mx-auto grid max-w-md gap-4 p-4 sm:p-8">
      <h1>Criar conta</h1>
      <AuthForm mode="register" redirect={redirect} />
      <Link to="/auth/login" search={{ redirect }}>
        Já tenho conta
      </Link>
    </main>
  );
}
