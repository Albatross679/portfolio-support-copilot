import { afterEach, expect, it, vi } from "vitest";
import { httpApi } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("uses the API-only proxy path during Vite development", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      run_id: "run-1",
      thread_id: "thread-1",
      status: "completed",
    }),
  });
  vi.stubGlobal("fetch", fetch);

  await httpApi.getRun("run-1");

  expect(fetch).toHaveBeenCalledWith("/api/runs/run-1", expect.any(Object));
});

it("shows the API detail for the daily run limit", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    text: () => Promise.resolve('{"detail":"Daily demo budget is used up, come back tomorrow."}'),
  }));

  await expect(httpApi.createRun({ message: "Where is my order?" })).rejects.toThrow(
    "Daily demo budget is used up, come back tomorrow.",
  );
});
