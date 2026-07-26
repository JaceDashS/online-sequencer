import type { P2PMessage } from './types/p2p';

export const getP2PMessageIdentity = (message: P2PMessage): string => {
  if (typeof message.id === 'string' && message.id.length > 0) {
    return `message:${message.from}:${message.id}`;
  }

  return `legacy:${message.from}:${message.timestamp}:${message.type}`;
};
