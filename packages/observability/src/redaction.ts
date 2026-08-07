const protectedKey =
  /authorization|cookie|password|pin|secret|token|memo|notes?|label|title|duedate|snapshot|conflictvalue|localvalue|remotevalue|basevalue|resolvedvalue|googleaccount|providerbody|payload|before|after|ciphertext|keymaterial|uploadurl|signedurl|filename|checksum|query|filter|reportvalue|objectkey|stagingprefix|resultkey|capability|csvvalue|displayname|name$|urgency|rank|position|ordertoken|orderkey|filterbasis|urgencybreakdown|report.*total|(?:user|project|work|task|subtask|list)ids?$|affected.*count$/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        protectedKey.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  return value;
}
