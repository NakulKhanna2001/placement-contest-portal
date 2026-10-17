// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { EditContest, ScheduleForm } from "@/app/admin/contest-editor";
import { GrantForm } from "@/app/admin/admin-forms";
import type { ContestEditorData } from "@/lib/contest-form";

const batch = (n: number) => [
  { difficulty: "easy" as const, slug: `easy-${n}-a`, title: `Easy ${n} A` },
  { difficulty: "easy" as const, slug: `easy-${n}-b`, title: `Easy ${n} B` },
  { difficulty: "medium" as const, slug: `medium-${n}`, title: `Medium ${n}` },
  { difficulty: "hard" as const, slug: `hard-${n}`, title: `Hard ${n}` },
];
const initial: ContestEditorData = {
  id: 7, revision: 3, title: "Saved contest", startsAt: "2030-10-19T10:00:00.000Z", status: "draft",
  graceSeconds: 900, bonusWindowSeconds: 300, bonusMultiplier: 2, batches: [batch(1), batch(2)],
};
beforeEach(() => { vi.stubEnv("TZ", "Asia/Kolkata"); refresh.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("opens with saved values and sends an update with the same ID/revision and correct time", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ contestId: 7, message: "Contest updated." }) });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<EditContest initial={initial} />);
  await user.click(screen.getByRole("button", { name: "Edit contest" }));
  expect((screen.getByLabelText("Contest title") as HTMLInputElement).value).toBe("Saved contest");
  const date = screen.getByLabelText("Starts at (IST)") as HTMLInputElement;
  expect(date.value).toBe("2030-10-19T15:30");
  expect(new Date(date.value).toISOString()).toBe(initial.startsAt);
  expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("draft");
  expect((screen.getByLabelText("Hourly batches") as HTMLInputElement).value).toBe("2");
  expect((screen.getByLabelText("Link grace (minutes)") as HTMLInputElement).value).toBe("15");
  await user.clear(screen.getByLabelText("Contest title"));
  await user.type(screen.getByLabelText("Contest title"), "Edited title");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe("/api/admin/contests");
  expect(JSON.parse(request.body)).toMatchObject({ action: "update", contestId: 7, revision: 3, contest: { title: "Edited title", startsAt: initial.startsAt, status: "draft", graceSeconds: 900, bonusWindowSeconds: 300, bonusMultiplier: 2, batches: initial.batches } });
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Contest updated."));
  expect(refresh).toHaveBeenCalledOnce();
});

it("still creates a new contest using the original create request shape", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ contestId: 8, message: "Contest created." }) });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const { container } = render(<ScheduleForm />);
  await user.type(screen.getByLabelText("Contest title"), "New contest");
  fireEvent.change(screen.getByLabelText("Starts at (IST)"), { target: { value: "2030-10-19T15:30" } });
  fireEvent.change(screen.getByLabelText("Hourly batches"), { target: { value: "1" } });
  for (let i = 0; i < 4; i++) {
    await user.type(container.querySelector(`[name="title-0-${i}"]`)!, `Problem ${i}`);
    await user.type(container.querySelector(`[name="slug-0-${i}"]`)!, `problem-${i}`);
  }
  await user.click(screen.getByRole("button", { name: "Save contest" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).not.toHaveProperty("action");
  expect(body).toMatchObject({ title: "New contest", startsAt: initial.startsAt, status: "scheduled", bonusWindowSeconds: 900, bonusMultiplier: 1.5, graceSeconds: 600 });
  expect(body.batches).toHaveLength(1);
  expect(body.batches[0].map((p: { difficulty: string }) => p.difficulty)).toEqual(["easy", "easy", "medium", "hard"]);
});

it("retains edited problem fields when temporarily reducing and restoring the batch count", async () => {
  const user = userEvent.setup();
  const { container } = render(<EditContest initial={initial} />);
  await user.click(screen.getByRole("button", { name: "Edit contest" }));
  const title = container.querySelector('[name="title-1-0"]') as HTMLInputElement;
  await user.clear(title); await user.type(title, "Keep this change");
  fireEvent.change(screen.getByLabelText("Hourly batches"), { target: { value: "1" } });
  expect(container.querySelector('[name="title-1-0"]')).toBeNull();
  fireEvent.change(screen.getByLabelText("Hourly batches"), { target: { value: "2" } });
  expect((container.querySelector('[name="title-1-0"]') as HTMLInputElement).value).toBe("Keep this change");
});

it("interprets an edited start as IST even when the browser is outside India", async () => {
  vi.stubEnv("TZ", "America/New_York");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Contest updated." }) });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<EditContest initial={initial} />);
  await user.click(screen.getByRole("button", { name: "Edit contest" }));
  expect((screen.getByLabelText("Starts at (IST)") as HTMLInputElement).value).toBe("2030-10-19T15:30");
  fireEvent.change(screen.getByLabelText("Starts at (IST)"), { target: { value: "2030-10-20T16:45" } });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(fetcher.mock.calls[0][1].body).contest.startsAt).toBe("2030-10-20T11:15:00.000Z");
});

it("interprets manual grant acceptance times as IST outside India", async () => {
  vi.stubEnv("TZ", "UTC");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Granted." }) });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<GrantForm students={[{ id: 1, label: "Student" }]} problems={[{ id: 2, label: "Two Sum" }]} />);
  await user.selectOptions(screen.getByLabelText("Students (select multiple for an outage)"), "1");
  fireEvent.change(screen.getByLabelText("Accepted at (IST)"), { target: { value: "2030-10-19T15:35" } });
  await user.type(screen.getByLabelText("Reason"), "Confirmed proof");
  await user.type(screen.getByLabelText("Evidence URL"), "https://example.com/proof");
  await user.click(screen.getByRole("button", { name: "Grant solve(s)" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(fetcher.mock.calls[0][1].body).acceptedAt).toBe("2030-10-19T10:05:00.000Z");
});

it.each([
  { zone: "Asia/Kolkata", startsAt: "2030-10-19T10:00:00.125Z" },
  { zone: "America/New_York", startsAt: "2030-11-03T06:30:00.000Z" },
])("preserves an unchanged start instant in $zone, including normalization edge cases", async ({ zone, startsAt }) => {
  vi.stubEnv("TZ", zone);
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Contest updated." }) });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<EditContest initial={{ ...initial, startsAt }} />);
  await user.click(screen.getByRole("button", { name: "Edit contest" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(fetcher.mock.calls[0][1].body).contest.startsAt).toBe(startsAt);
});

it("cancel discards only local edits without sending a request", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<EditContest initial={initial} />);
  await user.click(screen.getByRole("button", { name: "Edit contest" }));
  await user.clear(screen.getByLabelText("Contest title"));
  await user.type(screen.getByLabelText("Contest title"), "Unsaved title");
  await user.click(screen.getByRole("button", { name: "Cancel editing" }));
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Edit contest" }));
  expect((screen.getByLabelText("Contest title") as HTMLInputElement).value).toBe("Saved contest");
});

it("keeps the editor and input values when the server rejects an edit", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "This contest has started and can no longer be edited." }) }));
  const user = userEvent.setup();
  render(<EditContest initial={initial} />);
  await user.click(screen.getByRole("button", { name: "Edit contest" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("has started"));
  expect((screen.getByLabelText("Contest title") as HTMLInputElement).value).toBe("Saved contest");
  expect(refresh).not.toHaveBeenCalled();
});

it.each([false, true])("extracts pasted problem URLs and saves only slugs (editing: %s)", async editing => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Saved." }) });
  vi.stubGlobal("fetch", fetcher);
  const { container } = render(<ScheduleForm initial={editing ? initial : undefined} />);
  if (!editing) {
    await user.type(screen.getByLabelText("Contest title"), "URL contest");
    fireEvent.change(screen.getByLabelText("Starts at (IST)"), { target: { value: "2030-10-19T15:30" } });
    fireEvent.change(screen.getByLabelText("Hourly batches"), { target: { value: "1" } });
    for (let i = 0; i < 4; i++) {
      await user.type(container.querySelector(`[name="title-0-${i}"]`)!, `Problem ${i}`);
      await user.type(container.querySelector(`[name="slug-0-${i}"]`)!, `problem-${i}`);
    }
  }
  const input = screen.getAllByLabelText("LeetCode problem URL or slug")[0] as HTMLInputElement;
  await user.clear(input);
  await user.paste("https://leetcode.com/problems/two-sum/description/?envType=problem-list");
  expect(input.value).toBe("two-sum");
  await user.click(screen.getByRole("button", { name: editing ? "Save changes" : "Save contest" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect((editing ? body.contest : body).batches[0][0].slug).toBe("two-sum");
});

it("allows typing a full URL and submitting with Enter without a blur", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Saved." }) });
  vi.stubGlobal("fetch", fetcher);
  render(<ScheduleForm initial={initial} />);
  const input = screen.getAllByLabelText("LeetCode problem URL or slug")[0] as HTMLInputElement;
  await user.clear(input);
  await user.type(input, "https://leetcode.com/problems/two-sum/description/");
  expect(input.value).toBe("https://leetcode.com/problems/two-sum/description/");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(fetcher.mock.calls[0][1].body).contest.batches[0][0].slug).toBe("two-sum");
});

it("blocks unrelated URLs and clears validation when corrected", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Saved." }) });
  vi.stubGlobal("fetch", fetcher);
  render(<ScheduleForm initial={initial} />);
  const input = screen.getAllByLabelText("LeetCode problem URL or slug")[0] as HTMLInputElement;
  await user.clear(input);
  await user.paste("https://example.com/problems/two-sum/");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(input.validationMessage).toContain("LeetCode problem URL");
  await user.clear(input);
  await user.type(input, "https://leetcode.com/problems/two-sum/");
  await user.tab();
  expect(input.value).toBe("two-sum");
  expect(input.checkValidity()).toBe(true);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
});
