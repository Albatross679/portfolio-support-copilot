import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createMockApi } from "../api";
import type { CustomerListResponse, ProductListResponse } from "../types";
import { BusinessDataView } from "./BusinessDataView";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

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

it("ignores a table response after another table is selected", async () => {
  const user = userEvent.setup();
  const client = createMockApi();
  const customers = deferred<CustomerListResponse>();
  const products = deferred<ProductListResponse>();
  client.listCustomers = vi.fn(() => customers.promise);
  client.listProducts = vi.fn(() => products.promise);

  render(<BusinessDataView client={client} />);
  await user.click(screen.getByRole("tab", { name: "Products" }));
  await waitFor(() => expect(client.listProducts).toHaveBeenCalled());

  await act(async () => products.resolve({ products: [{ id: 12, title: "Current product", format: "DVD", sku: "CURRENT", price_cents: 999 }] }));
  expect(await screen.findByText("Current product")).toBeInTheDocument();

  await act(async () => customers.resolve({ customers: [{ id: 34, name: "Late customer", email: "late@example.test" }] }));
  expect(screen.queryByText("Late customer")).not.toBeInTheDocument();
  expect(screen.getByText("Current product")).toBeInTheDocument();
});

it("keeps rows when the selected table is clicked again", async () => {
  const user = userEvent.setup();
  render(<BusinessDataView client={createMockApi()} />);

  expect(await screen.findByText("Maya Chen")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Customers" }));

  expect(screen.getByText("Maya Chen")).toBeInTheDocument();
});

it("shows an order timestamp in the employee's local time", async () => {
  const user = userEvent.setup();
  render(<BusinessDataView client={createMockApi()} />);

  await user.click(screen.getByRole("tab", { name: "Orders" }));
  expect(await screen.findByText("ORD-1001")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit" }));

  const instant = new Date("2025-01-01T12:00:00Z");
  const pad = (part: number) => String(part).padStart(2, "0");
  const expected = `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
  expect(screen.getByLabelText("Ordered at")).toHaveValue(expected);
});

it("preserves the stored order timestamp when another field changes", async () => {
  const user = userEvent.setup();
  const client = createMockApi();
  const orderedAt = "2025-01-01T12:34:56.789123Z";
  client.listOrders = vi.fn(async () => ({ orders: [{ id: 1, order_number: "ORD-1001", customer_id: 1, product_id: 1, quantity: 1, ordered_at: orderedAt, status: "delivered", refund_status: "none" as const }] }));
  const updateOrder = vi.spyOn(client, "updateOrder");
  render(<BusinessDataView client={client} />);

  await user.click(screen.getByRole("tab", { name: "Orders" }));
  expect(await screen.findByText("ORD-1001")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.clear(screen.getByLabelText("Status"));
  await user.type(screen.getByLabelText("Status"), "shipped");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(updateOrder).toHaveBeenCalled());
  expect(updateOrder.mock.calls[0][1].ordered_at).toBe(orderedAt);
});
