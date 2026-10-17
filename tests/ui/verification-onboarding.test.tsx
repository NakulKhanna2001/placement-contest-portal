// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { VerificationWelcome } from "@/app/components/verification-welcome";
import { LinkForm } from "@/app/account/link-form";

const member = { id: 8, leetcodeVerified: false };
beforeEach(() => {
  sessionStorage.clear(); refresh.mockClear();
  // jsdom does not implement the native dialog API; browser checks cover its
  // real focus containment, Escape behavior, and responsive layout.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([null, { ...member, leetcodeVerified: true }])("does not interrupt anonymous or verified members (%j)", member => {
  render(<VerificationWelcome member={member} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("welcomes an unverified member with the screenshots, requirement, and Account destination", () => {
  render(<VerificationWelcome member={member} />);
  const dialog = screen.getByRole("dialog", { name: "Welcome to NST LC Grind" });
  expect(dialog.textContent).toContain("Verify your LeetCode profile to unlock contest access");
  expect(within(dialog).getAllByRole("img").map(img => img.getAttribute("src"))).toEqual([
    "/verification/edit-profile.webp", "/verification/profile-readme.webp", "/verification/save-readme.webp",
  ]);
  expect(within(dialog).getByRole("link", { name: "Start verification" }).getAttribute("href")).toBe("/account#leetcode-verification");
  expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "Welcome to NST LC Grind" }));
});

it.each(["close", "escape", "start"])("remembers %s dismissal for this member, but not a different member", async action => {
  const user = userEvent.setup();
  const view = render(<VerificationWelcome member={member} />);
  const dialog = screen.getByRole("dialog");
  if (action === "close") await user.click(screen.getByRole("button", { name: "Close welcome guide" }));
  if (action === "escape") fireEvent(dialog, new Event("cancel", { cancelable: true }));
  if (action === "start") {
    const link = screen.getByRole("link", { name: "Start verification" });
    link.addEventListener("click", event => event.preventDefault());
    await user.click(link);
  }
  expect(screen.queryByRole("dialog")).toBeNull();
  view.unmount();
  const next = render(<VerificationWelcome member={member} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  next.rerender(<VerificationWelcome member={{ ...member, id: 9 }} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("removes the popup when verification completes or the member signs out", () => {
  const view = render(<VerificationWelcome member={member} />);
  view.rerender(<VerificationWelcome member={{ ...member, leetcodeVerified: true }} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(<VerificationWelcome member={member} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
  view.rerender(<VerificationWelcome member={null} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("still opens and closes when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  render(<VerificationWelcome member={member} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Close welcome guide" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps the guide reopenable while generating, copying, and verifying a real form code", async () => {
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "contest-test-code" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ username: "student" }) });
  vi.stubGlobal("fetch", fetcher);
  render(<LinkForm initialToken={null} />);
  const guide = screen.getByText("How to verify — screenshot guide");
  await user.click(guide);
  expect(screen.getAllByRole("img")).toHaveLength(3);
  await user.click(guide);
  await user.click(screen.getByRole("button", { name: "Get verification code" }));
  expect(await screen.findByText("contest-test-code")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Copy code" }));
  expect(clipboard).toHaveBeenCalledWith("contest-test-code");
  await user.click(guide);
  expect(screen.getAllByRole("img")).toHaveLength(3);
  await user.type(screen.getByLabelText("LeetCode username"), "student");
  expect((screen.getByRole("button", { name: "Verify account" }) as HTMLButtonElement).disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText("Campus"), "sonepat");
  expect((screen.getByRole("button", { name: "Verify account" }) as HTMLButtonElement).disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText("Year of study"), "2");
  expect((screen.getByRole("button", { name: "Verify account" }) as HTMLButtonElement).disabled).toBe(false);
  await user.click(screen.getByRole("button", { name: "Verify account" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "confirm", username: "student", campus: "sonepat", studyYear: 2 });
});

it("retains the code and form with actionable feedback if copying or verification fails", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ reason: "token_missing" }) }));
  render(<LinkForm initialToken="contest-existing-code" />);
  await user.click(screen.getByRole("button", { name: "Copy code" }));
  expect(screen.getByRole("status").textContent).toContain("select and copy");
  await user.type(screen.getByLabelText("LeetCode username"), "student");
  await user.selectOptions(screen.getByLabelText("Campus"), "hyderabad");
  await user.selectOptions(screen.getByLabelText("Year of study"), "4");
  await user.click(screen.getByRole("button", { name: "Verify account" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("ReadMe"));
  expect(screen.getByText("contest-existing-code")).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Campus") as HTMLSelectElement).value).toBe("hyderabad");
  expect((screen.getByLabelText("Year of study") as HTMLSelectElement).value).toBe("4");
});

it("keeps verification disabled until all three required fields are filled", async () => {
  const user = userEvent.setup();
  render(<LinkForm initialToken="contest-code" />);
  const verify = screen.getByRole("button", { name: "Verify account" }) as HTMLButtonElement;
  expect(verify.disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText("Campus"), "pune");
  await user.selectOptions(screen.getByLabelText("Year of study"), "1");
  expect(verify.disabled).toBe(true);
  await user.type(screen.getByLabelText("LeetCode username"), "   ");
  expect(verify.disabled).toBe(true);
  await user.type(screen.getByLabelText("LeetCode username"), "student");
  expect(verify.disabled).toBe(false);
  await user.selectOptions(screen.getByLabelText("Campus"), "");
  expect(verify.disabled).toBe(true);
});
