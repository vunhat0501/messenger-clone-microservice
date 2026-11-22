import {
  installRmqRejectionGuard,
  isBrokerConnectionLoss,
} from './rmq-rejection-guard';

describe('rmq rejection guard', () => {
  it('recognises broker connection loss errors', () => {
    expect(isBrokerConnectionLoss(new Error('channel closed'))).toBe(true);
    expect(isBrokerConnectionLoss(new Error('Heartbeat timeout'))).toBe(true);
    expect(
      isBrokerConnectionLoss(new Error('Socket closed unexpectedly')),
    ).toBe(true);
    expect(isBrokerConnectionLoss(new Error('validation failed'))).toBe(false);
  });

  it('swallows broker loss rejections but still exits on anything else', () => {
    const exit = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const before = process.listeners('unhandledRejection');
    installRmqRejectionGuard();
    const added = process
      .listeners('unhandledRejection')
      .filter((l) => !before.includes(l))[0] as (reason: unknown) => void;

    added(new Error('channel closed'));
    expect(exit).not.toHaveBeenCalled();

    added(new Error('something else'));
    expect(exit).toHaveBeenCalledWith(1);

    process.removeListener('unhandledRejection', added);
    exit.mockRestore();
  });
});
