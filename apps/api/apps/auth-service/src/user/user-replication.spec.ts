import { Repository } from 'typeorm';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { Auth } from '../auth/entities/auth.entity';

describe('UserService replica reads', () => {
  const find = jest.fn();
  const release = jest.fn();
  const runner = {
    manager: { getRepository: jest.fn(() => ({ find })) },
    release,
  };
  const createQueryRunner = jest.fn(() => runner);
  const findOne = jest.fn();
  const repository = {
    manager: { connection: { createQueryRunner } },
    findOne,
  } as unknown as Repository<User>;
  const service = new UserService(repository, {} as Repository<Auth>);

  beforeEach(() => jest.clearAllMocks());

  it('reads the user directory from a replica and releases the connection', async () => {
    find.mockResolvedValueOnce([{ id: 1 }]);
    await expect(service.findAll()).resolves.toEqual([{ id: 1 }]);
    expect(createQueryRunner).toHaveBeenCalledWith('slave');
    expect(runner.manager.getRepository).toHaveBeenCalledWith(User);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the replica connection when the query fails', async () => {
    find.mockRejectedValueOnce(new Error('replica unavailable'));
    await expect(service.findAll()).rejects.toThrow('replica unavailable');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('keeps the registration lookup on the default primary repository', async () => {
    findOne.mockResolvedValueOnce(null);
    await service.findByEmail('test@example.com');
    expect(findOne).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      withDeleted: true,
    });
    expect(createQueryRunner).not.toHaveBeenCalled();
  });
});
