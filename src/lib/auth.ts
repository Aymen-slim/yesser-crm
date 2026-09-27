import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  role: "admin" | "member";
  full_name: string;
  active: boolean;
};

export function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export const requireUser = cache(async (): Promise<Profile> => {
  if (!supabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (authError || !userId) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Profile lookup failed:", error.code, error.message);
    const authProblem = /jwt|token|unauthorized/i.test(`${error.code} ${error.message}`);
    if (authProblem) redirect("/login");
    throw new Error("profile_failed");
  }

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/login?error=account_inactive");
  }

  return profile as Profile;
});

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "admin") redirect("/");
  return profile;
}
