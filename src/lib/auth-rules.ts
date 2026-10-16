export function isAllowedEmail(email: string | null | undefined, domain: string): boolean {
  return !!email && !!domain && /^[^@\s]+@[^@\s]+$/.test(email) && email.split("@")[1].toLowerCase() === domain.trim().toLowerCase();
}

export interface AccessPolicy {
  domain: string;
  allowedEmails: string;
  allowAllGoogleAccounts?: boolean;
}

export function isAllowedAccount(
  email: string | null | undefined,
  policy: AccessPolicy,
): boolean {
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return false;
  if (policy.allowAllGoogleAccounts === true) return true;
  const allowlist = policy.allowedEmails.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return isAllowedEmail(email, policy.domain) || allowlist.includes(email.toLowerCase());
}

export function isAllowedGoogleProfile<T extends { email?: string | null; email_verified?: unknown }>(
  profile: T | null | undefined,
  policy: AccessPolicy,
): profile is T & { email: string; email_verified: true } {
  return profile?.email_verified === true && isAllowedAccount(profile.email, policy);
}

export function roleForEmail(email: string | null | undefined, adminEmails: string): "student" | "admin" {
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return "student";
  const admins = adminEmails.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase()) ? "admin" : "student";
}
