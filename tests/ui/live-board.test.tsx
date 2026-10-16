// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { LiveBoard } from "@/app/live-board";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows standings after a submitted solve and does not carry them into another contest", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ board: [{ userId: 1, rank: 1, name: "Demo student", points: 3, hardsSolved: 0 }] }) }));
  const { rerender } = render(<LiveBoard contestId={1} initial={[]} />);
  expect(screen.getByText("No solves yet")).toBeTruthy();
  act(() => window.dispatchEvent(new Event("contest:solve")));
  await waitFor(() => expect(screen.getByText("Demo student")).toBeTruthy());
  expect(screen.getByText("3.0")).toBeTruthy();
  rerender(<LiveBoard contestId={2} initial={[{ userId: 2, rank: 1, name: "Next contest student", points: 18, hardsSolved: 1 }]} />);
  expect(screen.queryByText("Demo student")).toBeNull();
  expect(screen.getByText("Next contest student")).toBeTruthy();
});

it("retains existing standings when a leaderboard request fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  const { rerender } = render(<LiveBoard contestId={1} initial={[{ userId: 1, rank: 1, name: "Existing student", points: 12, hardsSolved: 1 }]} />);
  act(() => window.dispatchEvent(new Event("contest:solve")));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Connection interrupted"));
  expect(screen.getByText("Existing student")).toBeTruthy();
  rerender(<LiveBoard contestId={2} initial={[]} />);
  expect(screen.queryByRole("status")).toBeNull();
});
