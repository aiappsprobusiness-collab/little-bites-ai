/**
 * Chat thread key: one thread per profile (member or family).
 * History is loaded/saved per threadKey.
 */

export type ThreadKeyParams = {
  userId: string | undefined;
  selectedMemberId: string | null;
};

/**
 * Returns a stable string key for the chat thread.
 * - member: "member:<member_id>"
 * - family: "family:<user_id>"
 */
export function getChatThreadKey(params: ThreadKeyParams): string {
  const { userId, selectedMemberId } = params;
  if (selectedMemberId && selectedMemberId !== "family") {
    return `member:${selectedMemberId}`;
  }
  return `family:${userId ?? ""}`;
}
