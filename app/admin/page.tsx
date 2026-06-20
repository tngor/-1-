export default function AdminHome() {
  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-lg">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">
          관리자 페이지
        </h1>

        <div className="space-y-4">
          <a
            href="/admin/create"
            className="block rounded-xl bg-blue-600 p-5 text-center text-xl font-semibold text-white"
          >
            일정 생성
          </a>

          <a
            href="/admin/results"
            className="block rounded-xl bg-green-600 p-5 text-center text-xl font-semibold text-white"
          >
            결과 확인
          </a>
        </div>
      </div>
    </main>
  );
}


