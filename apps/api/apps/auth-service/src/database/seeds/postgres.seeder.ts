import { Auth } from 'apps/auth-service/src/auth/entities/auth.entity';
import { User } from 'apps/auth-service/src/user/entities/user.entity';
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export class MainSeeder implements Seeder {
  private dataSource: DataSource;
  private factoryManager: SeederFactoryManager;
  private users: User[] = [];

  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    this.dataSource = dataSource;
    this.factoryManager = factoryManager;

    console.log('Start seeding...');

    await this.seedUsersAuthStories();
    // await this.seedFollows();

    console.log('Finished seeding!');
  }

  private async seedUsersAuthStories() {
    console.log('Seeding users, auth');

    const userFactory = this.factoryManager.get(User);
    const authFactory = this.factoryManager.get(Auth);

    // Users can still be bulk saved via the factory
    this.users = await userFactory.saveMany(1000);

    const authsToInsert = [];

    for (const user of this.users) {
      // Create entities in memory using .make() instead of .save()
      const auth = await authFactory.make({ user });
      authsToInsert.push(auth);

      // Bulk Insert
      await this.dataSource
        .getRepository(Auth)
        .save(authsToInsert, { chunk: 100 });
    }
  }

  // private async seedFollows() {
  //   console.log('Seeding follows...');

  //   const followRepo = this.dataSource.getRepository(Follow);
  //   const followsToInsert = [];

  //   for (const user of this.users) {
  //     const numFollowers = faker.number.int({ min: 0, max: 5 });
  //     const otherUsers = this.users.filter((u) => u.id !== user.id);
  //     const usersToFollow = faker.helpers.arrayElements(
  //       otherUsers,
  //       numFollowers,
  //     );

  //     const uniqueFollowerIds = [...new Set(usersToFollow.map((u) => u.id))]; // Prevent duplicate follows

  //     for (const followerId of uniqueFollowerIds) {
  //       followsToInsert.push({
  //         followingUserId: user.id,
  //         followedUserId: followerId,
  //       });
  //     }
  //   }

  //   // Bulk Insert
  //   await followRepo.save(followsToInsert, { chunk: 100 });
  // }
}
