import { createClient } from "npm:@supabase/supabase-js@2";

// CORS is required because this function is invoked directly from the GitHub Pages browser.\nconst cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Метод не поддерживается." }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Требуется авторизация.");

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Серверная конфигурация Supabase не настроена.");

    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? serviceKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) throw new Error("Не удалось подтвердить пользователя.");

    const { data: roleRow, error: roleError } = await caller
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError) throw roleError;
    if (roleRow?.role !== "developer") {
      return new Response(JSON.stringify({ error: "Только разработчик может создавать администраторов." }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !email.includes("@")) throw new Error("Введите корректный email.");
    if (password.length < 6) throw new Error("Пароль должен содержать минимум 6 символов.");

    const admin = createClient(url, serviceKey);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError) throw createError;

    const { error: roleInsertError } = await admin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "admin" });

    if (roleInsertError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw roleInsertError;
    }

    return new Response(JSON.stringify({
      ok: true,
      user: { id: created.user.id, email: created.user.email, role: "admin" }
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message ?? "Неизвестная ошибка." }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});