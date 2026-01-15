import { CollaborationManager } from './CollaborationManager';

type ManagerListener = (manager: CollaborationManager | null) => void;

let currentManager: CollaborationManager | null = null;
const listeners = new Set<ManagerListener>();

export function setCollaborationManager(manager: CollaborationManager | null): void {
  currentManager = manager;
  listeners.forEach((listener) => listener(currentManager));
}

export function getCollaborationManager(): CollaborationManager | null {
  return currentManager;
}

export function subscribeCollaborationManager(listener: ManagerListener): () => void {
  listeners.add(listener);
  listener(currentManager);
  return () => {
    listeners.delete(listener);
  };
}
