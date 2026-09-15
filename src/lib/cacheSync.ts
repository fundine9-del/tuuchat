import {
  chatCache,
  noteMessageCache,
  noteStatusCache,
  removeMessageCache,
  removeStatusCache,
  updateMessageCache,
} from './cache'
import { subscribe } from './socket'

/*
 * Keep the client cache coherent with realtime events. Wired once at startup;
 * the socket event bus dispatches to these regardless of when the socket
 * connects, so cached snapshots stay fresh without extra network calls.
 */
export function wireCacheSync() {
  const offs = [
    subscribe('message', (m) => void noteMessageCache(m)),
    subscribe('messageUpdated', (m) => void updateMessageCache(m)),
    subscribe('messageDeleted', (d) => void removeMessageCache(d.conversationId, d.messageId)),
    subscribe('conversations', () => void chatCache.invalidateConversationList()),
    subscribe('status', (s) => void noteStatusCache(s)),
    subscribe('statusDeleted', (d) => void removeStatusCache(d.statusId)),
  ]
  return () => offs.forEach((off) => off())
}