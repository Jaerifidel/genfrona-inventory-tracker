"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Item = {
  id: number;
  code: string;
  name: string;
  brand: string;
  category: string;
  color: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  createdAt: string;
};
type Activity = {
  id: number;
  itemCode: string;
  itemName: string;
  type: string;
  change: number;
  balance: number;
  createdAt: string;
};
type Sale = {
  id: number;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  createdAt: string;
};
type AppUser = {
  id: number;
  email: string;
  role: string;
  status: string;
  invitedBy: string;
  createdAt: string;
};
type AuditEntry = {
  id: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityCode: string | null;
  description: string;
  source: string;
  createdAt: string;
};
type FormState = {
  name: string;
  brand: string;
  category: string;
  color: string;
  quantity: string;
  costPrice: string;
  sellingPrice: string;
  reorderLevel: string;
};
const emptyForm: FormState = {
  name: "",
  brand: "",
  category: "Budget",
  color: "",
  quantity: "1",
  costPrice: "",
  sellingPrice: "",
  reorderLevel: "3",
};
const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [view, setView] = useState("Inventory");
  const [sales, setSales] = useState<Sale[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [period, setPeriod] = useState("30");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [showStockHealth, setShowStockHealth] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [movement, setMovement] = useState<{
    item: Item;
    type: "sale" | "stock";
  } | null>(null);
  const [movementQty, setMovementQty] = useState("1");
  const [movementSaving, setMovementSaving] = useState(false);
  const [movementError, setMovementError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const [r, a, s, m] = await Promise.all([
        fetch("/api/inventory"),
        fetch("/api/activity"),
        fetch("/api/sales"),
        fetch("/api/me"),
      ]);
      setItems((await r.json()).items || []);
      setActivities((await a.json()).activities || []);
      setSales((await s.json()).sales || []);
      setCurrentRole((await m.json()).role || "");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const loadUsers = useCallback(async () => {
    const r = await fetch("/api/users");
    if (r.ok) setUsers((await r.json()).users || []);
  }, []);
  const loadAudit = useCallback(async () => {
    const r = await fetch("/api/audit");
    if (r.ok) setAuditEntries((await r.json()).entries || []);
  }, []);
  useEffect(() => {
    if (view === "Users") loadUsers();
    if (view === "Audit Trail") loadAudit();
  }, [view, loadUsers, loadAudit]);
  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (filter === "All" || i.category === filter) &&
          `${i.code} ${i.name} ${i.brand} ${i.color}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [items, query, filter],
  );
  const inventoryPageSize = 10;
  const inventoryPageCount = Math.max(
    1,
    Math.ceil(filtered.length / inventoryPageSize),
  );
  const paginatedItems = filtered.slice(
    (inventoryPage - 1) * inventoryPageSize,
    inventoryPage * inventoryPageSize,
  );
  const lowStockItems = useMemo(
    () => items.filter((item) => item.quantity <= item.reorderLevel),
    [items],
  );
  const selectedBrandItems = useMemo(
    () => items.filter((item) => item.brand === selectedBrand),
    [items, selectedBrand],
  );
  useEffect(() => {
    setInventoryPage((page) => Math.min(page, inventoryPageCount));
  }, [inventoryPageCount]);
  const stats = useMemo(
    () => ({
      units: items.reduce((s, i) => s + i.quantity, 0),
      value: items.reduce((s, i) => s + i.quantity * i.sellingPrice, 0),
      low: items.filter((i) => i.quantity <= i.reorderLevel).length,
      brands: new Set(items.map((i) => i.brand)).size,
    }),
    [items],
  );
  const reportSales = useMemo(
    () =>
      sales.filter((s) => {
        const d = new Date(s.createdAt);
        if (period === "custom") {
          if (fromDate && d < new Date(fromDate + "T00:00:00")) return false;
          if (toDate && d > new Date(toDate + "T23:59:59")) return false;
          return true;
        }
        if (period === "all") return true;
        return d >= new Date(Date.now() - Number(period) * 86400000);
      }),
    [sales, period, fromDate, toDate],
  );
  const salesTotal = reportSales.reduce((sum, s) => sum + s.totalAmount, 0),
    unitsSold = reportSales.reduce((sum, s) => sum + s.quantity, 0);
  async function syncDrive(showNotice = true, direction = "push") {
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    const data = await r.json();
    if (showNotice)
      setNotice(
        r.ok
          ? `Google Sheet synchronized successfully${data.pulled ? ` · ${data.pulled} change${data.pulled === 1 ? "" : "s"} imported` : ""}`
          : data.error || "Google Sheet synchronization failed",
      );
    return r.ok;
  }
  async function inviteUser(e: FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await r.json();
    if (!r.ok) {
      setNotice(data.error || "Could not invite user");
      return;
    }
    setInviteEmail("");
    setNotice(`${inviteEmail} has been granted ${inviteRole} access`);
    await loadUsers();
  }
  async function updateUser(user: AppUser, changes: Partial<AppUser>) {
    const r = await fetch("/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: user.id,
        role: changes.role || user.role,
        status: changes.status || user.status,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      setNotice(data.error || "Could not update user");
      return;
    }
    setNotice(`${user.email} updated`);
    await loadUsers();
  }
  async function addItem(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await fetch("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        quantity: +form.quantity,
        costPrice: +form.costPrice,
        sellingPrice: +form.sellingPrice,
        reorderLevel: +form.reorderLevel,
      }),
    });
    const data = await r.json();
    setSaving(false);
    if (!r.ok) {
      setNotice(data.error || "Could not add item");
      return;
    }
    setModal(false);
    setForm(emptyForm);
    setNotice(`${data.item.code} added to inventory`);
    await load();
    await syncDrive(false);
  }
  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const r = await fetch(`/api/inventory/${editing.id}/edit`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        quantity: +form.quantity,
        costPrice: +form.costPrice,
        sellingPrice: +form.sellingPrice,
        reorderLevel: +form.reorderLevel,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      setNotice("Could not update product");
      return;
    }
    setModal(false);
    setEditing(null);
    setForm(emptyForm);
    setNotice(`${editing.code} updated successfully`);
    await load();
    await syncDrive(false);
  }
  function beginEdit(item: Item) {
    setEditing(item);
    setForm({
      name: item.name,
      brand: item.brand,
      category: item.category,
      color: item.color,
      quantity: String(item.quantity),
      costPrice: String(item.costPrice),
      sellingPrice: String(item.sellingPrice),
      reorderLevel: String(item.reorderLevel),
    });
    setModal(true);
  }
  async function exportExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        items.map((i) => ({
          Code: i.code,
          Style: i.name,
          Brand: i.brand,
          Category: i.category,
          Colour: i.color,
          Quantity: i.quantity,
          "Cost Price": i.costPrice,
          "Selling Price": i.sellingPrice,
          "Reorder Level": i.reorderLevel,
        })),
      ),
      "Inventory",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        sales.map((s) => ({
          Date: new Date(s.createdAt).toLocaleString(),
          Code: s.itemCode,
          Product: s.itemName,
          Quantity: s.quantity,
          "Unit Price": s.unitPrice,
          "Total Sale": s.totalAmount,
        })),
      ),
      "Sales",
    );
    XLSX.writeFile(
      wb,
      `Genfrona_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }
  async function importExcel(file: File) {
    const XLSX = await import("xlsx");
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[wb.SheetNames[0]],
    );
    let added = 0;
    for (const x of rows) {
      const body = {
        name: x.Style || x.Name || x.Product,
        brand: x.Brand,
        category: x.Category || "Budget",
        color: x.Colour || x.Color || "",
        quantity: Number(x.Quantity) || 0,
        costPrice: Number(x["Cost Price"] || x.CostPrice) || 0,
        sellingPrice:
          Number(x["Selling Price"] || x.SellingPrice || x.Price) || 0,
        reorderLevel: Number(x["Reorder Level"] || x.ReorderLevel) || 3,
      };
      if (body.name && body.brand && body.sellingPrice) {
        const r = await fetch("/api/inventory", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (r.ok) added++;
      }
    }
    setNotice(`${added} product${added === 1 ? "" : "s"} imported from Excel`);
    await load();
    await syncDrive(false);
  }
  function beginMovement(item: Item, type: "sale" | "stock") {
    setMovement({ item, type });
    setMovementQty("1");
    setMovementError("");
  }
  async function saveMovement(event: FormEvent) {
    event.preventDefault();
    if (!movement) return;
    const quantity = Number(movementQty);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setMovementError("Enter a whole number of at least 1.");
      return;
    }
    if (movement.type === "sale" && quantity > movement.item.quantity) {
      setMovementError(
        `Only ${movement.item.quantity} unit${movement.item.quantity === 1 ? " is" : "s are"} available.`,
      );
      return;
    }
    setMovementSaving(true);
    setMovementError("");
    const response = await fetch(`/api/inventory/${movement.item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        delta: movement.type === "sale" ? -quantity : quantity,
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMovementError(result.error || "Could not save this stock activity.");
      setMovementSaving(false);
      return;
    }
    setNotice(
      movement.type === "sale"
        ? `Recorded sale of ${quantity} ${quantity === 1 ? "unit" : "units"} for ${movement.item.code}`
        : `Added ${quantity} ${quantity === 1 ? "unit" : "units"} to ${movement.item.code}`,
    );
    setMovement(null);
    setMovementSaving(false);
    await load();
    await syncDrive(false);
  }
  return (
    <main>
      <aside className="sidebar">
        <div className="logo">
          <span>G</span>
          <div>
            GENFRONA<small>Eyewear inventory</small>
          </div>
        </div>
        <nav>
          {[
            ["▦", "Inventory"],
            ["↕", "Stock Activity"],
            ["◫", "Brands"],
            ["⌁", "Reports"],
            ...(currentRole === "admin"
              ? [
                  ["◎", "Audit Trail"],
                  ["♙", "Users"],
                ]
              : []),
          ].map(([icon, label]) => (
            <button
              key={label}
              className={view === label ? "active" : ""}
              onClick={() => setView(label)}
            >
              {icon} <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-help">
          <b>Need a quick count?</b>
          <p>
            Use the quantity controls to record a sale or restock instantly.
          </p>
        </div>
        <div className="user">
          <div>{currentRole === "admin" ? "AD" : "ST"}</div>
          <p>
            Signed in
            <small>
              {currentRole === "admin" ? "Store administrator" : "Store staff"}
            </small>
          </p>
          <a href="/signout-with-chatgpt?return_to=/" title="Sign out">
            ↪
          </a>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">GENFRONA · STORE OVERVIEW</p>
            <h1>{view}</h1>
            <p className="sub">
              {view === "Inventory"
                ? "Know what is available, what is selling and what needs restocking."
                : view === "Stock Activity"
                  ? "A chronological record of every sale, restock and new item."
                  : view === "Brands"
                    ? "Your inventory grouped by eyewear brand."
                    : view === "Audit Trail"
                      ? "A permanent record of who performed every sensitive action."
                      : view === "Users"
                        ? "Invite staff and control administrator access."
                        : "Inventory value, stock health and category performance."}
            </p>
          </div>
          {view === "Inventory" && (
            <div className="header-actions">
              <label className="file-button">
                ⇧ Import Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importExcel(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button className="secondary" onClick={exportExcel}>
                ⇩ Export Excel
              </button>
              <button
                className="drive-button"
                onClick={() => syncDrive(true, "both")}
              >
                ↻ Two-way Sheet Sync
              </button>
              <button
                className="primary"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                  setModal(true);
                }}
              >
                ＋ Add eyewear
              </button>
            </div>
          )}
        </header>
        {notice && (
          <div className="notice">
            ✓ {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        <div className="stats">
          <article>
            <span className="stat-icon blue">▦</span>
            <p>
              Total units<b>{stats.units}</b>
              <small>Across {items.length} styles</small>
            </p>
          </article>
          <article>
            <span className="stat-icon gold">₦</span>
            <p>
              Retail value<b>{money.format(stats.value)}</b>
              <small>Current stock value</small>
            </p>
          </article>
          <article>
            <span className="stat-icon red">!</span>
            <p>
              Low stock<b>{stats.low}</b>
              <small>
                {stats.low
                  ? "Needs your attention"
                  : "Stock levels are healthy"}
              </small>
            </p>
          </article>
          <article>
            <span className="stat-icon green">◫</span>
            <p>
              Brands<b>{stats.brands}</b>
              <small>In your catalogue</small>
            </p>
          </article>
        </div>
        {view === "Inventory" && (
          <section className="panel">
            <div className="toolbar">
              <div>
                <h2>All eyewear</h2>
                <p>{filtered.length} styles shown</p>
              </div>
              <label className="search">
                ⌕
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setInventoryPage(1);
                  }}
                  placeholder="Search code, brand or style"
                />
              </label>
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setInventoryPage(1);
                }}
              >
                <option>All</option>
                <option>Budget</option>
                <option>Classic</option>
                <option>Premium</option>
                <option>Luxury</option>
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Category</th>
                    <th>Selling price</th>
                    <th>Stock</th>
                    <th>Stock actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="product">
                          <span className="glasses">⌐◉-◉</span>
                          <p>
                            <b>{item.name}</b>
                            <small>
                              {item.code} · {item.color || "Unspecified"}
                            </small>
                          </p>
                        </div>
                      </td>
                      <td>{item.brand}</td>
                      <td>
                        <span className={`pill ${item.category.toLowerCase()}`}>
                          {item.category}
                        </span>
                      </td>
                      <td>
                        <b>{money.format(item.sellingPrice)}</b>
                        <small className="cost">
                          Cost {money.format(item.costPrice)}
                        </small>
                      </td>
                      <td>
                        <b
                          className={
                            item.quantity <= item.reorderLevel ? "low" : ""
                          }
                        >
                          {item.quantity} units
                        </b>
                        <small className="cost">
                          Reorder at {item.reorderLevel}
                        </small>
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="sale-action"
                            onClick={() => beginMovement(item, "sale")}
                            disabled={item.quantity === 0}
                          >
                            Record sale
                          </button>
                          <button
                            className="stock-action"
                            onClick={() => beginMovement(item, "stock")}
                          >
                            Add stock
                          </button>
                          <button
                            className="edit-button"
                            onClick={() => beginEdit(item)}
                            title="Edit product"
                          >
                            ✎
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filtered.length && (
                <div className="empty">
                  <span>⌐◉-◉</span>
                  <h3>No eyewear found</h3>
                  <p>Add your first style or change the search filter.</p>
                  <button className="primary" onClick={() => setModal(true)}>
                    Add eyewear
                  </button>
                </div>
              )}
              {loading && (
                <div className="empty">
                  <p>Loading inventory…</p>
                </div>
              )}
            </div>
            {!!filtered.length && (
              <div className="pagination">
                <p>
                  Showing {(inventoryPage - 1) * inventoryPageSize + 1}–
                  {Math.min(inventoryPage * inventoryPageSize, filtered.length)} of{" "}
                  {filtered.length}
                </p>
                <div>
                  <button
                    disabled={inventoryPage === 1}
                    onClick={() => setInventoryPage((page) => page - 1)}
                  >
                    ← Previous
                  </button>
                  <span>
                    Page {inventoryPage} of {inventoryPageCount}
                  </span>
                  <button
                    disabled={inventoryPage === inventoryPageCount}
                    onClick={() => setInventoryPage((page) => page + 1)}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
        {view === "Stock Activity" && (
          <section className="panel">
            <div className="toolbar">
              <div>
                <h2>Recent stock activity</h2>
                <p>{activities.length} recorded movements</p>
              </div>
            </div>
            <div className="activity-list">
              {activities.map((a) => (
                <article key={a.id}>
                  <span
                    className={a.change < 0 ? "movement out" : "movement in"}
                  >
                    {a.change < 0 ? "−" : "+"}
                  </span>
                  <div>
                    <b>{a.type}</b>
                    <p>
                      {a.itemName} · {a.itemCode}
                    </p>
                  </div>
                  <strong className={a.change < 0 ? "negative" : "positive"}>
                    {a.change > 0 ? "+" : ""}
                    {a.change} unit{Math.abs(a.change) === 1 ? "" : "s"}
                  </strong>
                  <time>
                    {new Date(a.createdAt).toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    <small>Balance: {a.balance}</small>
                  </time>
                </article>
              ))}
              {!activities.length && (
                <div className="empty">
                  <h3>No activity yet</h3>
                  <p>New stock, sales and restocks will appear here.</p>
                </div>
              )}
            </div>
          </section>
        )}
        {view === "Brands" && (
          <section className="brand-grid">
            {Array.from(new Set(items.map((i) => i.brand))).map((brand) => {
              const group = items.filter((i) => i.brand === brand);
              return (
                <button
                  className="brand-card"
                  key={brand}
                  onClick={() => setSelectedBrand(brand)}
                >
                  <span>{brand.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <h3>{brand}</h3>
                    <p>
                      {group.length} style{group.length === 1 ? "" : "s"} ·{" "}
                      {group.reduce((s, i) => s + i.quantity, 0)} units
                    </p>
                    <b>
                      {money.format(
                        group.reduce(
                          (s, i) => s + i.quantity * i.sellingPrice,
                          0,
                        ),
                      )}{" "}
                      retail value
                    </b>
                    <small>View brand breakdown →</small>
                  </div>
                </button>
              );
            })}
            {!items.length && (
              <div className="empty">
                <h3>No brands yet</h3>
                <p>Add eyewear to build your catalogue.</p>
              </div>
            )}
          </section>
        )}
        {view === "Reports" && (
          <>
            <div className="report-filter">
              <div>
                <b>Report timeframe</b>
                <small>Applies to sales results</small>
              </div>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last 12 months</option>
                <option value="all">All time</option>
                <option value="custom">Custom range</option>
              </select>
              {period === "custom" && (
                <>
                  <label>
                    From
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
            <section className="sales-summary">
              <article>
                <span>Total sales</span>
                <b>{money.format(salesTotal)}</b>
                <small>
                  {reportSales.length} recorded transaction
                  {reportSales.length === 1 ? "" : "s"}
                </small>
              </article>
              <article>
                <span>Units sold</span>
                <b>{unitsSold}</b>
                <small>Eyewear sold in timeframe</small>
              </article>
              <article>
                <span>Average sale</span>
                <b>
                  {money.format(
                    reportSales.length ? salesTotal / reportSales.length : 0,
                  )}
                </b>
                <small>Per transaction</small>
              </article>
            </section>
            <section className="report-grid">
              <article>
                <p className="eyebrow">CATEGORY MIX</p>
                <h2>Stock by category</h2>
                {["Budget", "Classic", "Premium", "Luxury"].map((c) => {
                  const count = items
                    .filter((i) => i.category === c)
                    .reduce((s, i) => s + i.quantity, 0);
                  return (
                    <div className="bar-row" key={c}>
                      <span>{c}</span>
                      <div>
                        <i
                          style={{
                            width: `${stats.units ? Math.max(3, (count / stats.units) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <b>{count}</b>
                    </div>
                  );
                })}
              </article>
              <article>
                <p className="eyebrow">STOCK HEALTH</p>
                <h2>Reorder watchlist</h2>
                {lowStockItems.slice(0, 5).map((i) => (
                    <div className="watch" key={i.id}>
                      <div>
                        <b>{i.code}</b>
                        <small>
                          {i.name} · {i.brand}
                        </small>
                      </div>
                      <span>{i.quantity} left</span>
                    </div>
                  ))}
                {!stats.low && (
                  <div className="healthy">✓ All stock levels are healthy</div>
                )}
                {lowStockItems.length > 5 && (
                  <button
                    className="view-all"
                    onClick={() => setShowStockHealth(true)}
                  >
                    View all {lowStockItems.length} low-stock products →
                  </button>
                )}
              </article>
              <article className="wide">
                <p className="eyebrow">FINANCIAL SUMMARY</p>
                <div className="financial">
                  <div>
                    <span>Stock cost</span>
                    <b>
                      {money.format(
                        items.reduce((s, i) => s + i.quantity * i.costPrice, 0),
                      )}
                    </b>
                  </div>
                  <div>
                    <span>Potential revenue</span>
                    <b>{money.format(stats.value)}</b>
                  </div>
                  <div>
                    <span>Potential gross profit</span>
                    <b>
                      {money.format(
                        stats.value -
                          items.reduce(
                            (s, i) => s + i.quantity * i.costPrice,
                            0,
                          ),
                      )}
                    </b>
                  </div>
                </div>
              </article>
              <article className="wide">
                <p className="eyebrow">SALES DETAIL</p>
                <h2>Sales in selected timeframe</h2>
                {reportSales.slice(0, 10).map((s) => (
                  <div className="sale-row" key={s.id}>
                    <div>
                      <b>{s.itemName}</b>
                      <small>
                        {s.itemCode} ·{" "}
                        {new Date(s.createdAt).toLocaleDateString("en-NG")}
                      </small>
                    </div>
                    <span>
                      {s.quantity} unit{s.quantity === 1 ? "" : "s"}
                    </span>
                    <strong>{money.format(s.totalAmount)}</strong>
                  </div>
                ))}
                {!reportSales.length && (
                  <div className="healthy">
                    No sales recorded in this timeframe.
                  </div>
                )}
              </article>
            </section>
          </>
        )}
        {view === "Users" && currentRole === "admin" && (
          <section className="users-layout">
            <form className="invite-card" onSubmit={inviteUser}>
              <p className="eyebrow">PASSWORDLESS INVITATION</p>
              <h2>Invite a team member</h2>
              <p>
                Enter their email and choose a role. They will sign in with the
                same email—no password is created.
              </p>
              <label>
                Email address
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="staff@genfrona.com"
                />
              </label>
              <label>
                Access level
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="staff">Staff — inventory access</option>
                  <option value="admin">
                    Admin — inventory and user management
                  </option>
                </select>
              </label>
              <button className="primary">Grant access</button>
              <small>
                After adding them, share the site link. Their email must match
                the account they use to sign in.
              </small>
            </form>
            <section className="panel user-list">
              <div className="toolbar">
                <div>
                  <h2>People with access</h2>
                  <p>
                    {users.filter((u) => u.status === "active").length} active
                    users
                  </p>
                </div>
              </div>
              {users.map((user) => (
                <article key={user.id}>
                  <span className="avatar">
                    {user.email.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <b>{user.email}</b>
                    <small>Invited by {user.invitedBy || "system"}</small>
                  </div>
                  <select
                    value={user.role}
                    onChange={(e) => updateUser(user, { role: e.target.value })}
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    className={user.status === "active" ? "disable" : "enable"}
                    onClick={() =>
                      updateUser(user, {
                        status:
                          user.status === "active" ? "disabled" : "active",
                      })
                    }
                  >
                    {user.status === "active" ? "Disable" : "Enable"}
                  </button>
                </article>
              ))}
            </section>
          </section>
        )}
        {view === "Audit Trail" && currentRole === "admin" && (
          <section className="panel audit-panel">
            <div className="toolbar">
              <div>
                <h2>System audit trail</h2>
                <p>{auditEntries.length} recent recorded actions</p>
              </div>
              <button className="secondary" onClick={loadAudit}>
                Refresh
              </button>
            </div>
            <div className="audit-list">
              {auditEntries.map((entry) => (
                <article key={entry.id}>
                  <span
                    className={`audit-dot ${entry.source === "google-sheet" ? "sheet" : "site"}`}
                  >
                    •
                  </span>
                  <div>
                    <b>{entry.action}</b>
                    <p>{entry.description}</p>
                    <small>
                      {entry.entityCode || entry.entityType} ·{" "}
                      {entry.source === "google-sheet"
                        ? "Google Sheet"
                        : "Genfrona site"}
                    </small>
                  </div>
                  <strong>{entry.actorEmail}</strong>
                  <time>
                    {new Date(entry.createdAt).toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </article>
              ))}
              {!auditEntries.length && (
                <div className="empty">
                  <h3>No activity recorded yet</h3>
                  <p>
                    New inventory, sales, user and sync actions will appear
                    here.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
        <footer>
          Genfrona inventory records are saved automatically · Prices shown in
          Nigerian Naira
        </footer>
      </section>
      {modal && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(false);
          }}
        >
          <form className="modal" onSubmit={editing ? saveEdit : addItem}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">
                  {editing ? "EDIT PRODUCT" : "NEW STOCK RECORD"}
                </p>
                <h2>{editing ? `Edit ${editing.code}` : "Add eyewear"}</h2>
                <p>
                  {editing
                    ? "Update product details, prices or stock settings."
                    : "The item code will be generated automatically."}
                </p>
              </div>
              <button type="button" onClick={() => setModal(false)}>
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                Style name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Round Metal Frame"
                />
              </label>
              <label>
                Brand
                <input
                  required
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  placeholder="e.g. Ray-Ban"
                />
              </label>
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  <option>Budget</option>
                  <option>Classic</option>
                  <option>Premium</option>
                  <option>Luxury</option>
                </select>
              </label>
              <label>
                Frame colour
                <input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="e.g. Matte black"
                />
              </label>
              <label>
                Cost price (₦)
                <input
                  required
                  min="0"
                  type="number"
                  value={form.costPrice}
                  onChange={(e) =>
                    setForm({ ...form, costPrice: e.target.value })
                  }
                  placeholder="12000"
                />
              </label>
              <label>
                Selling price (₦)
                <input
                  required
                  min="1000"
                  type="number"
                  value={form.sellingPrice}
                  onChange={(e) =>
                    setForm({ ...form, sellingPrice: e.target.value })
                  }
                  placeholder="20000"
                />
                <small>
                  Creates price band{" "}
                  {form.sellingPrice
                    ? String(Math.round(+form.sellingPrice / 1000)).padStart(
                        4,
                        "0",
                      )
                    : "0000"}
                </small>
              </label>
              <label>
                Opening quantity
                <input
                  required
                  min="0"
                  type="number"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                />
              </label>
              <label>
                Low-stock alert at
                <input
                  required
                  min="0"
                  type="number"
                  value={form.reorderLevel}
                  onChange={(e) =>
                    setForm({ ...form, reorderLevel: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="code-preview">
              <span>Generated code</span>
              <b>
                {
                  (
                    {
                      Budget: "B",
                      Classic: "C",
                      Premium: "P",
                      Luxury: "L",
                    } as Record<string, string>
                  )[form.category]
                }
                {form.sellingPrice
                  ? String(Math.round(+form.sellingPrice / 1000)).padStart(
                      4,
                      "0",
                    )
                  : "0000"}
                -##
              </b>
              <small>Category + price in thousands + sequence</small>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setModal(false)}>
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Add to inventory"}
              </button>
            </div>
          </form>
        </div>
      )}
      {movement && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !movementSaving)
              setMovement(null);
          }}
        >
          <form className="modal movement-modal" onSubmit={saveMovement}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">
                  {movement.type === "sale" ? "SALE" : "INVENTORY"}
                </p>
                <h2>
                  {movement.type === "sale" ? "Record sale" : "Add stock"}
                </h2>
                <p>
                  {movement.item.name} · {movement.item.code}
                </p>
              </div>
              <button
                type="button"
                disabled={movementSaving}
                onClick={() => setMovement(null)}
              >
                ×
              </button>
            </div>
            <div className="movement-summary">
              <div>
                <span>Current stock</span>
                <b>{movement.item.quantity} units</b>
              </div>
              <div>
                <span>Resulting stock</span>
                <b>
                  {Math.max(
                    0,
                    movement.item.quantity +
                      (movement.type === "sale" ? -1 : 1) *
                        (Number(movementQty) || 0),
                  )}{" "}
                  units
                </b>
              </div>
            </div>
            <label className="movement-quantity">
              Quantity
              <input
                autoFocus
                required
                min="1"
                max={
                  movement.type === "sale"
                    ? movement.item.quantity
                    : undefined
                }
                step="1"
                type="number"
                value={movementQty}
                onChange={(event) => {
                  setMovementQty(event.target.value);
                  setMovementError("");
                }}
              />
              <small>
                {movement.type === "sale"
                  ? `Maximum available: ${movement.item.quantity}`
                  : "Enter the number of units received."}
              </small>
            </label>
            {movementError && (
              <p className="movement-error">{movementError}</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                disabled={movementSaving}
                onClick={() => setMovement(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={movementSaving}>
                {movementSaving
                  ? "Saving…"
                  : movement.type === "sale"
                    ? "Save sale"
                    : "Save stock"}
              </button>
            </div>
          </form>
        </div>
      )}
      {selectedBrand && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedBrand(null);
          }}
        >
          <section className="modal breakdown-modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">BRAND BREAKDOWN</p>
                <h2>{selectedBrand}</h2>
                <p>
                  {selectedBrandItems.length} style
                  {selectedBrandItems.length === 1 ? "" : "s"} ·{" "}
                  {selectedBrandItems.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  )}{" "}
                  units in stock
                </p>
              </div>
              <button type="button" onClick={() => setSelectedBrand(null)}>
                ×
              </button>
            </div>
            <div className="breakdown-summary">
              <div>
                <span>Retail value</span>
                <b>
                  {money.format(
                    selectedBrandItems.reduce(
                      (sum, item) =>
                        sum + item.quantity * item.sellingPrice,
                      0,
                    ),
                  )}
                </b>
              </div>
              <div>
                <span>Low stock</span>
                <b>
                  {
                    selectedBrandItems.filter(
                      (item) => item.quantity <= item.reorderLevel,
                    ).length
                  }
                </b>
              </div>
            </div>
            <div className="breakdown-list">
              {selectedBrandItems.map((item) => (
                <article key={item.id}>
                  <div>
                    <b>{item.name}</b>
                    <small>
                      {item.code} · {item.category} ·{" "}
                      {item.color || "Unspecified"}
                    </small>
                  </div>
                  <strong
                    className={
                      item.quantity <= item.reorderLevel ? "low" : ""
                    }
                  >
                    {item.quantity} units
                  </strong>
                  <span>{money.format(item.sellingPrice)}</span>
                </article>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setSelectedBrand(null)}>
                Close
              </button>
              <button
                className="primary"
                onClick={() => {
                  setQuery(selectedBrand);
                  setFilter("All");
                  setInventoryPage(1);
                  setView("Inventory");
                  setSelectedBrand(null);
                }}
              >
                View in inventory
              </button>
            </div>
          </section>
        </div>
      )}
      {showStockHealth && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowStockHealth(false);
          }}
        >
          <section className="modal breakdown-modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">STOCK HEALTH</p>
                <h2>Reorder watchlist</h2>
                <p>{lowStockItems.length} products need attention.</p>
              </div>
              <button type="button" onClick={() => setShowStockHealth(false)}>
                ×
              </button>
            </div>
            <div className="breakdown-list stock-breakdown">
              {lowStockItems.map((item) => (
                <article key={item.id}>
                  <div>
                    <b>{item.name}</b>
                    <small>
                      {item.code} · {item.brand}
                    </small>
                  </div>
                  <strong className="low">{item.quantity} left</strong>
                  <span>Reorder at {item.reorderLevel}</span>
                </article>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowStockHealth(false)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
