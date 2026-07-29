import { triggerLogoutBird, waitForCelebrationComplete } from '@/lib/oceanBirdFly';

export async function performLogoutWithCelebration(
  logoutAction: () => void | Promise<void>,
) {
  triggerLogoutBird();
  await waitForCelebrationComplete(2800);
  await logoutAction();
}
