import { Role } from '@workspace/types';

export type AuthJwtPayload = {
  sub: string;
  name: string;
  email: string;
  role: Role;
};
