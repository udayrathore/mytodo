import { requirePageUser } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspace";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requirePageUser();
  return <Workspace initial={await getWorkspace(user)} />;
}
