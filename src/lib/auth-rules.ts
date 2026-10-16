export function isAllowedEmail(email: string | null | undefined, domain: string): boolean {
  return !!email && !!domain && /^[^@\s]+@[^@\s]+$/.test(email) && email.split("@")[1].toLowerCase() === domain.trim().toLowerCase();
}

export function isAllowedAccount(
  email: string | null | undefined,
  policy: { domain: string; allowedEmails: string },
): boolean {
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return false;
  const allowlist = policy.allowedEmails.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return isAllowedEmail(email, policy.domain) || allowlist.includes(email.toLowerCase());
}
