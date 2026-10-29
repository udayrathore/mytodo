import { requirePageUser } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspace";
import { initialWorkspaceNavigation } from "@/lib/workspace-navigation";
import { dateKey } from "@/lib/domain";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, params] = await Promise.all([requirePageUser(), searchParams]);
  const navigation = initialWorkspaceNavigation(
    params,
    dateKey(new Date(), user.timezone),
  );
  return (
    <Workspace
      initial={await getWorkspace(user, navigation.query)}
      initialNavigation={navigation}
    />
  );
}
