import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

const cookieName = "mission_member_session";
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {"Cache-Control":"private, no-store"}});

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== `${request.nextUrl.protocol}//${request.headers.get("host")}`) return reply({error:"요청 주소를 확인해 주세요."},403);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({error:"잘못된 형식입니다."},415);
  try {
    const input = await request.json();
    if (input.operation === "login") {
      const {data,error} = await supabase.rpc("mission_login", {
        g:input.generation, n:input.name, p:input.pin, signup:input.signup === true,
      });
      if (error) return reply({error:"로그인 정보를 확인할 수 없습니다."},503);
      if (!data?.session) return reply(data,data?.missing ? 200 : 401);
      const response = reply({ok:true});
      response.cookies.set(cookieName,data.session,{httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV==="production",path:"/api/ministry",maxAge:14*86400});
      return response;
    }
    const token=request.cookies.get(cookieName)?.value ?? "";
    if (input.operation === "schedule") {
      if (!token) return reply({expired: true}, 401);
      const allowed = ["read", "create", "editCandidates", "vote", "confirm", "editNotice", "rsvp", "close", "reopen", "cancel", "archive"];
      if (!allowed.includes(input.action)) return reply({error: "지원하지 않는 작업입니다."}, 400);
      const {data, error} = await supabase.rpc("mission_schedule", {
        token, operation: input.action, payload: input.payload ?? {}, admin_view: input.adminView === true,
      });
      if (error) {
        if (error.code === "PGRST202") return reply({error: "사역 일정 SQL을 먼저 적용해 주세요."}, 503);
        return reply({error: error.code === "P0001" ? error.message : "일정 입력값이나 연결 상태를 확인해 주세요."}, 400);
      }
      return reply(data, data?.expired ? 401 : 200);
    }
    const {data,error}=await supabase.rpc("mission_action",{token,operation:input.operation,payload:input.payload ?? {}});
    if (error) return reply({error:error.code==="P0001"?error.message:"일정을 저장할 수 없습니다. 다시 확인해 주세요."},400);
    if (input.operation==="logout" || data?.expired) {
      const response=reply(data,data?.expired?401:200);
      response.cookies.set(cookieName,"",{path:"/api/ministry",maxAge:0});
      return response;
    }
    return reply(data);
  } catch { return reply({error:"요청을 처리할 수 없습니다."},400); }
}
