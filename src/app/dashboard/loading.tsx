export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900 animate-pulse" aria-busy="true" aria-label="로딩 중">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-1/4 max-w-[200px]" />
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded mb-2" />
              <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700">
          <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-1/3 max-w-xs mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
