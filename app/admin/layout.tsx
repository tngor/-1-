import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { missionCookie } from "../../lib/mission-session";
import { supabase } from "../../lib/supabase";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(missionCookie)?.value;
  if (!token) redirect("/?admin=1");

  const { data, error } = await supabase.rpc("mission_overall", {
    token,
    operation: "adminAccess",
    payload: {},
  });
  if (data?.expired) redirect("/?admin=1");
  if (data?.admin === true && !error) return children;

  return <main className="mx-auto max-w-md p-8">
    <h1 className="text-xl font-bold">{error ? "관리자 권한을 확인하지 못했습니다." : "관리자 계정으로만 이용할 수 있습니다."}</h1>
    <a href="/" className="mt-4 inline-block text-blue-700 underline">사용자 화면으로 돌아가기</a>
  </main>;
}
