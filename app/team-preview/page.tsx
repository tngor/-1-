import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { allowsTrial, trialCookie } from "./access";
import Preview from "./Preview";

async function enterTrial(form: FormData) {
  "use server";
  const code = form.get("code");
  if (typeof code !== "string" || !allowsTrial(code)) redirect("/team-preview?retry=1");
  (await cookies()).set(trialCookie, code.trim(), {
    path: "/team-preview", httpOnly: true, secure: true, sameSite: "strict", maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/team-preview?view=leader");
}

export default async function TeamPreviewPage({ searchParams }: {
  searchParams: Promise<{ retry?: string }>;
}) {
  if (process.env.NODE_ENV === "development" || allowsTrial((await cookies()).get(trialCookie)?.value)) {
    return <Preview />;
  }
  const { retry } = await searchParams;
  return <main className="min-h-screen bg-slate-50 px-4 py-16 text-slate-900">
    <form action={enterTrial} className="mx-auto max-w-md space-y-4 rounded-3xl bg-white p-7 shadow">
      <h1 className="text-xl font-black">내 팀 관리 · 개인 체험</h1>
      <p className="text-sm text-slate-600">수혁님에게 발급한 입장 코드를 입력해 주세요.</p>
      <label className="block font-bold" htmlFor="code">개인 입장 코드</label>
      <input id="code" type="password" name="code" maxLength={128} autoComplete="off" required className="w-full rounded-xl border border-slate-300 p-3"/>
      {retry === "1" && <p role="alert" className="text-sm text-red-600">코드를 다시 확인해 주세요.</p>}
      <button className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white">체험 화면 열기</button>
    </form>
  </main>;
}
