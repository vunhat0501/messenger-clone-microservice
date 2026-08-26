import { Role } from '@workspace/types';

export type AuthJwtPayload = {
  sub: number;
  name: string;
  email: string;
  role: Role;
};
