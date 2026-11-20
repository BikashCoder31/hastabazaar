import test from 'node:test';
import { createIncentiveDb } from './helpers/incentive-db';
import { healthNotificationJourney } from './helpers/service-health-notification-journey';
import {
  installHealthNoticeRouteFixture,
  actualHealthBellRead,
} from './helpers/service-health-route-fixture';
installHealthNoticeRouteFixture();
void test('native D1 common health outage and functional recovery retain shared bell state and suppress stale mail', async () => {
  const f = await createIncentiveDb();
  globalThis.healthNoticeDb = f.db;
  try {
    await healthNotificationJourney(f.db, actualHealthBellRead);
  } finally {
    await f.dispose();
  }
});
