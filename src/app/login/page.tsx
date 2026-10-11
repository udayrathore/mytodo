import { redirect } from "next/navigation";
import { configured, currentUser } from "@/lib/auth";
import { Login } from "@/components/login";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <Login configured={configured()} />;
}
