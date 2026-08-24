export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Only the primary PM2 app (oceanlinux on :3000) runs background cleanup.
  const port = String(process.env.PORT || '3000');
  if (port !== '3000') return;

  const { startScheduledOrderCleanup } = await import('@/lib/scheduledOrderCleanup');
  startScheduledOrderCleanup();
}
