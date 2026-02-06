import type { HealthHandler } from '../types';

export const health: HealthHandler = async () => ({
  status: 'ok' as const,
  timestamp: new Date().toISOString(),
});
