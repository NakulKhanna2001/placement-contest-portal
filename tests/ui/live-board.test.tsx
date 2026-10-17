// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveBoard, BoardTable } from "@/app/live-board";
const at = (minutes: number) => new Date(+new Date("2026-10-17T10:00:00Z") + minutes * 60000);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows standings after a submitted solve and does not carry them into another contest", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ board: [{ userId: 1, rank: 1, name: "Demo student", points: 3, hardsSolved: 0, campus: "sonepat", studyYear: 1 }] }) }));
  const { rerender } = render(<LiveBoard contestId={1} initial={[]} />);
  expect(screen.getByText("No solves yet")).toBeTruthy();
  act(() => window.dispatchEvent(new Event("contest:solve")));
  await waitFor(() => expect(screen.getByText("Demo student")).toBeTruthy());
  expect(screen.getByText("3.0")).toBeTruthy();
  rerender(<LiveBoard contestId={2} initial={[{ userId: 2, rank: 1, name: "Next contest student", points: 18, hardsSolved: 1, campus: null, studyYear: null }]} />);
  expect(screen.queryByText("Demo student")).toBeNull();
  expect(screen.getByText("Next contest student")).toBeTruthy();
});

it("retains existing standings when a leaderboard request fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  const { rerender } = render(<LiveBoard contestId={1} initial={[{ userId: 1, rank: 1, name: "Existing student", points: 12, hardsSolved: 1, campus: null, studyYear: null }]} />);
  act(() => window.dispatchEvent(new Event("contest:solve")));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Connection interrupted"));
  expect(screen.getByText("Existing student")).toBeTruthy();
  rerender(<LiveBoard contestId={2} initial={[]} />);
  expect(screen.queryByRole("status")).toBeNull();
});

const rows = [
  { userId: 1, rank: 1, name: "Asha", points: 18, hardsSolved: 1, campus: "sonepat" as const, studyYear: 1 },
  { userId: 2, rank: 2, name: "Bo", points: 12, hardsSolved: 1, campus: "pune" as const, studyYear: 2 },
  { userId: 3, rank: 3, name: "Chen", points: 5, hardsSolved: 0, campus: "pune" as const, studyYear: 3 },
  { userId: 4, rank: 4, name: "Legacy", points: 2, hardsSolved: 0, campus: null, studyYear: null },
];

it("shows campus/year and filters final standings with ranks relative to the selected group", async () => {
  const user = userEvent.setup();
  render(<BoardTable rows={rows} />);
  expect(screen.getByText("Sonepat · 1st year")).toBeTruthy();
  expect(screen.getByText("Campus/year not set")).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Filter by campus"), "pune");
  expect(screen.queryByText("Asha")).toBeNull();
  expect(screen.queryByText("Legacy")).toBeNull();
  expect(screen.getByText("Overall #2")).toBeTruthy();
  let row = screen.getByText("Bo").closest("tr")!;
  expect(within(row).getAllByRole("cell")[0].textContent).toBe("1Overall #2");
  await user.selectOptions(screen.getByLabelText("Filter by year"), "3");
  expect(screen.queryByText("Bo")).toBeNull();
  row = screen.getByText("Chen").closest("tr")!;
  expect(within(row).getAllByRole("cell")[0].textContent).toBe("1Overall #3");
  await user.selectOptions(screen.getByLabelText("Filter by campus"), "hyderabad");
  expect(screen.getByText("No matching students")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText("Legacy")).toBeTruthy();
  expect(screen.queryByText("Overall #2")).toBeNull();
});

it("keeps filters during live updates and resets them when changing contests", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ board: rows.map(row => row.userId === 2 ? { ...row, points: 13.5 } : row) }) }));
  const view = render(<LiveBoard contestId={1} initial={rows} />);
  await user.selectOptions(screen.getByLabelText("Filter by campus"), "pune");
  await user.selectOptions(screen.getByLabelText("Filter by year"), "2");
  act(() => window.dispatchEvent(new Event("contest:solve")));
  await waitFor(() => expect(screen.getByText("13.5")).toBeTruthy());
  expect(screen.queryByText("Asha")).toBeNull();
  expect((screen.getByLabelText("Filter by year") as HTMLSelectElement).value).toBe("2");
  view.rerender(<LiveBoard contestId={2} initial={rows} />);
  expect((screen.getByLabelText("Filter by campus") as HTMLSelectElement).value).toBe("");
  expect(screen.getByText("Asha")).toBeTruthy();
});

it("shows per-problem points, IST acceptance times and elapsed time, and updates detail cells", async () => {
  const problems = [
    { id: 1, label: "B1.A", batchPosition: 0, problem: { title: "Easy A", slug: "easy-1-a", difficulty: "easy" as const, points: 2 } },
    { id: 2, label: "B2.A", batchPosition: 1, problem: null },
  ];
  const solve = { problemId: 1, points: 3, multiplier: 1.5, acceptedAt: at(10).toISOString(), verifiedAt: at(30).toISOString(), source: "auto" as const };
  const initial = [{ ...rows[0], points: 3, solves: [solve] }];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ board: [{ ...initial[0], points: 6, solves: [solve, { ...solve, problemId: 2, acceptedAt: at(20).toISOString() }] }], problems }) }));
  render(<LiveBoard contestId={1} initial={initial} details={{ problems, startsAt: at(0).toISOString() }} />);
  expect(screen.getByRole("link", { name: /B1.A.*Easy A/ }).getAttribute("href")).toBe("https://leetcode.com/problems/easy-1-a/");
  expect(screen.getByText("Locked")).toBeTruthy();
  expect(screen.getByText("+00:10:00")).toBeTruthy();
  expect(screen.getByText("3:40:00 PM IST")).toBeTruthy();
  expect(screen.getByText("1.5×")).toBeTruthy();
  act(() => window.dispatchEvent(new Event("contest:solve")));
  await waitFor(() => expect(screen.getByText("+00:20:00")).toBeTruthy());
  expect(fetch).toHaveBeenCalledWith("/api/leaderboard?contestId=1&details=1", expect.anything());
});
