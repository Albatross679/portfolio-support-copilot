import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Customer, CustomerInput, Order, OrderInput, Product, ProductInput, SupportApi } from "../types";

type TableName = "customers" | "products" | "orders";
type Row = Customer | Product | Order;
type FormValues = Record<string, string>;

const definitions: Record<TableName, { title: string; fields: { name: string; label: string; type?: "number" | "datetime-local"; options?: string[] }[] }> = {
  customers: { title: "Customers", fields: [{ name: "name", label: "Name" }, { name: "email", label: "Email" }] },
  products: { title: "Products", fields: [{ name: "title", label: "Title" }, { name: "format", label: "Format", options: ["Blu-ray", "DVD", "4K UHD", "box set"] }, { name: "sku", label: "SKU" }, { name: "price_cents", label: "Price in cents", type: "number" }] },
  orders: { title: "Orders", fields: [{ name: "order_number", label: "Order number" }, { name: "customer_id", label: "Customer ID", type: "number" }, { name: "product_id", label: "Product ID", type: "number" }, { name: "quantity", label: "Quantity", type: "number" }, { name: "ordered_at", label: "Ordered at", type: "datetime-local" }, { name: "status", label: "Status" }, { name: "refund_status", label: "Refund status", options: ["none", "approved", "rejected"] }] },
};

function emptyValues(table: TableName): FormValues {
  return Object.fromEntries(definitions[table].fields.map((field) => [field.name, field.options?.[0] ?? ""]));
}

function valuesFor(row: Row): FormValues {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id").map(([key, value]) => [key, String(value).replace("Z", "").slice(0, 16)]));
}

interface BusinessDataViewProps { client?: SupportApi; }

export function BusinessDataView({ client = api }: BusinessDataViewProps) {
  const [table, setTable] = useState<TableName>("customers");
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row>();
  const [values, setValues] = useState<FormValues>(emptyValues("customers"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const definition = definitions[table];

  const load = useCallback(async () => {
    try {
      if (table === "customers") {
        setRows((await client.listCustomers()).customers);
      } else if (table === "products") {
        setRows((await client.listProducts()).products);
      } else {
        setRows((await client.listOrders()).orders);
      }
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load business data."); }
  }, [client, table]);

  useEffect(() => { setEditing(undefined); setValues(emptyValues(table)); void load(); }, [load, table]);

  function switchTable(next: TableName) { setTable(next); }
  function startAdd() { setEditing(undefined); setValues(emptyValues(table)); }
  function startEdit(row: Row) { setEditing(row); setValues(valuesFor(row)); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      if (table === "customers") {
        const payload: CustomerInput = { name: values.name, email: values.email };
        editing ? await client.updateCustomer(editing.id, payload) : await client.createCustomer(payload);
      } else if (table === "products") {
        const payload: ProductInput = { title: values.title, format: values.format as ProductInput["format"], sku: values.sku, price_cents: Number(values.price_cents) };
        editing ? await client.updateProduct(editing.id, payload) : await client.createProduct(payload);
      } else {
        const payload: OrderInput = { order_number: values.order_number, customer_id: Number(values.customer_id), product_id: Number(values.product_id), quantity: Number(values.quantity), ordered_at: new Date(values.ordered_at).toISOString(), status: values.status, refund_status: values.refund_status as OrderInput["refund_status"] };
        editing ? await client.updateOrder(editing.id, payload) : await client.createOrder(payload);
      }
      startAdd(); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this row."); }
    finally { setBusy(false); }
  }

  async function remove(row: Row) {
    setBusy(true);
    try {
      if (table === "customers") await client.deleteCustomer(row.id);
      else if (table === "products") await client.deleteProduct(row.id);
      else await client.deleteOrder(row.id);
      if (editing?.id === row.id) startAdd();
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete this row."); }
    finally { setBusy(false); }
  }

  return <main className="page">
    <div className="page-intro inline-intro"><div><p className="eyebrow">Employee console</p><h1>Business data.</h1><p>Edit demo customers, products, and orders. Concurrent edit conflict handling is future work.</p></div><button className="secondary-button" type="button" onClick={() => void load()}>Refresh table</button></div>
    <div className="tab-list" role="tablist" aria-label="Business tables">{(Object.keys(definitions) as TableName[]).map((name) => <button key={name} type="button" role="tab" aria-selected={table === name} className={table === name ? "selected-tab" : "secondary-button"} onClick={() => switchTable(name)}>{definitions[name].title}</button>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="data-layout"><section className="table-card"><h2>{definition.title}</h2><table><thead><tr><th>ID</th>{definition.fields.map((field) => <th key={field.name}>{field.label}</th>)}<th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.id}</td>{definition.fields.map((field) => <td key={field.name}>{String((row as unknown as Record<string, unknown>)[field.name])}</td>)}<td className="action-cell"><button className="link-button" type="button" onClick={() => startEdit(row)}>Edit</button><button className="link-button danger-text" type="button" onClick={() => void remove(row)} disabled={busy}>Delete</button></td></tr>)}</tbody></table>{rows.length === 0 && <p className="empty-state">No {table} found.</p>}</section>
    <form className="message-form edit-form" onSubmit={save}><h2>{editing ? `Edit ${table.slice(0, -1)}` : `Add ${table.slice(0, -1)}`}</h2>{definition.fields.map((field) => <label key={field.name} htmlFor={`${table}-${field.name}`}>{field.label}{field.options ? <select id={`${table}-${field.name}`} name={field.name} value={values[field.name] ?? ""} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input id={`${table}-${field.name}`} name={field.name} autoComplete={field.name === "email" ? "email" : field.name === "name" ? "name" : "off"} required type={field.type ?? "text"} value={values[field.name] ?? ""} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} />}</label>)}<div className="button-row"><button type="submit" disabled={busy}>{busy ? "Saving..." : "Save"}</button>{editing && <button className="secondary-button" type="button" onClick={startAdd}>Cancel</button>}</div></form></div>
  </main>;
}
