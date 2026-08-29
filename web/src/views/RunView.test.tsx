import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import type { SupportRun } from "../types";
import { RunView } from "./RunView";

it("shows the extraction, refund route, and approval proposal from the mock API", async () => {
  render(<RunView client={createMockApi()} runId="run_refund_2048" />);

  expect(await screen.findByText("The Seventh Seal")).toBeInTheDocument();
  expect(screen.getByText("returns - refund", { selector: ".route" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Awaiting approval" })).toBeInTheDocument();
  expect(screen.getByText("$29.99")).toBeInTheDocument();
});

it("shows the final answer for a completed mock run", async () => {
  render(<RunView client={createMockApi()} runId="run_shipping_1082" />);

  expect(await screen.findByText(/expected to arrive on Thursday/)).toBeInTheDocument();
});

it.each(["completed", "failed"] as const)("stops polling after a %s run loads", async (status) => {
  vi.useFakeTimers();
  try {
    const client = createMockApi();
    const getRun = vi.spyOn(client, "getRun").mockResolvedValue({ run_id: "run_terminal", thread_id: "thread_terminal", status });

    render(<RunView client={client} runId="run_terminal" />);
    await act(async () => Promise.resolve());
    expect(getRun).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(getRun).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("ignores an earlier run request after navigation", async () => {
  vi.useFakeTimers();
  try {
    let finishEarlierRequest!: (run: SupportRun) => void;
    const earlierRequest = new Promise<SupportRun>((resolve) => {
      finishEarlierRequest = resolve;
    });
    const client = createMockApi();
    const getRun = vi.spyOn(client, "getRun").mockImplementation((runId) => runId === "run_earlier"
      ? earlierRequest
      : Promise.resolve({ run_id: "run_current", thread_id: "thread_current", status: "running" }));

    const { rerender } = render(<RunView client={client} runId="run_earlier" />);
    await act(async () => Promise.resolve());
    rerender(<RunView client={client} runId="run_current" />);
    await act(async () => Promise.resolve());
    expect(screen.getByText("run_current")).toBeInTheDocument();

    await act(async () => finishEarlierRequest({ run_id: "run_earlier", thread_id: "thread_earlier", status: "completed" }));
    expect(screen.getByText("run_current")).toBeInTheDocument();
    expect(screen.queryByText("run_earlier")).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(getRun).toHaveBeenCalledTimes(3);
    expect(getRun).toHaveBeenLastCalledWith("run_current");
  } finally {
    vi.useRealTimers();
  }
});
