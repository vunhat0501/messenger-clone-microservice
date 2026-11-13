export enum Role {
  ADMIN = 'admin',
  USER = 'user',
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ProfileData {
  id: string;
  userName: string;
  email: string;
  role: Role;
  avatarUrl: string;
  bio: string;
  createdAt: Date;
}
