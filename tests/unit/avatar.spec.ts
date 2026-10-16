import { test, expect } from '@playwright/test';
import { AVATAR_MAX_INPUT_BYTES, AVATAR_MAX_SIDE, fitWithin, validateAvatarFile } from '@/features/profile/avatar';

test.describe('Avatar: validação e dimensionamento', () => {
  test('aceita apenas imagens de até 2 MB', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_INPUT_BYTES })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_INPUT_BYTES + 1 })).toMatch(/2 MB/);
    expect(validateAvatarFile({ type: 'application/pdf', size: 10 })).toMatch(/imagem/);
    expect(validateAvatarFile({ type: '', size: 10 })).toMatch(/imagem/);
  });

  test('fitWithin reduz mantendo a proporção e nunca amplia', () => {
    expect(fitWithin(1024, 512)).toEqual({ width: AVATAR_MAX_SIDE, height: 128 });
    expect(fitWithin(512, 1024)).toEqual({ width: 128, height: AVATAR_MAX_SIDE });
    expect(fitWithin(100, 50)).toEqual({ width: 100, height: 50 });
    expect(fitWithin(10000, 1)).toEqual({ width: AVATAR_MAX_SIDE, height: 1 });
  });
});
