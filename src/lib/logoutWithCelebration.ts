import { triggerLogoutBird, waitForCelebrationComplete } from '@/lib/oceanBirdFly';
import { clearDashboardCache } from '@/lib/dashboardCache';

export async function performLogoutWithCelebration(
  logoutAction: () => void | Promise<void>,
) {
  triggerLogoutBird();
  // Drop cached dashboard payloads so the next account never sees this one's data.
  clearDashboardCache();
  await waitForCelebrationComplete(2800);
  await logoutAction();
}
