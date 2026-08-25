import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import { LoginForm } from "@/components/client";

export default async function LoginPage() {
  if (await currentUserId()) redirect("/");
  return <LoginForm google={Boolean(process.env.GOOGLE_CLIENT_ID)} />;
}
