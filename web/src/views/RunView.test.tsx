import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import { RunView } from "./RunView";

it("shows the extraction, refund route, and approval proposal from the mock API", async () => {
  render(<RunView client={createMockApi()} runId="run_refund_2048" />);

  expect(await screen.findByText("The Seventh Seal")).toBeInTheDocument();
  expect(screen.getByText("refund", { selector: ".route" })).toBeInTheDocument();
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
    const getRun = vi.spyOn(client, "getRun").mockResolvedValue({ run_id: "run_terminal", status });

    render(<RunView client={client} runId="run_terminal" />);
    await act(async () => Promise.resolve());
    expect(getRun).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(getRun).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
