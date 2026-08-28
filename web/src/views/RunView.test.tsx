import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
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
