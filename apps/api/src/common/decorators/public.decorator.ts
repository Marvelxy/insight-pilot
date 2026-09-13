import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip the global JwtAuthGuard — use only for register/login/health. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
