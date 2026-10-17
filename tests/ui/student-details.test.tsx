// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { StudentDetailsForm } from "@/app/account/student-details";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("requires both choices and lets a verified member save without relinking LeetCode", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Student details saved." }) });
  vi.stubGlobal("fetch", fetcher);
  render(<StudentDetailsForm initialCampus={null} initialYear={null} />);
  const save = screen.getByRole("button", { name: "Save student details" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText("Campus"), "bengaluru");
  expect(save.disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText("Year of study"), "3");
  await user.click(save);
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0][0]).toBe("/api/profile");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ campus: "bengaluru", studyYear: 3 });
  expect(screen.getByRole("status").textContent).toContain("saved");
});

it("prefills saved choices and retains corrections if saving fails", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Try again shortly." }) }));
  render(<StudentDetailsForm initialCampus="sonepat" initialYear={1} />);
  expect((screen.getByLabelText("Campus") as HTMLSelectElement).value).toBe("sonepat");
  await user.selectOptions(screen.getByLabelText("Year of study"), "2");
  await user.click(screen.getByRole("button", { name: "Save student details" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Try again"));
  expect((screen.getByLabelText("Year of study") as HTMLSelectElement).value).toBe("2");
  expect(refresh).not.toHaveBeenCalled();
});
