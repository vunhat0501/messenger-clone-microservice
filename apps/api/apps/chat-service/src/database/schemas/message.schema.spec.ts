import { messageSchema } from './message.schema';

describe('Message schema indexes', () => {
  it('only enforces uniqueness for messages that carry a clientMessageId', () => {
    const entry = messageSchema
      .indexes()
      .find(
        ([fields]) =>
          fields.conversationId === 1 && fields.clientMessageId === 1,
      );

    expect(entry).toBeDefined();
    const options = entry?.[1] ?? {};
    expect(options).toMatchObject({
      unique: true,
      partialFilterExpression: { clientMessageId: { $type: 'string' } },
    });
    expect(options).not.toHaveProperty('sparse');
  });
});
