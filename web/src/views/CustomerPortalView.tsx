import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import type { CustomerIdentity, CustomerOrder, SupportApi } from "../types";

interface CustomerPortalViewProps {
  client?: SupportApi;
  customer?: CustomerIdentity;
  onIdentified: (customer: CustomerIdentity) => void;
  onSignedOut: () => void;
  onRunCreated: (runId: string) => void;
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}

export function CustomerPortalView({
  client = api,
  customer,
  onIdentified,
  onSignedOut,
  onRunCreated,
}: CustomerPortalViewProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [message, setMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!customer) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    void client.listCustomerOrders(customer).then(
      (result) => {
        if (!cancelled) setOrders(result.orders);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your orders.");
      },
    );
    return () => { cancelled = true; };
  }, [client, customer]);

  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookupError("");
    setIdentifying(true);
    try {
      const { customer: matched } = await client.identifyCustomer({ name: name.trim(), email: email.trim() });
      if (!matched) {
        setLookupError("We could not find a customer with that name and email.");
        return;
      }
      onIdentified(matched);
    } catch (cause) {
      setLookupError(cause instanceof Error ? cause.message : "Unable to look up your account.");
    } finally {
      setIdentifying(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) {
      setError("Enter a support message.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const { run_id } = await client.createRun({
        message: message.trim(),
        customer,
        ...(orderNumber ? { order_number: orderNumber } : {}),
      });
      onRunCreated(run_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start your support request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page customer-page">
      <div className={`page-intro${customer ? " inline-intro" : ""}`}>
        <div>
          <p className="eyebrow">Customer portal</p>
          <h1>{customer ? "Your orders and support." : "Get support."}</h1>
          <p>{customer ? `Viewing orders for ${customer.name}.` : "Send a message anytime, or look up an order and its refund status."}</p>
        </div>
        {customer && <button className="secondary-button" type="button" onClick={onSignedOut}>Use a different customer</button>}
      </div>
      {!customer && <details className="order-lookup">
        <summary>Check your orders</summary>
        <p className="muted">Enter the name and email used for your order. This lookup is not sign-in or authentication.</p>
        <form className="message-form identity-form" onSubmit={identify}>
          <label htmlFor="customer-name">Name</label>
          <input id="customer-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
          <label htmlFor="customer-email">Email</label>
          <input id="customer-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          {lookupError && <p className="error" role="alert">{lookupError}</p>}
          <button type="submit" disabled={identifying}>{identifying ? "Finding your account..." : "Find my orders"}</button>
        </form>
      </details>}
      {customer && <section aria-labelledby="my-orders-heading" className="orders-section">
        <h2 id="my-orders-heading">My orders</h2>
        {orders.length === 0 ? <p className="empty-state">No orders found for this customer.</p> : <div className="order-list">{orders.map((order) => (
          <article className="order-card" key={order.order_number}>
            <div><strong>{order.order_number}</strong><span>{order.title}</span></div>
            <dl>
              <div><dt>Format</dt><dd>{order.media_format}</dd></div>
              <div><dt>Quantity</dt><dd>{order.quantity}</dd></div>
              <div><dt>Ordered</dt><dd>{displayDate(order.ordered_at)}</dd></div>
              <div><dt>Status</dt><dd>{order.status}</dd></div>
              <div><dt>Refund</dt><dd className={`refund-${order.refund_progress}`}>{order.refund_progress.replace("_", " ")}</dd></div>
            </dl>
          </article>
        ))}</div>}
      </section>}
      <section aria-labelledby="support-request-heading" className="support-request">
        <h2 id="support-request-heading">Send a support message</h2>
        <p className="support-hint">Ask about returns, region codes, shipping, preorders, damaged discs, order status, or refund status. For example: “Can I return an unopened disc?” or “Where is my order?”</p>
        {customer && <p className="muted">Choose an order so the copilot receives the right order number, or choose a general question.</p>}
        <form className="message-form" onSubmit={submit}>
          {customer && <><label htmlFor="support-order">What is this about?</label>
          <select id="support-order" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)}>
            <option value="">General question</option>
            {orders.map((order) => <option key={order.order_number} value={order.order_number}>{order.order_number} · {order.title}</option>)}
          </select></>}
          <label htmlFor="support-message">Message</label>
          <textarea id="support-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell us how we can help." rows={6} />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Starting request..." : "Start support request"}</button>
        </form>
      </section>
    </main>
  );
}
