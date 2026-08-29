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
