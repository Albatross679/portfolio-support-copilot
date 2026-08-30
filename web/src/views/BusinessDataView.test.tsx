import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { createMockApi } from "../api";
import { BusinessDataView } from "./BusinessDataView";

it("adds and edits a customer through the employee grid", async () => {
  const user = userEvent.setup();
  render(<BusinessDataView client={createMockApi()} />);

  expect(await screen.findByText("Maya Chen")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Name"), "Sam Rivera");
  await user.type(screen.getByLabelText("Email"), "sam@example.test");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Sam Rivera")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
  const name = screen.getByLabelText("Name");
  await user.clear(name);
  await user.type(name, "Sam R.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Sam R.")).toBeInTheDocument();
});
