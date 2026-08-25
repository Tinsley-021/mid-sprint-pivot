import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShoppingCart,
  Store,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context.js';
import { ApiError } from '../lib/api.js';
import { listBranches, createBranch, type Branch } from '../lib/branches.js';
import {
  listProducts,
  createProduct,
  listOrders,
  createOrder,
  listAlerts,
  searchAvailability,
  type ProductStock,
  type Order,
  type StockAlert,
  type AvailabilityMatch,
} from '../lib/inventory.js';
import { listCustomers, type Customer } from '../lib/customers.js';

const money = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

const TABS = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Inventory', icon: Boxes },
  { label: 'Orders & Payments', icon: ShoppingCart },
  { label: 'Branches', icon: Store },
  { label: 'Customers', icon: Users },
  { label: 'Support Availability', icon: Search },
  { label: 'Alerts', icon: Bell },
] as const;

type Tab = (typeof TABS)[number]['label'];

// Poll instead of pretending to hold a live socket connection — there's no
// realtime transport wired up in this phase, and an honest "refreshing every
// 20s" beats a fake "Live sync" badge that isn't backed by anything.
const REFRESH_INTERVAL_MS = 20_000;

export default function Management() {
  const { user, accessToken, logout, resendVerification } = useAuth();
  const [tab, setTab] = useState<Tab>('Overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [resent, setResent] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [productModal, setProductModal] = useState<{ open: boolean; prefill?: Partial<ProductDraft> }>({
    open: false,
  });
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);

  const showToast = (message: string, ms = 3000) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? '' : t)), ms);
  };

  const load = async () => {
    const [b, p, o, a, c] = await Promise.all([
      listBranches(accessToken),
      listProducts(accessToken),
      listOrders(accessToken),
      listAlerts(accessToken),
      listCustomers(accessToken),
    ]);
    setBranches(b);
    setProducts(p);
    setOrders(o);
    setAlerts(a);
    setCustomers(c);
    setLoaded(true);
  };

  useEffect(() => {
    load().catch(() => showToast('Unable to load live retail data.'));
    const interval = window.setInterval(() => load().catch(() => undefined), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const branchStats = useMemo(() => {
    const byName = new Map<string, { revenue: number; orders: number }>();
    for (const o of orders) {
      const cur = byName.get(o.branch) ?? { revenue: 0, orders: 0 };
      cur.revenue += o.amount;
      cur.orders += 1;
      byName.set(o.branch, cur);
    }
    return branches.map((b) => ({ ...b, ...(byName.get(b.name) ?? { revenue: 0, orders: 0 }) }));
  }, [branches, orders]);

  const metrics = useMemo(
    () => ({
      revenue: orders.reduce((s, o) => s + o.amount, 0),
      orders: orders.length,
      unitsInStock: products.reduce((s, p) => s + p.quantity, 0),
      low: alerts.length,
    }),
    [orders, products, alerts],
  );

  const filteredProducts = products.filter((p) =>
    `${p.name} ${p.sku} ${p.branchName}`.toLowerCase().includes(query.toLowerCase()),
  );

  const testSale = async (product: ProductStock) => {
    try {
      const r = await createOrder(accessToken, { productId: product.productId, branchId: product.branchId, quantity: 1 });
      showToast(`Payment prompt created: ${r.payment.reference}`, 3500);
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not create the order.');
    }
  };

  return (
    <div className="min-h-screen bg-ink text-paper">
      <TopBar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onRefresh={() => load().then(() => showToast('Refreshed', 1200)).catch(() => showToast('Refresh failed'))}
        onLogout={() => logout()}
        userName={user?.name}
        userInitials={initialsOf(user?.name)}
        accountMenuOpen={accountMenuOpen}
        setAccountMenuOpen={setAccountMenuOpen}
      />
      <div className="mx-auto flex max-w-[1500px]">
        <Sidebar
          tab={tab}
          setTab={setTab}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          revenue={metrics.revenue}
          branchCount={branches.length}
        />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          {user && !user.emailVerified ? (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-paper">
              <span>Your email isn't verified yet. Check your inbox for a link.</span>
              <button
                onClick={() => resendVerification().then(() => setResent(true))}
                className="font-mono text-xs uppercase tracking-wider text-amber hover:underline"
              >
                {resent ? 'Sent' : 'Resend'}
              </button>
            </div>
          ) : null}

          {!loaded ? (
            <p className="font-mono text-xs uppercase tracking-widest text-slate-soft">Loading your network…</p>
          ) : (
            <>
              {tab === 'Overview' && (
                <Overview
                  metrics={metrics}
                  branchStats={branchStats}
                  alerts={alerts}
                  orders={orders}
                  onCreateOrder={() => setTab('Orders & Payments')}
                />
              )}

              {tab === 'Inventory' && (
                <>
                  <PageTitle
                    title="Inventory"
                    subtitle="Monitor stock across every retail location in real time."
                    action={
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-3 text-slate-soft" />
                          <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search product, SKU or branch"
                            className="w-64 rounded-xl border border-paper-dim/25 bg-ink-soft py-2.5 pl-9 pr-3 text-sm text-paper placeholder:text-slate-soft/60 outline-none focus:border-amber sm:w-72"
                          />
                        </div>
                        {branches.length > 0 && (
                          <button
                            onClick={() => setProductModal({ open: true })}
                            className="flex items-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-ink hover:bg-amber-dim"
                          >
                            <Plus size={16} /> Add product
                          </button>
                        )}
                      </div>
                    }
                  />
                  {branches.length === 0 ? (
                    <EmptyState
                      text="Add a branch before stocking products."
                      action={
                        <button onClick={() => setTab('Branches')} className="text-sm font-semibold text-amber hover:underline">
                          Go to Branches →
                        </button>
                      }
                    />
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Mini label="Total SKUs" value={String(new Set(products.map((p) => p.sku)).size)} icon={Package} />
                        <Mini label="Available units" value={String(metrics.unitsInStock)} icon={Boxes} />
                        <Mini
                          label="Out of stock"
                          value={String(products.filter((p) => p.quantity - p.reserved <= 0).length)}
                          icon={AlertTriangle}
                        />
                      </div>
                      <div className="mt-6 overflow-hidden rounded-2xl border border-paper-dim/15 bg-ink-soft shadow-sm">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-ink text-xs uppercase tracking-wider text-slate-soft">
                            <tr>
                              <th className="p-4">Product</th>
                              <th className="p-4">Branch</th>
                              <th className="p-4">Price</th>
                              <th className="p-4">Available</th>
                              <th className="p-4">Status</th>
                              <th className="p-4" />
                            </tr>
                          </thead>
                          <tbody>
                            {filteredProducts.map((p) => (
                              <tr key={p.id} className="border-t border-paper-dim/10">
                                <td className="p-4">
                                  <div className="font-semibold text-paper">{p.name}</div>
                                  <div className="text-xs text-slate-soft">
                                    {p.sku} · {p.category}
                                  </div>
                                </td>
                                <td className="p-4 text-slate-soft">{p.branchName}</td>
                                <td className="p-4 font-semibold text-paper">{money(p.price)}</td>
                                <td className="p-4">
                                  <span className="font-bold text-paper">{p.quantity - p.reserved}</span>
                                  <span className="ml-2 text-xs text-slate-soft">{p.reserved} reserved</span>
                                </td>
                                <td className="p-4">
                                  <StatusPill status={p.status} />
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() =>
                                        setProductModal({
                                          open: true,
                                          prefill: {
                                            name: p.name,
                                            sku: p.sku,
                                            category: p.category,
                                            sellingPrice: p.price,
                                            reorderLevel: p.reorderLevel,
                                            branchId: p.branchId,
                                          },
                                        })
                                      }
                                      className="rounded-lg border border-paper-dim/25 px-3 py-1.5 text-xs font-semibold text-paper hover:border-amber hover:text-amber"
                                    >
                                      Restock
                                    </button>
                                    <button
                                      onClick={() => testSale(p)}
                                      className="rounded-lg border border-paper-dim/25 px-3 py-1.5 text-xs font-semibold text-paper hover:border-amber hover:text-amber"
                                    >
                                      Test sale
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {filteredProducts.length === 0 && (
                              <tr>
                                <td colSpan={6} className="p-8 text-center text-sm text-slate-soft">
                                  No products match "{query}".
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}

              {tab === 'Orders & Payments' && (
                <>
                  <PageTitle
                    title="Orders & Payments"
                    subtitle="Create orders, generate payment prompts and track settlement."
                    action={
                      products.length > 0 && (
                        <button
                          onClick={() => setOrderModalOpen(true)}
                          className="flex items-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-ink hover:bg-amber-dim"
                        >
                          <Plus size={16} /> New order
                        </button>
                      )
                    }
                  />
                  <div className="grid gap-4 md:grid-cols-3">
                    <Mini label="Total orders" value={String(metrics.orders)} icon={ShoppingCart} />
                    <Mini label="Paid orders" value={String(orders.filter((o) => o.paymentStatus === 'PAID').length)} icon={CheckCircle2} />
                    <Mini
                      label="Pending payment"
                      value={String(orders.filter((o) => o.paymentStatus !== 'PAID').length)}
                      icon={CircleDollarSign}
                    />
                  </div>
                  <div className="mt-6 rounded-2xl border border-paper-dim/15 bg-ink-soft p-5 shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-wider text-slate-soft">
                          <tr>
                            <th className="pb-3">Order</th>
                            <th className="pb-3">Customer</th>
                            <th className="pb-3">Branch</th>
                            <th className="pb-3">Amount</th>
                            <th className="pb-3">Order status</th>
                            <th className="pb-3">Payment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((o) => (
                            <tr key={o.id} className="border-t border-paper-dim/10">
                              <td className="py-3 font-semibold text-paper">{o.id}</td>
                              <td className="py-3 text-paper">{o.customer}</td>
                              <td className="py-3 text-slate-soft">{o.branch}</td>
                              <td className="py-3 font-semibold text-paper">{money(o.amount)}</td>
                              <td className="py-3">
                                <StatusPill status={o.status} />
                              </td>
                              <td className="py-3">
                                <span className="rounded-full bg-paper-dim/10 px-2.5 py-1 text-xs font-semibold text-paper">
                                  {o.paymentStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {orders.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-sm text-slate-soft">
                                No orders yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {tab === 'Branches' && (
                <>
                  <PageTitle
                    title="Branches"
                    subtitle="Compare performance and operational health across your retail network."
                    action={
                      <button
                        onClick={() => setBranchModalOpen(true)}
                        className="flex items-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-ink hover:bg-amber-dim"
                      >
                        <Plus size={16} /> Add branch
                      </button>
                    }
                  />
                  {branchStats.length === 0 ? (
                    <EmptyState text="You haven't added a branch yet." />
                  ) : (
                    <div className="grid gap-5 lg:grid-cols-2">
                      {branchStats.map((b) => (
                        <div key={b.id} className="rounded-2xl border border-paper-dim/15 bg-ink-soft p-5 shadow-sm">
                          <div className="flex items-start justify-between">
                            <div className="flex gap-3">
                              <div className="grid h-11 w-11 place-items-center rounded-xl bg-paper-dim/10 text-paper">
                                <Building2 size={20} />
                              </div>
                              <div>
                                <h3 className="font-bold text-paper">{b.name}</h3>
                                <p className="text-xs text-slate-soft">
                                  {b.code} {b.city ? `· ${b.city}` : ''}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="mt-6 grid grid-cols-2 gap-3">
                            <MetricBox label="Revenue" value={money(b.revenue)} />
                            <MetricBox label="Orders" value={String(b.orders)} />
                          </div>
                          <div className="mt-4 flex items-center justify-between border-t border-paper-dim/10 pt-4 text-xs text-slate-soft">
                            <span>Network contribution</span>
                            <span className="font-bold text-paper">
                              {metrics.revenue ? Math.round((b.revenue / metrics.revenue) * 100) : 0}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === 'Customers' && (
                <>
                  <PageTitle title="Customers" subtitle="Everyone who has bought from your network." />
                  {customers.length === 0 ? (
                    <EmptyState text="No customers yet — they'll show up here once orders are placed with a name attached." />
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-paper-dim/15 bg-ink-soft shadow-sm">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-ink text-xs uppercase tracking-wider text-slate-soft">
                          <tr>
                            <th className="p-4">Customer</th>
                            <th className="p-4">Contact</th>
                            <th className="p-4">Orders</th>
                            <th className="p-4">Total spent</th>
                            <th className="p-4">Last order</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customers.map((c) => (
                            <tr key={c.id} className="border-t border-paper-dim/10">
                              <td className="p-4 font-semibold text-paper">{c.name}</td>
                              <td className="p-4 text-slate-soft">
                                {c.phone ? (
                                  <span className="flex items-center gap-1.5">
                                    <Phone size={13} /> {c.phone}
                                  </span>
                                ) : (
                                  c.email ?? '—'
                                )}
                              </td>
                              <td className="p-4 text-paper">{c.orderCount}</td>
                              <td className="p-4 font-semibold text-paper">{money(c.totalSpent)}</td>
                              <td className="p-4 text-slate-soft">
                                {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {tab === 'Support Availability' && <SupportAvailability accessToken={accessToken} showToast={showToast} />}

              {tab === 'Alerts' && (
                <>
                  <PageTitle title="Stock alerts" subtitle="Low-stock signals generated live from branch inventory thresholds." />
                  <div className="space-y-3">
                    {alerts.map((a) => {
                      const match = products.find((p) => p.id === a.id);
                      return (
                        <div key={a.id} className="flex items-center gap-4 rounded-2xl border border-amber/30 bg-ink-soft p-4 shadow-sm">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber/10 text-amber">
                            <AlertTriangle size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-paper">{a.product}</div>
                            <div className="text-xs text-slate-soft">
                              {a.branch} · Current {a.quantity} · Reorder at {a.reorderLevel}
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              match
                                ? setProductModal({
                                    open: true,
                                    prefill: {
                                      name: match.name,
                                      sku: match.sku,
                                      category: match.category,
                                      sellingPrice: match.price,
                                      reorderLevel: match.reorderLevel,
                                      branchId: match.branchId,
                                    },
                                  })
                                : showToast('Could not find that product to restock.')
                            }
                            className="shrink-0 rounded-lg border border-paper-dim/25 px-3 py-2 text-xs font-semibold text-paper hover:border-amber hover:text-amber"
                          >
                            Restock
                          </button>
                        </div>
                      );
                    })}
                    {alerts.length === 0 && <EmptyState text="All products are above their reorder thresholds." />}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-xl bg-amber px-4 py-3 text-sm font-semibold text-ink shadow-xl">
          <CheckCircle2 size={17} />
          {toast}
          <button onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}

      {productModal.open && (
        <ProductModal
          branches={branches}
          prefill={productModal.prefill}
          onClose={() => setProductModal({ open: false })}
          onSubmit={async (draft) => {
            try {
              await createProduct(accessToken, draft);
              showToast(`${draft.name} stocked at the selected branch.`);
              setProductModal({ open: false });
              await load();
            } catch (err) {
              throw err instanceof ApiError ? err : new Error('Could not save this product.');
            }
          }}
        />
      )}

      {orderModalOpen && (
        <OrderModal
          products={products}
          onClose={() => setOrderModalOpen(false)}
          onSubmit={async (input) => {
            try {
              const r = await createOrder(accessToken, input);
              showToast(`Payment prompt created: ${r.payment.reference}`, 3500);
              setOrderModalOpen(false);
              await load();
            } catch (err) {
              throw err instanceof ApiError ? err : new Error('Could not create the order.');
            }
          }}
        />
      )}

      {branchModalOpen && (
        <BranchModal
          onClose={() => setBranchModalOpen(false)}
          onSubmit={async (input) => {
            try {
              await createBranch(accessToken, input);
              showToast(`${input.name} added.`);
              setBranchModalOpen(false);
              await load();
            } catch (err) {
              throw err instanceof ApiError ? err : new Error('Could not create the branch.');
            }
          }}
        />
      )}
    </div>
  );
}

function TopBar({
  mobileOpen,
  setMobileOpen,
  onRefresh,
  onLogout,
  userName,
  userInitials,
  accountMenuOpen,
  setAccountMenuOpen,
}: {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  onRefresh: () => void;
  onLogout: () => void;
  userName?: string;
  userInitials: string;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (v: boolean) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-paper-dim/15 bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 sm:px-6">
        <button className="rounded-lg p-2 hover:bg-paper-dim/10 lg:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber text-ink font-display font-bold">R</div>
          <div>
            <div className="font-display font-bold tracking-tight text-paper">RetailSync</div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-soft">Operations Hub</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-green/30 bg-green/10 px-3 py-1.5 font-mono text-xs font-semibold text-green sm:flex">
            <span className="h-2 w-2 rounded-full bg-green" /> Auto-refreshing
          </div>
          <button className="rounded-full border border-paper-dim/25 p-2 text-slate-soft hover:border-amber hover:text-amber" onClick={onRefresh}>
            <RefreshCw size={17} />
          </button>
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 hover:bg-paper-dim/10"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-paper-dim/15 text-xs font-bold text-paper">
                {userInitials}
              </span>
              <ChevronDown size={14} className="text-slate-soft" />
            </button>
            {accountMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAccountMenuOpen(false)} />
                <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-paper-dim/15 bg-ink-soft py-2 shadow-2xl shadow-black/40">
                  {userName && (
                    <div className="border-b border-paper-dim/10 px-4 pb-2">
                      <p className="truncate text-sm font-semibold text-paper">{userName}</p>
                    </div>
                  )}
                  <Link
                    to="/app/team"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-paper hover:bg-paper-dim/10"
                  >
                    <Users size={15} /> Team
                  </Link>
                  <Link
                    to="/app/security"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-paper hover:bg-paper-dim/10"
                  >
                    <Shield size={15} /> Security
                  </Link>
                  <button
                    onClick={onLogout}
                    className="flex w-full items-center gap-2.5 border-t border-paper-dim/10 px-4 py-2.5 text-sm text-red hover:bg-paper-dim/10"
                  >
                    <LogOut size={15} /> Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Sidebar({
  tab,
  setTab,
  mobileOpen,
  setMobileOpen,
  revenue,
  branchCount,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  revenue: number;
  branchCount: number;
}) {
  return (
    <aside
      className={`${
        mobileOpen ? 'fixed inset-y-16 left-0 z-20 block w-64 bg-ink shadow-2xl shadow-black/40' : 'hidden'
      } w-64 shrink-0 border-r border-paper-dim/15 bg-ink lg:block`}
    >
      <div className="p-4">
        <div className="mb-3 px-3 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-slate-soft">Workspace</div>
        {TABS.map((n) => {
          const I = n.icon;
          const active = tab === n.label;
          return (
            <button
              key={n.label}
              onClick={() => {
                setTab(n.label);
                setMobileOpen(false);
              }}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                active ? 'bg-amber text-ink' : 'text-slate-soft hover:bg-paper-dim/10 hover:text-paper'
              }`}
            >
              <I size={17} />
              {n.label}
            </button>
          );
        })}
      </div>
      <div className="mx-4 mt-5 rounded-2xl bg-ink-soft p-4">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-paper">
          <CircleDollarSign size={15} /> Network revenue
        </div>
        <div className="mt-2 text-xl font-bold text-paper">{money(revenue)}</div>
        <div className="mt-1 text-xs text-slate-soft">
          Across {branchCount} branch{branchCount === 1 ? '' : 'es'}
        </div>
      </div>
    </aside>
  );
}

function initialsOf(name?: string) {
  if (!name) return '··';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '··';
}

function Overview({
  metrics,
  branchStats,
  alerts,
  orders,
  onCreateOrder,
}: {
  metrics: { revenue: number; orders: number; unitsInStock: number; low: number };
  branchStats: (Branch & { revenue: number; orders: number })[];
  alerts: StockAlert[];
  orders: Order[];
  onCreateOrder: () => void;
}) {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const maxRevenue = Math.max(1, ...branchStats.map((b) => b.revenue));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-sm font-medium text-slate-soft">{today}</div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-paper sm:text-3xl">Here's your network today.</h1>
          <p className="mt-1 text-sm text-slate-soft">How your retail network is performing right now.</p>
        </div>
        <button
          onClick={onCreateOrder}
          className="flex items-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-ink shadow-sm hover:bg-amber-dim"
        >
          Create order <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Mini label="Revenue" value={money(metrics.revenue)} icon={CircleDollarSign} />
        <Mini label="Orders" value={String(metrics.orders)} icon={ShoppingCart} />
        <Mini label="Units in stock" value={String(metrics.unitsInStock)} icon={Boxes} />
        <Mini label="Low stock alerts" value={String(metrics.low)} icon={AlertTriangle} tone={metrics.low ? 'amber' : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_.9fr]">
        <section className="rounded-2xl border border-paper-dim/15 bg-ink-soft p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-paper">Branch performance</h2>
              <p className="mt-1 text-xs text-slate-soft">Revenue and order volume by location</p>
            </div>
          </div>
          {branchStats.map((b) => (
            <div key={b.id} className="mb-5 last:mb-0">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-paper">{b.name}</span>
                <span className="font-bold text-paper">{money(b.revenue)}</span>
              </div>
              <div className="h-2 rounded-full bg-ink">
                <div
                  className="h-2 rounded-full bg-amber"
                  style={{ width: `${Math.max(4, Math.min(100, (b.revenue / maxRevenue) * 100))}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-soft">
                <span>{b.city ?? b.code}</span>
                <span>{b.orders} orders</span>
              </div>
            </div>
          ))}
          {branchStats.length === 0 && <EmptyState text="No branches yet." />}
        </section>
        <section className="rounded-2xl border border-paper-dim/15 bg-ink-soft p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-paper">Attention required</h2>
              <p className="mt-1 text-xs text-slate-soft">Stock that needs action</p>
            </div>
            <AlertTriangle size={18} className="text-amber" />
          </div>
          {alerts.slice(0, 4).map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-paper-dim/10 py-3 last:border-0">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber/10 text-amber">
                <Package size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-paper">{a.product}</div>
                <div className="text-xs text-slate-soft">
                  {a.branch} · {a.quantity} left
                </div>
              </div>
              <span className="rounded-full bg-amber/10 px-2 py-1 text-[10px] font-bold uppercase text-amber">
                {a.severity === 'critical' ? 'Out' : 'Low'}
              </span>
            </div>
          ))}
          {alerts.length === 0 && <div className="py-8 text-center text-sm text-slate-soft">No stock issues right now.</div>}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-paper-dim/15 bg-ink-soft p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-paper">Recent orders</h2>
            <p className="mt-1 text-xs text-slate-soft">Latest transactions across all stores</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-dim/10 text-xs uppercase tracking-wider text-slate-soft">
              <tr>
                <th className="pb-3">Order</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Branch</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Payment</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 5).map((o) => (
                <tr key={o.id} className="border-b border-paper-dim/5 last:border-0">
                  <td className="py-3 font-semibold text-paper">{o.id}</td>
                  <td className="py-3 text-paper">{o.customer}</td>
                  <td className="py-3 text-slate-soft">{o.branch}</td>
                  <td className="py-3 font-semibold text-paper">{money(o.amount)}</td>
                  <td className="py-3">
                    <span className="rounded-full bg-green/10 px-2.5 py-1 text-xs font-semibold text-green">{o.paymentStatus}</span>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-soft">
                    No orders yet — create one to see it here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SupportAvailability({
  accessToken,
  showToast,
}: {
  accessToken: string | null;
  showToast: (m: string) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AvailabilityMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      searchAvailability(accessToken, q)
        .then((r) => setResults(r.products))
        .catch(() => showToast('Could not search availability.'))
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, accessToken]);

  return (
    <>
      <PageTitle
        title="Support availability"
        subtitle="The support tool can query this same live inventory source before answering customers."
      />
      <div className="rounded-2xl border border-paper-dim/15 bg-ink-soft p-6 shadow-sm">
        <div className="max-w-xl">
          <label className="font-mono text-xs uppercase tracking-wider text-slate-soft">Customer question</label>
          <div className="relative mt-2">
            <Search size={17} className="absolute left-3 top-3 text-slate-soft" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Try: iPhone, headphones, charger..."
              className="w-full rounded-xl border border-paper-dim/25 bg-ink py-3 pl-10 pr-4 text-paper outline-none focus:border-amber"
            />
          </div>
        </div>
        {q && (
          <div className="mt-6 space-y-3">
            {searching && <p className="text-sm text-slate-soft">Searching…</p>}
            {!searching &&
              results?.map((p) => (
                <div key={p.id} className="flex items-center gap-4 rounded-xl bg-ink p-4">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink-soft">
                    <Package size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-paper">{p.name}</div>
                    <div className="text-xs text-slate-soft">
                      {p.branch} · {p.availableQuantity} available
                    </div>
                  </div>
                  <StatusPill status={p.inStock ? 'IN_STOCK' : 'OUT_OF_STOCK'} />
                </div>
              ))}
            {!searching && results?.length === 0 && <EmptyState text="No matching product found." />}
          </div>
        )}
        <div className="mt-7 rounded-xl border border-dashed border-paper-dim/25 p-4 font-mono text-xs text-slate-soft">
          <span className="font-bold text-paper">Support API:</span> GET /api/availability?query=&lt;customer-query&gt; — designed for
          your support/AI tool to retrieve branch-level stock truth.
        </div>
      </div>
    </>
  );
}

interface ProductDraft {
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
  reorderLevel: number;
  branchId: string;
  quantityOnHand: number;
}

function ProductModal({
  branches,
  prefill,
  onClose,
  onSubmit,
}: {
  branches: Branch[];
  prefill?: Partial<ProductDraft>;
  onClose: () => void;
  onSubmit: (draft: ProductDraft) => Promise<void>;
}) {
  const [form, setForm] = useState<ProductDraft>({
    name: prefill?.name ?? '',
    sku: prefill?.sku ?? '',
    category: prefill?.category ?? '',
    sellingPrice: prefill?.sellingPrice ?? 0,
    costPrice: prefill?.costPrice ?? 0,
    reorderLevel: prefill?.reorderLevel ?? 3,
    branchId: prefill?.branchId ?? branches[0]?.id ?? '',
    quantityOnHand: prefill?.quantityOnHand ?? 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isRestock = Boolean(prefill?.sku);

  async function submit() {
    setError(null);
    if (!form.name.trim() || !form.sku.trim() || !form.branchId || form.sellingPrice <= 0) {
      setError('Name, SKU, selling price and branch are required.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isRestock ? `Restock ${form.name}` : 'Add product'} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ModalField label="Name" value={form.name} disabled={isRestock} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
        <ModalField label="SKU" value={form.sku} disabled={isRestock} onChange={(v) => setForm((f) => ({ ...f, sku: v }))} />
        <ModalField label="Category" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-xs uppercase tracking-wider text-slate-soft">Branch</label>
          <select
            value={form.branchId}
            onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
            className="rounded-md border border-paper-dim/25 bg-ink px-3.5 py-2.5 text-paper outline-none focus:border-amber"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <ModalField
          label="Selling price (₦)"
          type="number"
          value={String(form.sellingPrice)}
          onChange={(v) => setForm((f) => ({ ...f, sellingPrice: Number(v) || 0 }))}
        />
        <ModalField
          label="Cost price (₦)"
          type="number"
          value={String(form.costPrice)}
          onChange={(v) => setForm((f) => ({ ...f, costPrice: Number(v) || 0 }))}
        />
        <ModalField
          label={isRestock ? 'Units to add' : 'Starting quantity'}
          type="number"
          value={String(form.quantityOnHand)}
          onChange={(v) => setForm((f) => ({ ...f, quantityOnHand: Number(v) || 0 }))}
        />
        <ModalField
          label="Reorder level"
          type="number"
          value={String(form.reorderLevel)}
          onChange={(v) => setForm((f) => ({ ...f, reorderLevel: Number(v) || 0 }))}
        />
      </div>
      {error && <p className="mt-3 text-sm text-red">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-soft hover:text-paper">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-xl bg-amber px-5 py-2.5 text-sm font-semibold text-ink hover:bg-amber-dim disabled:opacity-50"
        >
          {submitting ? 'Saving…' : isRestock ? 'Add stock' : 'Add product'}
        </button>
      </div>
    </Modal>
  );
}

function OrderModal({
  products,
  onClose,
  onSubmit,
}: {
  products: ProductStock[];
  onClose: () => void;
  onSubmit: (input: { productId: string; branchId: string; customer?: string; quantity: number }) => Promise<void>;
}) {
  const available = products.filter((p) => p.quantity - p.reserved > 0);
  const [rowId, setRowId] = useState(available[0]?.id ?? '');
  const [customer, setCustomer] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = available.find((p) => p.id === rowId);

  async function submit() {
    setError(null);
    if (!selected) {
      setError('Pick a product with available stock.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        productId: selected.productId,
        branchId: selected.branchId,
        customer: customer.trim() || undefined,
        quantity: Math.max(1, quantity),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New order" onClose={onClose}>
      {available.length === 0 ? (
        <p className="text-sm text-slate-soft">No products currently have available stock to sell.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-xs uppercase tracking-wider text-slate-soft">Product</label>
            <select
              value={rowId}
              onChange={(e) => setRowId(e.target.value)}
              className="rounded-md border border-paper-dim/25 bg-ink px-3.5 py-2.5 text-paper outline-none focus:border-amber"
            >
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.branchName} ({p.quantity - p.reserved} available, {money(p.price)})
                </option>
              ))}
            </select>
          </div>
          <ModalField label="Customer (optional)" value={customer} onChange={setCustomer} placeholder="Walk-in customer" />
          <ModalField
            label="Quantity"
            type="number"
            value={String(quantity)}
            onChange={(v) => setQuantity(Math.max(1, Number(v) || 1))}
          />
          {selected && <p className="text-sm text-slate-soft">Total: {money(selected.price * quantity)}</p>}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-soft hover:text-paper">
          Cancel
        </button>
        {available.length > 0 && (
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-xl bg-amber px-5 py-2.5 text-sm font-semibold text-ink hover:bg-amber-dim disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create order & payment prompt'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function BranchModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { name: string; code: string; city?: string; country?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: '', code: '', city: '', country: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!form.name.trim() || !form.code.trim()) {
      setError('Name and code are required.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name: form.name.trim(), code: form.code.trim(), city: form.city.trim() || undefined, country: form.country.trim() || undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add branch" onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ModalField label="Branch name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Lagos Central" />
        <ModalField
          label="Branch code"
          value={form.code}
          onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))}
          placeholder="LOS-01"
        />
        <ModalField label="City (optional)" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
        <ModalField label="Country (optional)" value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} />
      </div>
      {error && <p className="mt-3 text-sm text-red">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-soft hover:text-paper">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-xl bg-amber px-5 py-2.5 text-sm font-semibold text-ink hover:bg-amber-dim disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create branch'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-paper-dim/15 bg-ink-soft p-6 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-paper">{title}</h2>
          <button onClick={onClose} className="text-slate-soft hover:text-paper">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-xs uppercase tracking-wider text-slate-soft">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-paper-dim/25 bg-ink px-3.5 py-2.5 text-paper placeholder:text-slate-soft/60 outline-none focus:border-amber disabled:opacity-50"
      />
    </div>
  );
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-paper">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Mini({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Boxes; tone?: 'amber' }) {
  return (
    <div className="rounded-2xl border border-paper-dim/15 bg-ink-soft p-5 shadow-sm">
      <Icon size={18} className={tone === 'amber' ? 'text-amber' : 'text-slate-soft'} />
      <div className="mt-3 text-xl font-bold text-paper">{value}</div>
      <div className="text-xs text-slate-soft">{label}</div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink p-3">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-soft">{label}</div>
      <div className="mt-1 font-bold text-paper">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = String(status);
  const green = ['PAID', 'ACTIVE', 'IN_STOCK', 'COMPLETED'].includes(s);
  const amber = ['LOW_STOCK', 'PENDING_PAYMENT', 'PROCESSING'].includes(s);
  const tone = green ? 'bg-green/10 text-green' : amber ? 'bg-amber/10 text-amber' : 'bg-paper-dim/10 text-paper';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{s.replaceAll('_', ' ')}</span>;
}

function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-paper-dim/25 bg-ink-soft p-10 text-center text-sm text-slate-soft">
      <p>{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
