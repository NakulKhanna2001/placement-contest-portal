import { describe, expect, it } from "vitest";
import { isAllowedAccount } from "@/lib/auth-rules";

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
});
