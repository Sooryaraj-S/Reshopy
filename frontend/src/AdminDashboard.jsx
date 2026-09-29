import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Boxes, ChartNoAxesCombined, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Download, ExternalLink, LayoutDashboard, LoaderCircle, LogOut, Menu, Package, Plus, Search, Settings2, ShoppingBag, Users, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, clearSession, currency, downloadInvoice, fetchProducts, getCustomer } from './api';

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'categories', label: 'Categories', icon: Boxes },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'customers', label: 'Customers', icon: Users },
];

function StatCard({ label, value, note, icon: Icon, tone = 'forest' }) {
  return <article className="border border-ink/10 bg-white p-5"><div className="flex items-start justify-between"><p className="text-xs font-medium text-ink/55">{label}</p><span className={`grid h-9 w-9 place-items-center ${tone === 'coral' ? 'bg-coral/10 text-coral' : 'bg-leaf text-forest'}`}><Icon size={17} /></span></div><p className="mt-5 font-display text-3xl tabular-nums">{value}</p><p className="mt-1 text-[11px] text-ink/45">{note}</p></article>;
}

function StatusTag({ value }) {
  const styles = value === 'delivered' || value === 'paid' ? 'bg-leaf text-forest' : value === 'cancelled' || value === 'refunded' || value === 'failed' ? 'bg-coral/10 text-coral' : 'bg-citrus/20 text-[#806318]';
  return <span className={`inline-flex px-2.5 py-1 text-[10px] font-semibold capitalize ${styles}`}>{String(value || '').replaceAll('_', ' ')}</span>;
}

function ProductForm({ product, categories, onClose, onSaved }) {
  const [form, setForm] = useState(product || { category_id: categories[0]?.id || '', sku: '', name: '', description: '', price: '', stock_quantity: 0, low_stock_threshold: 5, image_url: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const body = { ...form, category_id: Number(form.category_id), price: Number(form.price), stock_quantity: Number(form.stock_quantity), low_stock_threshold: Number(form.low_stock_threshold) };
    try {
      await api(product ? `/admin/products/${product.id}` : '/admin/products', { method: product ? 'PUT' : 'POST', body: JSON.stringify(body) });
      await onSaved(); onClose();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  const change = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-xl overflow-y-auto bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[.2em] text-forest">Catalog / {product ? 'Edit item' : 'New item'}</p><h2 className="mt-2 font-display text-3xl">{product ? 'Refine this piece.' : 'Add something lovely.'}</h2></div><button type="button" className="grid h-9 w-9 place-items-center hover:bg-black/5" onClick={onClose} aria-label="Close product form"><X size={17} /></button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="admin-label sm:col-span-2">Product name<input required maxLength="180" className="admin-input" value={form.name} onChange={change('name')} /></label>
          <label className="admin-label">SKU<input required maxLength="64" className="admin-input uppercase" value={form.sku} onChange={change('sku')} /></label>
          <label className="admin-label">Category<select required className="admin-input" value={form.category_id} onChange={change('category_id')}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="admin-label">Price<input required min="0" step="0.01" type="number" className="admin-input" value={form.price} onChange={change('price')} /></label>
          <label className="admin-label">Available stock<input required min="0" type="number" className="admin-input" value={form.stock_quantity} onChange={change('stock_quantity')} /></label>
          <label className="admin-label">Low stock threshold<input required min="0" type="number" className="admin-input" value={form.low_stock_threshold} onChange={change('low_stock_threshold')} /></label>
          <label className="admin-label">Image URL<input type="url" className="admin-input" value={form.image_url || ''} onChange={change('image_url')} /></label>
          <label className="admin-label sm:col-span-2">Description<textarea rows="3" className="admin-input resize-y" value={form.description || ''} onChange={change('description')} /></label>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-coral">{error}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="border border-ink/15 px-4 py-2.5 text-xs font-semibold">Cancel</button><button disabled={busy} className="inline-flex items-center gap-2 bg-forest px-5 py-2.5 text-xs font-semibold text-white hover:bg-ink">{busy && <LoaderCircle size={14} className="animate-spin" />}{product ? 'Save changes' : 'Create product'}</button></div>
      </form>
    </div>
  );
}

function CategoryForm({ category, onClose, onSaved }) {
  const [form, setForm] = useState(category || { name: '', slug: '', description: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(category ? `/admin/categories/${category.id}` : '/admin/categories', {
        method: category ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      await onSaved(); onClose();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="w-full max-w-lg bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[.2em] text-forest">Catalog / Categories</p><h2 className="mt-2 font-display text-3xl">{category ? 'Edit collection.' : 'Name a collection.'}</h2></div><button type="button" className="grid h-9 w-9 place-items-center hover:bg-black/5" onClick={onClose} aria-label="Close category form"><X size={17} /></button></div>
        <div className="mt-6 space-y-4"><label className="admin-label">Category name<input required maxLength="120" className="admin-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="admin-label">Slug<input maxLength="140" className="admin-input" placeholder="Generated from name when empty" value={form.slug || ''} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label><label className="admin-label">Description<textarea rows="3" className="admin-input resize-y" value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label></div>
        {error && <p role="alert" className="mt-4 text-sm text-coral">{error}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="border border-ink/15 px-4 py-2.5 text-xs font-semibold">Cancel</button><button disabled={busy} className="bg-forest px-5 py-2.5 text-xs font-semibold text-white hover:bg-ink">{busy ? 'Saving…' : category ? 'Save collection' : 'Create collection'}</button></div>
      </form>
    </div>
  );
}

export default function AdminDashboard() {
  const [section, setSection] = useState('overview');
  const [reports, setReports] = useState({ sales: [], revenue: [], bestSellers: [], inventory: [], categories: [], customers: [] });
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [productDialog, setProductDialog] = useState(null);
  const [categoryDialog, setCategoryDialog] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const customer = getCustomer();

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [sales, revenue, bestSellers, inventory, categoryReport, customerReport, customerData, productData, categoryData, orderData] = await Promise.all([
        api('/admin/reports/sales'), api('/admin/reports/revenue'), api('/admin/reports/best-sellers'), api('/admin/reports/inventory'), api('/admin/reports/categories'), api('/admin/reports/customers'), api('/admin/customers'), fetchProducts({ per_page: 100 }), api('/admin/categories'), api('/admin/orders'),
      ]);
      setReports({ sales: sales.rows, revenue: revenue.rows, bestSellers: bestSellers.rows, inventory: inventory.rows, categories: categoryReport.rows, customers: customerReport.rows });
      setCustomers(customerData.customers); setProducts(productData.products); setCategories(categoryData.categories); setOrders(orderData.orders);
    } catch (reason) { setError(reason.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const revenueTotal = useMemo(() => reports.revenue.reduce((sum, row) => sum + Number(row.recognized_revenue || 0), 0), [reports.revenue]);
  const currentMonthOrders = useMemo(() => orders.filter((order) => new Date(order.placed_at).getMonth() === new Date().getMonth()).length, [orders]);
  const lowStockCount = useMemo(() => reports.inventory.filter((item) => item.is_low_stock).length, [reports.inventory]);
  const chartData = useMemo(() => reports.sales.slice().reverse().map((row) => ({ ...row, day: new Date(row.sales_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), sales_total: Number(row.sales_total) })), [reports.sales]);

  async function updateStatus(id, status) {
    try { await api(`/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadDashboard(); }
    catch (reason) { setError(reason.message); }
  }

  async function archiveProduct(product) {
    if (!window.confirm(`Archive “${product.name}”? It will disappear from the storefront.`)) return;
    try { await api(`/admin/products/${product.id}`, { method: 'DELETE' }); await loadDashboard(); }
    catch (reason) { setError(reason.message); }
  }

  async function toggleCustomer(customer) {
    const is_active = !customer.is_active;
    try {
      await api(`/admin/customers/${customer.id}/status`, { method: 'PATCH', body: JSON.stringify({ is_active }) });
      await loadDashboard();
    } catch (reason) { setError(reason.message); }
  }

  async function archiveCategory(category) {
    if (!window.confirm(`Archive “${category.name}”? Products in this collection will no longer appear in the storefront.`)) return;
    try { await api(`/admin/categories/${category.id}`, { method: 'DELETE' }); await loadDashboard(); }
    catch (reason) { setError(reason.message); }
  }

  const filteredProducts = products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase()));
  const filteredOrders = orders.filter((order) => `${order.invoice_number} ${order.customer_name || ''} ${order.status}`.toLowerCase().includes(query.toLowerCase()));
  const filteredCustomers = customers.filter((entry) => `${entry.first_name} ${entry.last_name} ${entry.email}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#f4f5f0] text-ink">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col bg-ink text-white transition-transform md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[76px] items-center justify-between border-b border-white/10 px-6"><a href="/" className="font-display text-2xl">reshopy<span className="text-coral">.</span></a><button className="md:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <div className="px-4 pt-7"><p className="px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/40">Workspace</p><nav className="mt-3 space-y-1">{navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setMobileNav(false); setQuery(''); }} className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition ${section === id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}><Icon size={17} />{label}{id === 'orders' && <span className="ml-auto text-[10px] text-white/40">{orders.length}</span>}</button>)}</nav></div>
        <div className="mt-auto border-t border-white/10 px-6 py-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-citrus text-xs font-bold text-ink">{(customer?.first_name || 'R').slice(0, 1)}</div><div className="min-w-0"><p className="truncate text-xs font-semibold">{customer?.first_name || 'Reshopy'} {customer?.last_name || 'Admin'}</p><p className="mt-0.5 truncate text-[10px] text-white/45">{customer?.email}</p></div><button className="ml-auto text-white/55 hover:text-white" title="Sign out" aria-label="Sign out" onClick={() => { clearSession(); window.location.assign('/'); }}><LogOut size={16} /></button></div></div>
      </aside>
      {mobileNav && <button aria-label="Close navigation overlay" className="fixed inset-0 z-20 bg-black/35 md:hidden" onClick={() => setMobileNav(false)} />}

      <div className="min-h-screen md:pl-[248px]">
        <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-ink/10 bg-[#f9f8f4]/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3"><button className="grid h-9 w-9 place-items-center md:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={18} /></button><div><p className="text-[9px] uppercase tracking-[.2em] text-forest">Reshopy / Admin</p><h1 className="font-display text-xl capitalize">{section === 'overview' ? 'Good morning' : section}</h1></div></div>
          <div className="flex items-center gap-2 sm:gap-4"><div className="hidden items-center gap-2 border-b border-ink/20 px-1 py-2 sm:flex"><Search size={15} className="text-ink/45" /><input className="w-36 bg-transparent text-xs outline-none placeholder:text-ink/40 lg:w-48" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section}…`} /></div><a href="/" className="grid h-9 w-9 place-items-center border border-ink/10 bg-white text-ink/60 hover:text-forest" aria-label="View storefront" title="View storefront"><ExternalLink size={16} /></a><button onClick={loadDashboard} className="grid h-9 w-9 place-items-center border border-ink/10 bg-white text-ink/60 hover:text-forest" aria-label="Refresh dashboard" title="Refresh"><Activity size={16} /></button></div>
        </header>

        <main className="mx-auto max-w-[1450px] p-5 sm:p-8 lg:p-10">
          {error && <div className="mb-5 flex items-center justify-between border-l-2 border-coral bg-coral/10 px-4 py-3 text-sm text-coral"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
          {loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle size={25} className="animate-spin text-forest" /></div> : <>
            {section === 'overview' && <>
              <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs text-ink/50">Here’s what’s happening across your shop.</p><p className="mt-2 text-[10px] uppercase tracking-[.15em] text-ink/40">Updated just now · All amounts USD</p></div><button onClick={() => window.print()} className="inline-flex w-fit items-center gap-2 border border-ink/15 bg-white px-4 py-2.5 text-xs font-semibold hover:border-forest"><Download size={15} /> Export report</button></div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Recognized revenue" value={currency(revenueTotal)} note="Paid orders, net of cancellations" icon={ChartNoAxesCombined} /><StatCard label="Orders this month" value={currentMonthOrders} note={`${orders.length} orders in sample history`} icon={ShoppingBag} /><StatCard label="Products in catalog" value={products.length} note={`${categories.length} active categories`} icon={Boxes} /><StatCard label="Low stock alerts" value={lowStockCount} note="At or below reorder threshold" icon={CircleAlert} tone={lowStockCount ? 'coral' : 'forest'} /></div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
                <section className="border border-ink/10 bg-white p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs text-ink/50">Order value, by day</p><h2 className="mt-1 font-display text-2xl">Sales overview</h2></div><span className="flex items-center gap-1 bg-leaf px-2.5 py-1.5 text-[10px] font-semibold text-forest"><ArrowUpRight size={13} /> Live report</span></div><div className="mt-6 h-[280px] w-full">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#76a08d" stopOpacity={0.28} /><stop offset="100%" stopColor="#76a08d" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#e9ece7" vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#7d8580' }} minTickGap={25} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#7d8580' }} tickFormatter={(value) => `$${value}`} width={52} /><Tooltip formatter={(value) => currency(value)} contentStyle={{ border: '1px solid #e4e7e1', borderRadius: 0, fontSize: 12 }} /><Area type="monotone" dataKey="sales_total" name="Sales" stroke="#275848" strokeWidth={2.5} fill="url(#salesFill)" /></AreaChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-ink/45">No sales activity yet.</div>}</div></section>
                <section className="border border-ink/10 bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs text-ink/50">By units sold</p><h2 className="mt-1 font-display text-2xl">Best sellers</h2></div><button className="text-xs font-semibold text-forest" onClick={() => setSection('products')}>Catalog <ChevronRight size={13} className="inline" /></button></div><div className="mt-5 divide-y divide-ink/10">{reports.bestSellers.slice(0, 5).map((product, index) => <div className="flex items-center gap-3 py-3" key={product.product_id}><span className="w-5 font-display text-sm text-ink/35">0{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{product.product_name}</p><p className="mt-1 text-[10px] text-ink/45">{product.category_name} · {product.units_sold} sold</p></div><p className="text-xs font-semibold">{currency(product.sales_total)}</p></div>)}{!reports.bestSellers.length && <p className="py-7 text-sm text-ink/45">Sales will appear here.</p>}</div></section>
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <section className="border border-ink/10 bg-white"><div className="flex items-center justify-between px-5 py-4"><div><p className="text-xs text-ink/50">Needs a closer look</p><h2 className="font-display text-xl">Inventory watch</h2></div><button className="text-xs font-semibold text-forest" onClick={() => setSection('products')}>All products <ChevronRight size={13} className="inline" /></button></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Product</th><th>Stock</th><th>Status</th></tr></thead><tbody>{reports.inventory.filter((entry) => entry.is_low_stock).slice(0, 5).map((entry) => <tr key={entry.product_id}><td><p className="font-semibold">{entry.product_name}</p><p className="mt-1 text-[10px] text-ink/45">{entry.sku}</p></td><td>{entry.stock_quantity} / {entry.low_stock_threshold} min</td><td><StatusTag value="low stock" /></td></tr>)}{!lowStockCount && <tr><td colSpan="3" className="py-8 text-center text-xs text-ink/45">Everything is comfortably stocked.</td></tr>}</tbody></table></div></section>
                <section className="border border-ink/10 bg-white"><div className="px-5 py-4"><p className="text-xs text-ink/50">Recent activity</p><h2 className="font-display text-xl">Latest orders</h2></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.slice(0, 5).map((order) => <tr key={order.id}><td className="font-semibold">{order.invoice_number}</td><td>{new Date(order.placed_at).toLocaleDateString()}</td><td>{currency(order.total_amount, order.currency)}</td><td><StatusTag value={order.status} /></td></tr>)}</tbody></table></div></section>
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <section className="border border-ink/10 bg-white"><div className="px-5 py-4"><p className="text-xs text-ink/50">Share of product sales</p><h2 className="font-display text-xl">Category performance</h2></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Category</th><th>Units</th><th>Orders</th><th>Product sales</th></tr></thead><tbody>{reports.categories.map((row) => <tr key={`${row.category_id}-${row.currency}`}><td className="font-semibold">{row.category_name}</td><td>{row.units_sold}</td><td>{row.order_count}</td><td>{currency(row.product_sales, row.currency)}</td></tr>)}{!reports.categories.length && <tr><td colSpan="4" className="py-8 text-center text-xs text-ink/45">Category results will appear with sales.</td></tr>}</tbody></table></div></section>
                <section className="border border-ink/10 bg-white"><div className="px-5 py-4"><p className="text-xs text-ink/50">Customer purchase history</p><h2 className="font-display text-xl">Recent customer orders</h2></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Units</th><th>Order total</th></tr></thead><tbody>{reports.customers.slice(0, 6).map((row) => <tr key={row.order_id}><td><p className="font-semibold">{row.first_name} {row.last_name}</p><p className="mt-1 text-[10px] text-ink/45">{row.email}</p></td><td>{row.invoice_number}</td><td>{row.units_purchased}</td><td>{currency(row.total_amount, row.currency)}</td></tr>)}{!reports.customers.length && <tr><td colSpan="4" className="py-8 text-center text-xs text-ink/45">Purchase history will appear with orders.</td></tr>}</tbody></table></div></section>
              </div>
            </>}

            {section === 'products' && <section className="border border-ink/10 bg-white"><div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6"><div><p className="text-xs text-ink/50">Catalog management</p><h2 className="mt-1 font-display text-2xl">Products <span className="font-sans text-sm text-ink/45">({filteredProducts.length})</span></h2></div><div className="flex gap-2"><div className="flex items-center gap-2 border border-ink/15 px-3 sm:hidden"><Search size={14} /><input className="w-full py-2 text-xs outline-none" placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} /></div><button onClick={() => setProductDialog({})} className="inline-flex shrink-0 items-center gap-2 bg-forest px-4 py-2.5 text-xs font-semibold text-white hover:bg-ink"><Plus size={15} /> Add product</button></div></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Inventory</th><th>Availability</th><th className="text-right">Actions</th></tr></thead><tbody>{filteredProducts.map((product) => <tr key={product.id}><td><p className="font-semibold">{product.name}</p><p className="mt-1 text-[10px] text-ink/45">{product.sku}</p></td><td>{product.category_name}</td><td>{currency(product.price)}</td><td>{product.stock_quantity} <span className="text-ink/35">/ {product.low_stock_threshold} min</span></td><td><StatusTag value={product.stock_quantity <= product.low_stock_threshold ? 'low stock' : 'available'} /></td><td><div className="flex justify-end gap-2"><button className="border border-ink/15 px-3 py-1.5 text-[10px] font-semibold hover:border-forest" onClick={() => setProductDialog(product)}>Edit</button><button className="border border-coral/25 px-3 py-1.5 text-[10px] font-semibold text-coral hover:bg-coral/10" onClick={() => archiveProduct(product)}>Archive</button></div></td></tr>)}{!filteredProducts.length && <tr><td colSpan="6" className="py-12 text-center text-sm text-ink/45">No products match this search.</td></tr>}</tbody></table></div></section>}

            {section === 'categories' && <section className="border border-ink/10 bg-white"><div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6"><div><p className="text-xs text-ink/50">Catalog structure</p><h2 className="mt-1 font-display text-2xl">Categories <span className="font-sans text-sm text-ink/45">({categories.length})</span></h2></div><button onClick={() => setCategoryDialog({})} className="inline-flex w-fit items-center gap-2 bg-forest px-4 py-2.5 text-xs font-semibold text-white hover:bg-ink"><Plus size={15} /> Add category</button></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Category</th><th>Slug</th><th>Products</th><th>Status</th><th>Actions</th></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td><p className="font-semibold">{category.name}</p><p className="mt-1 text-[10px] text-ink/45">{category.description}</p></td><td>{category.slug}</td><td>{category.product_count}</td><td><StatusTag value={category.is_active ? 'active' : 'inactive'} /></td><td><div className="flex gap-2"><button className="border border-ink/15 px-3 py-1.5 text-[10px] font-semibold hover:border-forest" onClick={() => setCategoryDialog(category)}>Edit</button>{category.is_active && <button className="border border-coral/25 px-3 py-1.5 text-[10px] font-semibold text-coral hover:bg-coral/10" onClick={() => archiveCategory(category)}>Archive</button>}</div></td></tr>)}</tbody></table></div></section>}

            {section === 'orders' && <section className="border border-ink/10 bg-white"><div className="p-5 sm:p-6"><p className="text-xs text-ink/50">Fulfillment</p><h2 className="mt-1 font-display text-2xl">Orders <span className="font-sans text-sm text-ink/45">({filteredOrders.length})</span></h2><div className="mt-4 flex items-center gap-2 border border-ink/15 px-3 sm:hidden"><Search size={14} /><input className="w-full py-2 text-xs outline-none" placeholder="Search orders" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Payment</th><th>Total</th><th>Status</th><th>Invoice</th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={order.id}><td className="font-semibold">{order.invoice_number}</td><td>{new Date(order.placed_at).toLocaleDateString()}</td><td>{order.customer_name || `Customer #${order.customer_id}`}</td><td><StatusTag value={order.payment_status} /></td><td>{currency(order.total_amount, order.currency)}</td><td><select className="border border-ink/15 bg-transparent px-2 py-1.5 text-xs capitalize" value={order.status} onChange={(event) => updateStatus(order.id, event.target.value)}>{['pending','confirmed','processing','shipped','delivered','cancelled','refunded'].map((status) => <option key={status} value={status}>{status}</option>)}</select></td><td><button className="text-xs font-semibold text-forest underline underline-offset-2" onClick={() => downloadInvoice(order.id).catch((reason) => setError(reason.message))}>PDF</button></td></tr>)}</tbody></table></div></section>}

            {section === 'customers' && <section className="border border-ink/10 bg-white"><div className="p-5 sm:p-6"><p className="text-xs text-ink/50">Customer relationships</p><h2 className="mt-1 font-display text-2xl">Customers <span className="font-sans text-sm text-ink/45">({filteredCustomers.length})</span></h2><div className="mt-4 flex items-center gap-2 border border-ink/15 px-3 sm:hidden"><Search size={14} /><input className="w-full py-2 text-xs outline-none" placeholder="Search customers" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Customer</th><th>Joined</th><th>Orders</th><th>Lifetime value</th><th>Account</th><th>Access</th></tr></thead><tbody>{filteredCustomers.map((entry) => <tr key={entry.id}><td><p className="font-semibold">{entry.first_name} {entry.last_name}</p><p className="mt-1 text-[10px] text-ink/45">{entry.email}</p></td><td>{new Date(entry.created_at).toLocaleDateString()}</td><td>{entry.order_count}</td><td>{currency(entry.lifetime_value)}</td><td><StatusTag value={entry.is_active ? 'active' : 'inactive'} /></td><td><button className="text-xs font-semibold text-forest underline underline-offset-2" onClick={() => toggleCustomer(entry)}>{entry.is_active ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody></table></div></section>}
          </>}
        </main>
      </div>
      {productDialog && <ProductForm product={productDialog.id ? productDialog : null} categories={categories.filter((category) => category.is_active)} onClose={() => setProductDialog(null)} onSaved={loadDashboard} />}
      {categoryDialog && <CategoryForm category={categoryDialog.id ? categoryDialog : null} onClose={() => setCategoryDialog(null)} onSaved={loadDashboard} />}
    </div>
  );
}