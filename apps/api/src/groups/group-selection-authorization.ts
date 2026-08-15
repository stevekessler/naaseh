export function assertAuthorizedGroupSelection(
  groupId: string | undefined,
  authorizedGroupIds: readonly string[],
) {
  if (groupId && !authorizedGroupIds.includes(groupId))
    throw Object.assign(new Error('The selected group is not available.'), { statusCode: 403 });
}
