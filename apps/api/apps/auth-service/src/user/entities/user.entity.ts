import { Role } from '@workspace/types';
import { Auth } from 'apps/auth-service/src/auth/entities/auth.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
@Index('idx_active_users_username', ['userName'], {
  where: 'deleted_at IS NULL',
})
export class User {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Index()
  @Column({ name: 'user_name', unique: true })
  userName: string;

  @Index()
  @Column({ unique: true })
  email: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  bio: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;

  @OneToMany(() => Auth, (auth) => auth.user)
  auths: Auth[];

  //? maybe for create a sole microservice for this later
  // @OneToMany(() => Follow, (follow) => follow.followingUser)
  // following: Follow[];

  // @OneToMany(() => Follow, (follow) => follow.followedUser)
  // followers: Follow[];
}
