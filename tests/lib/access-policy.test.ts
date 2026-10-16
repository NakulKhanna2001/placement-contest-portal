import { describe, expect, it } from "vitest";
import { isAllowedAccount, isAllowedGoogleProfile, roleForEmail } from "@/lib/auth-rules";

describe("configured account access", () => {
  it("allows only the explicitly configured owner when no college domain is set", () => {
    const policy = { domain: "", allowedEmails: "Owner@gmail.com" };
    expect(isAllowedAccount("owner@gmail.com", policy)).toBe(true);
    expect(isAllowedAccount("someone@gmail.com", policy)).toBe(false);
    expect(isAllowedAccount("owner@gmail.com.evil.test", policy)).toBe(false);
    expect(isAllowedAccount(null, policy)).toBe(false);
    expect(isAllowedAccount("owner@@gmail.com", { domain: "", allowedEmails: "owner@@gmail.com" })).toBe(false);
  });
  it("supports a college domain plus explicit owner exceptions without opening other domains", () => {
    const policy = { domain: "college.edu", allowedEmails: " owner@gmail.com, other@example.org " };
    expect(isAllowedAccount("student@college.edu", policy)).toBe(true);
    expect(isAllowedAccount("owner@gmail.com", policy)).toBe(true);
    expect(isAllowedAccount("other@example.org", policy)).toBe(true);
    expect(isAllowedAccount("stranger@gmail.com", policy)).toBe(false);
    expect(isAllowedAccount("student@college.edu.evil.test", policy)).toBe(false);
  });
  it("fails closed when neither a college domain nor an exact email is configured", () => {
    expect(isAllowedAccount("owner@gmail.com", { domain: "", allowedEmails: "" })).toBe(false);
  });
  it("allows any valid Google email in explicit public mode, including Workspace domains", () => {
    const policy = { domain: "college.edu", allowedEmails: "owner@gmail.com", allowAllGoogleAccounts: true };
    expect(isAllowedAccount("newstudent@gmail.com", policy)).toBe(true);
    expect(isAllowedAccount("student@another-college.edu", policy)).toBe(true);
    expect(isAllowedAccount("person@company.example", policy)).toBe(true);
  });
  it("still rejects missing or malformed emails in public mode", () => {
    const policy = { domain: "", allowedEmails: "", allowAllGoogleAccounts: true };
    for (const email of [null, undefined, "", "not-an-email", "a@@gmail.com", "a@", "a b@gmail.com"]) expect(isAllowedAccount(email, policy)).toBe(false);
  });
  it("requires Google's verified-email claim even when access is public", () => {
    const policy = { domain: "", allowedEmails: "", allowAllGoogleAccounts: true };
    expect(isAllowedGoogleProfile({ email: "student@gmail.com", email_verified: true }, policy)).toBe(true);
    for (const verified of [false, undefined, "true", 1]) expect(isAllowedGoogleProfile({ email: "student@gmail.com", email_verified: verified }, policy)).toBe(false);
    expect(isAllowedGoogleProfile(null, policy)).toBe(false);
  });
  it("assigns student by default and supports multiple explicitly named admins", () => {
    const admins = " owner@gmail.com, Admin2@college.edu, third@example.org ";
    expect(roleForEmail("newstudent@gmail.com", admins)).toBe("student");
    expect(roleForEmail("OWNER@gmail.com", admins)).toBe("admin");
    expect(roleForEmail("admin2@college.edu", admins)).toBe("admin");
    expect(roleForEmail("third@example.org", admins)).toBe("admin");
  });
  it("never infers admin from a domain, lookalike address, or an empty list", () => {
    expect(roleForEmail("student@college.edu", "admin@college.edu")).toBe("student");
    expect(roleForEmail("owner@gmail.com.evil.test", "owner@gmail.com")).toBe("student");
    expect(roleForEmail("owner@gmail.com", "")).toBe("student");
    expect(roleForEmail(null, "")).toBe("student");
  });
});
