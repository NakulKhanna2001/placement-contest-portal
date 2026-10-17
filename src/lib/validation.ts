import { z } from "zod";
import { campuses } from "./student-profile";
export const studentDetailsInput = z.object({
  campus: z.enum(campuses, { error: "Select your NST campus." }),
  studyYear: z.number({ error: "Select your year of study." }).int().min(1).max(4),
});
export const id = z.number().int().positive();
export const text = z.string().trim().min(1).max(2000);
export const proofUrl = z.url().max(2000).refine(v => ["https:", "http:"].includes(new URL(v).protocol), "Use an HTTP or HTTPS evidence URL");
export const problemInput = z.object({ difficulty: z.enum(["easy", "medium", "hard"]), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200), title: text.max(200) });
export const contestInput = z.object({
  title: text.max(200), startsAt: z.coerce.date(), status: z.enum(["draft", "scheduled"]).default("scheduled"),
  batches: z.array(z.array(problemInput).length(4).refine(list => list.filter(p => p.difficulty === "easy").length === 2 && list.filter(p => p.difficulty === "medium").length === 1 && list.filter(p => p.difficulty === "hard").length === 1, "Each batch needs 2 Easy, 1 Medium, 1 Hard")).min(1).max(12),
  graceSeconds: z.number().int().min(0).max(3600).optional(), bonusWindowSeconds: z.number().int().min(0).max(3600).optional(), bonusMultiplier: z.number().min(1).max(10).optional(),
}).refine(v => new Set(v.batches.flat().map(p => p.slug)).size === v.batches.flat().length, "Problems must be unique within a contest");
