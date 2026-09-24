export default function DashboardPageLoading() {
  return (
    <div
      className="w-full min-w-0 px-3 py-4 sm:px-6 sm:py-6 space-y-4"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="premium-dashboard-card h-28 animate-pulse rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="premium-dashboard-card h-24 animate-pulse rounded-2xl" />
        <div className="premium-dashboard-card h-24 animate-pulse rounded-2xl" />
      </div>
      <div className="premium-dashboard-card h-72 animate-pulse rounded-2xl" />
    </div>
  );
}
