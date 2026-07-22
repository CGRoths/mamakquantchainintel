/**
 * Canonical MQCHAIN category precedence.
 *
 * A governed registry/candidate override wins, followed by the approved
 * role's category. Free-text labels are never category inputs.
 */
export function effectiveCategoryId(
  categoryOverrideId: number | null | undefined,
  roleCategoryId: number | null | undefined,
) {
  return categoryOverrideId ?? roleCategoryId ?? null;
}
