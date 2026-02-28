/**
 * Chat thread key: one thread per profile (member or family).
 * Used for loading/saving history; backend uses user_id + child_id (null = family).
 */

export type ThreadKeyParams = {
  userId: string;
  memberId: string | null | undefined;
  mode?: string;
};

/**
 * Returns a stable string key for the chat thread.
 * - member: "member:<member_id>"
 * - family: "family:<user_id>"
 */
export function getChatThreadKey(params: ThreadKeyParams): string {
  const { userId, memberId, mode } = params;
  if (mode === "family") return `family:${userId}`;
  if (memberId && typeof memberId === "string") return `member:${memberId}`;
  return `family:${userId}`;
}
