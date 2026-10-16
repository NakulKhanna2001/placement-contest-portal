import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PageSkeleton } from "@/app/components/skeleton";

it.each(["arena", "account", "results", "admin"] as const)("provides a non-interactive, announced %s loading layout", variant => {
  const html = renderToStaticMarkup(createElement(PageSkeleton, { variant }));
  expect(html).toContain(`aria-label="Loading ${variant}"`);
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toMatch(/<(?:button|input|select|textarea|a)\b/);
});
