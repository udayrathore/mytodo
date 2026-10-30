/** Notifications remain paused until explicitly enabled for a later release. */
export function pushNotificationsEnabled() {
  return process.env.ENABLE_PUSH_NOTIFICATIONS === "true";
}
