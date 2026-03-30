export default function FeedbackLoading() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900 animate-pulse" aria-busy="true" aria-label="로딩 중">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-1/3 max-w-xs" />
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/4" />
              <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded" />
            </div>
          ))}
          <div className="h-10 bg-gray-200 dark:bg-gray-600 rounded w-1/3 mt-4" />
        </div>
      </div>
    </div>
  );
}
