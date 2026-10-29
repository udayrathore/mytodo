import type { CommandResult } from "@/lib/command-client";

export type Save = (
  command: Record<string, unknown>,
  onResult?: (result: CommandResult) => void,
) => Promise<boolean>;
