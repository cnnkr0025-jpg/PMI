export default function ConfiguratorLoading() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900 animate-pulse" aria-busy="true" aria-label="로딩 중">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-1/3 max-w-xs" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded mb-4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded mb-2" />
              <div className="h-10 bg-gray-200 dark:bg-gray-600 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
