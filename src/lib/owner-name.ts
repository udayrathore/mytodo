// OWNER_NAME is authoritative for this single-owner application. Replace the old sample name.
export function ownerDisplayName(storedName?: string | null) {
  const configured = process.env.OWNER_NAME?.trim();
  const name = configured || storedName?.trim();
  return !name || name.toLowerCase() === "alex" || name === "Your name"
    ? "Uday"
    : name;
}
