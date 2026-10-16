import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestData, requestVoid } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { pushNotice } from '@/shared/realtime/notices';
import { updateSessionUser } from '@/shared/api/session-store';
import {
  UserSchema,
  type PasswordChangeRequest,
  type ProfileUpdateRequest,
} from '@/shared/schemas/user';
import { useSession } from '@/features/auth/session';

export function useProfile() {
  const userId = useSession()?.user.id;
  return useQuery({
    queryKey: queryKeys.profile(userId ?? 'guest'),
    queryFn: ({ signal }) => requestData(UserSchema, { url: '/profile', signal }),
    enabled: Boolean(userId),
  });
}

export function useUpdateProfile(successMessage = 'Dados atualizados.') {
  const queryClient = useQueryClient();
  const userId = useSession()?.user.id;
  return useMutation({
    mutationFn: (patch: ProfileUpdateRequest) => requestData(UserSchema, { method: 'PATCH', url: '/profile', data: patch }),
    onSuccess: (user) => {
      if (userId) queryClient.setQueryData(queryKeys.profile(userId), user);
      updateSessionUser(user);
      // Aqui (e não no `mutate`): o formulário é remontado ao salvar e descartaria o callback da chamada.
      pushNotice('success', successMessage);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: PasswordChangeRequest) => requestVoid({ method: 'PATCH', url: '/profile/password', data: body }),
  });
}
