import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Heart, Leaf, LoaderCircle, LockKeyhole, Menu, Minus, Plus, Search, ShoppingBag, Sparkles, UserRound, X } from 'lucide-react';
import { addCartItem, api, clearSession, currency, downloadInvoice, fetchCart, fetchProducts, getCustomer, getToken, removeCartItem, setSession, updateCartItem } from './api';

const heroImage = 'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=1600&q=85';

function ProductCard({ product, onAdd, added }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="group reveal">
      <div className="relative aspect-[4/5] overflow-hidden bg-[#e8e7df]">
        {product.image_url && !imageFailed ? (
          <img className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" src={product.image_url} alt={product.name} onError={() => setImageFailed(true)} loading="lazy" />
        ) : (
          <div className="surface-grid grid h-full place-items-center text-forest/60"><Leaf size={38} strokeWidth={1.2} /></div>
        )}
        {product.stock_quantity <= product.low_stock_threshold && product.stock_quantity > 0 && (
          <span className="absolute left-3 top-3 bg-paper px-3 py-1 text-[10px] font-semibold uppercase tracking-[.15em]">Almost gone</span>
        )}
        {product.stock_quantity === 0 && <span className="absolute left-3 top-3 bg-ink px-3 py-1 text-[10px] font-semibold uppercase tracking-[.15em] text-white">Sold out</span>}
        <button
          className="absolute bottom-3 right-3 grid h-11 w-11 translate-y-2 place-items-center bg-white text-ink opacity-0 shadow-sm transition hover:bg-forest hover:text-white group-hover:translate-y-0 group-hover:opacity-100 focus:translate-y-0 focus:opacity-100"
          type="button" aria-label={`Add ${product.name} to bag`} title="Add to bag" disabled={!product.stock_quantity} onClick={() => onAdd(product)}
        >
          {added ? <Check size={17} /> : <Plus size={18} />}
        </button>
        <button className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink/70 transition hover:text-coral" type="button" aria-label={`Save ${product.name}`} title="Save item"><Heart size={16} /></button>
      </div>
      <div className="flex items-start justify-between gap-3 pt-3.5">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-forest/70">{product.category_name}</p>
          <h3 className="font-display text-[17px] leading-snug">{product.name}</h3>
        </div>
        <p className="pt-4 text-sm font-semibold tabular-nums">{currency(product.price)}</p>
      </div>
    </article>
  );
}

function AccountDialog({ open, onClose, onSignedIn, customer, onSignOut }) {
  const [mode, setMode] = useState('login');
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' });
  const [profileForm, setProfileForm] = useState({});
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !customer || !getToken()) return;
    Promise.all([api('/auth/me'), api('/orders')])
      .then(([me, history]) => {
        setProfile(me.customer);
        setProfileForm(me.customer);
        setOrders(history.orders || []);
      })
      .catch((reason) => setError(reason.message));
  }, [open, customer]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setMessage('');
  }, [open, mode]);

  if (!open) return null;

  async function submitAuth(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const response = await api(endpoint, { method: 'POST', body: JSON.stringify(form) });
      setSession(response.token, response.customer);
      onSignedIn(response.customer);
      setProfile(response.customer);
      setMessage(mode === 'register' ? 'Your account is ready.' : 'Welcome back.');
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await api('/auth/me', { method: 'PATCH', body: JSON.stringify(profileForm) });
      setProfile(response.customer); setMessage('Your details have been saved.');
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  async function changePassword(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await api('/auth/change-password', { method: 'POST', body: JSON.stringify(passwordForm) });
      setMessage(response.message); setPasswordForm({ current_password: '', new_password: '' });
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="relative max-h-[min(90vh,820px)] w-full max-w-2xl overflow-y-auto bg-paper p-6 shadow-soft sm:p-9" role="dialog" aria-modal="true" aria-label="Your Reshopy account">
        <button className="absolute right-4 top-4 grid h-10 w-10 place-items-center hover:bg-black/5" onClick={onClose} aria-label="Close account dialog"><X size={18} /></button>
        <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-forest">Reshopy / Your account</p>
        {customer ? (
          <>
            <div className="mt-3 flex items-end justify-between gap-3 border-b border-ink/10 pb-5">
              <div><h2 className="font-display text-3xl">Hello, {profile?.first_name || customer.first_name}</h2><p className="mt-1 text-sm text-ink/55">{profile?.email || customer.email}</p></div>
              <button className="text-xs font-semibold text-coral underline underline-offset-4" onClick={() => { clearSession(); onSignOut(); setProfile(null); setOrders([]); }}>Sign out</button>
            </div>
            <div className="mt-6 grid gap-8 md:grid-cols-[1fr_1fr]">
              <form onSubmit={saveProfile} className="space-y-3">
                <h3 className="font-display text-xl">Personal details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="field-label">First name<input required className="field-input" value={profileForm.first_name || ''} onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })} /></label>
                  <label className="field-label">Last name<input required className="field-input" value={profileForm.last_name || ''} onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })} /></label>
                </div>
                <label className="field-label">Phone<input className="field-input" value={profileForm.phone || ''} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} /></label>
                <label className="field-label">Address<input className="field-input" value={profileForm.address_line1 || ''} onChange={(e) => setProfileForm({ ...profileForm, address_line1: e.target.value })} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="field-label">City<input className="field-input" value={profileForm.city || ''} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} /></label>
                  <label className="field-label">Postal code<input className="field-input" value={profileForm.postal_code || ''} onChange={(e) => setProfileForm({ ...profileForm, postal_code: e.target.value })} /></label>
                </div>
                <button disabled={busy} className="action-button w-full">Save details</button>
              </form>
              <div>
                <h3 className="font-display text-xl">Order history</h3>
                <div className="mt-3 max-h-52 divide-y divide-ink/10 overflow-y-auto border-y border-ink/10">
                  {orders.length ? orders.map((order) => <div className="flex items-center justify-between gap-2 py-3 text-sm" key={order.id}><div><p className="font-semibold">{order.invoice_number}</p><p className="mt-1 text-xs capitalize text-ink/50">{order.status}</p><button className="mt-1 text-[10px] font-semibold text-forest underline underline-offset-2" onClick={() => downloadInvoice(order.id).catch((reason) => setError(reason.message))}>Download invoice</button></div><div className="text-right"><p>{currency(order.total_amount, order.currency)}</p><p className="mt-1 text-xs text-ink/45">{new Date(order.placed_at).toLocaleDateString()}</p></div></div>) : <p className="py-5 text-sm text-ink/50">Your orders will appear here.</p>}
                </div>
                <form onSubmit={changePassword} className="mt-6 space-y-3">
                  <h3 className="font-display text-xl">Password</h3>
                  <label className="field-label">Current password<input required type="password" autoComplete="current-password" className="field-input" value={passwordForm.current_password} onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })} /></label>
                  <label className="field-label">New password<input required minLength="10" type="password" autoComplete="new-password" className="field-input" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} /></label>
                  <button disabled={busy} className="action-button w-full">Update password</button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-3 font-display text-3xl">{mode === 'login' ? 'Welcome back' : 'Make it yours'}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-ink/60">{mode === 'login' ? 'Sign in to see your saved details, current bag and order history.' : 'A few details and you’re ready to shop.'}</p>
            <form className="mt-7 space-y-4" onSubmit={submitAuth}>
              {mode === 'register' && <div className="grid grid-cols-2 gap-3"><label className="field-label">First name<input required maxLength="80" className="field-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label><label className="field-label">Last name<input required maxLength="80" className="field-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label></div>}
              <label className="field-label">Email address<input required type="email" autoComplete="email" className="field-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className="field-label">Password<input required minLength={mode === 'register' ? 10 : 1} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} className="field-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              {error && <p className="text-sm text-coral" role="alert">{error}</p>}{message && <p className="text-sm text-forest" role="status">{message}</p>}
              <button disabled={busy} className="action-button flex w-full items-center justify-center gap-2">{busy && <LoaderCircle size={16} className="animate-spin" />}{mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={16} /></button>
            </form>
            <p className="mt-5 text-center text-sm text-ink/60">{mode === 'login' ? 'New to Reshopy?' : 'Already have an account?'}{' '}<button className="font-semibold text-forest underline underline-offset-4" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
          </>
        )}
        {error && customer && <p className="mt-4 text-sm text-coral" role="alert">{error}</p>}{message && customer && <p className="mt-4 text-sm text-forest" role="status">{message}</p>}
      </section>
    </div>
  );
}

function CartDrawer({ open, onClose, items, subtotal, onQuantity, onRemove, customer, onLogin, onCheckout }) {
  const [checkout, setCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState({ shipping_name: '', shipping_address1: '', shipping_city: '', shipping_postal_code: '', shipping_country: 'US', payment_method: 'card' });
  useEffect(() => {
    if (!open || !customer) return;
    api('/auth/me').then(({ customer: profile }) => setDetails((current) => ({ ...current, shipping_name: `${profile.first_name} ${profile.last_name}`, shipping_address1: profile.address_line1 || '', shipping_city: profile.city || '', shipping_postal_code: profile.postal_code || '', shipping_country: profile.country_code || 'US' }))).catch(() => {});
  }, [open, customer]);
  if (!open) return null;

  async function submitCheckout(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await api('/orders', { method: 'POST', body: JSON.stringify(details) });
      onCheckout(response.order); setCheckout(false);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink/40" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="ml-auto flex h-full w-full max-w-[480px] flex-col bg-paper shadow-soft" aria-label="Shopping bag">
        <header className="flex items-center justify-between border-b border-ink/10 px-6 py-5"><div><p className="text-[10px] uppercase tracking-[.2em] text-forest">Your selection</p><h2 className="font-display text-2xl">The bag <span className="font-sans text-sm text-ink/50">({items.reduce((sum, item) => sum + item.quantity, 0)})</span></h2></div><button className="grid h-10 w-10 place-items-center hover:bg-black/5" onClick={onClose} aria-label="Close bag"><X size={19} /></button></header>
        {checkout ? (
          <form onSubmit={submitCheckout} className="flex flex-1 flex-col overflow-y-auto p-6">
            <button type="button" onClick={() => setCheckout(false)} className="mb-6 inline-flex items-center gap-2 self-start text-xs font-semibold uppercase tracking-wider text-forest"><ChevronLeft size={15} />Back to bag</button>
            <h3 className="font-display text-2xl">Delivery details</h3><p className="mt-1 text-sm text-ink/55">Your order is reserved once it’s placed.</p>
            <div className="mt-6 space-y-4">
              <label className="field-label">Full name<input required className="field-input" value={details.shipping_name} onChange={(e) => setDetails({ ...details, shipping_name: e.target.value })} /></label>
              <label className="field-label">Street address<input required className="field-input" value={details.shipping_address1} onChange={(e) => setDetails({ ...details, shipping_address1: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-3"><label className="field-label">City<input required className="field-input" value={details.shipping_city} onChange={(e) => setDetails({ ...details, shipping_city: e.target.value })} /></label><label className="field-label">Postal code<input required className="field-input" value={details.shipping_postal_code} onChange={(e) => setDetails({ ...details, shipping_postal_code: e.target.value })} /></label></div>
              <div className="grid grid-cols-2 gap-3"><label className="field-label">Country code<input required minLength="2" maxLength="2" className="field-input uppercase" value={details.shipping_country} onChange={(e) => setDetails({ ...details, shipping_country: e.target.value.toUpperCase() })} /></label><label className="field-label">Payment method<select className="field-input" value={details.payment_method} onChange={(e) => setDetails({ ...details, payment_method: e.target.value })}><option value="card">Card</option><option value="paypal">PayPal</option><option value="cash_on_delivery">Cash on delivery</option></select></label></div>
            </div>
            {error && <p className="mt-4 text-sm text-coral" role="alert">{error}</p>}
            <div className="mt-auto border-t border-ink/10 pt-5"><div className="flex justify-between text-sm"><span>Subtotal</span><span>{currency(subtotal)}</span></div><p className="mt-2 text-xs text-ink/45">Shipping and applicable taxes are confirmed at dispatch.</p><button className="action-button mt-5 w-full" disabled={busy}>{busy ? 'Placing order…' : `Place order · ${currency(subtotal)}`}</button></div>
          </form>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6">
              {!items.length ? <div className="grid h-full content-center justify-items-center text-center"><div className="grid h-16 w-16 place-items-center rounded-full bg-leaf text-forest"><ShoppingBag size={23} /></div><h3 className="mt-5 font-display text-2xl">A little room for lovely things.</h3><p className="mt-2 text-sm text-ink/55">Your bag is waiting for its first find.</p><button onClick={onClose} className="mt-5 text-sm font-semibold text-forest underline underline-offset-4">Keep exploring</button></div> : <div className="divide-y divide-ink/10">{items.map((item) => <article className="flex gap-4 py-5" key={item.product_id}><img src={item.image_url} alt="" className="h-24 w-20 bg-[#e8e7df] object-cover" /><div className="flex min-w-0 flex-1 flex-col"><div className="flex justify-between gap-3"><div><h3 className="font-display leading-snug">{item.name}</h3><p className="mt-1 text-xs text-ink/50">{currency(item.price)} each</p></div><p className="text-sm font-semibold">{currency(item.line_total)}</p></div><div className="mt-auto flex items-center justify-between"><div className="flex items-center border border-ink/15"><button className="grid h-8 w-8 place-items-center hover:bg-black/5" aria-label="Decrease quantity" onClick={() => onQuantity(item.product_id, Math.max(1, item.quantity - 1))}><Minus size={13} /></button><span className="min-w-8 text-center text-xs">{item.quantity}</span><button className="grid h-8 w-8 place-items-center hover:bg-black/5" aria-label="Increase quantity" onClick={() => onQuantity(item.product_id, Math.min(item.stock_quantity, item.quantity + 1))}><Plus size={13} /></button></div><button className="text-xs text-ink/45 underline underline-offset-4 hover:text-coral" onClick={() => onRemove(item.product_id)}>Remove</button></div></div></article>)}</div>}
            </div>
            {!!items.length && <footer className="border-t border-ink/10 px-6 py-5"><div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold">{currency(subtotal)}</span></div><p className="mt-2 text-xs text-ink/45">Shipping and taxes calculated at checkout.</p><button className="action-button mt-5 w-full" onClick={() => customer ? setCheckout(true) : onLogin()}>{customer ? 'Continue to checkout' : 'Sign in to checkout'}<ArrowRight size={16} /></button></footer>}
          </>
        )}
      </aside>
    </div>
  );
}

export default function Storefront() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customer, setCustomer] = useState(getCustomer());
  const [cartItems, setCartItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [addedId, setAddedId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);

  useEffect(() => {
    const refresh = () => setCustomer(getCustomer());
    window.addEventListener('reshopy-session', refresh);
    return () => window.removeEventListener('reshopy-session', refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    fetchProducts({ ...(query ? { q: query } : {}), ...(selectedCategory ? { category_id: selectedCategory } : {}), sort })
      .then((data) => { if (active) { setProducts(data.products); setCategories(data.categories); } })
      .catch((reason) => { if (active) setError(reason.message); })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [query, selectedCategory, sort]);

  async function refreshCart() {
    if (!getToken()) { setCartItems([]); setSubtotal(0); return; }
    try { const data = await fetchCart(); setCartItems(data.items); setSubtotal(data.subtotal); }
    catch (reason) { setError(reason.message); }
  }
  useEffect(() => { refreshCart(); }, [customer]);

  async function handleAdd(product) {
    if (!getToken()) { setAccountOpen(true); setNotice('Sign in to add items to your bag.'); return; }
    try {
      await addCartItem(product.id, 1); await refreshCart(); setAddedId(product.id); setNotice(`${product.name} added to your bag.`);
      window.setTimeout(() => setAddedId(null), 1200);
    } catch (reason) { setError(reason.message); }
  }

  async function handleQuantity(id, quantity) {
    try { const data = await updateCartItem(id, quantity); setCartItems(data.items); setSubtotal(data.subtotal); }
    catch (reason) { setError(reason.message); }
  }

  async function handleRemove(id) {
    try { const data = await removeCartItem(id); setCartItems(data.items); setSubtotal(data.subtotal); }
    catch (reason) { setError(reason.message); }
  }

  function completeOrder(order) {
    setCartItems([]); setSubtotal(0); setCartOpen(false);
    setNotice(`Order ${order.invoice_number} placed. Thank you.`);
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="flex min-h-9 items-center justify-center bg-forest px-4 text-center text-[10px] font-medium uppercase tracking-[.18em] text-white sm:text-[11px]">Good things, thoughtfully found <span className="mx-2 text-citrus">✳</span> Complimentary shipping over $100</div>
      <header className="relative z-20 border-b border-ink/10 bg-paper">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <button className="grid h-10 w-10 place-items-center md:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu"><Menu size={20} /></button>
          <nav className="hidden items-center gap-7 md:flex"><a href="#shop" className="nav-link">Shop all</a><a href="#story" className="nav-link">Our point of view</a><a href="#shop" className="nav-link">New in</a></nav>
          <a href="/" className="absolute left-1/2 -translate-x-1/2 font-display text-[27px] font-semibold tracking-[.02em]">reshopy<span className="text-coral">.</span></a>
          <div className="flex items-center gap-1 sm:gap-2">
            <button className="icon-button hidden sm:grid" onClick={() => setSearchOpen(!searchOpen)} aria-label="Search products" title="Search"><Search size={18} /></button>
            {customer?.role === 'admin' && <a className="hidden px-3 py-2 text-xs font-semibold text-forest sm:block" href="/admin">Admin</a>}
            <button className="icon-button" onClick={() => setAccountOpen(true)} aria-label={customer ? 'Your account' : 'Sign in'} title="Account"><UserRound size={18} /></button>
            <button className="relative icon-button" onClick={() => setCartOpen(true)} aria-label={`Shopping bag, ${cartCount} items`} title="Bag"><ShoppingBag size={18} />{cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[9px] text-white">{cartCount}</span>}</button>
          </div>
        </div>
        {searchOpen && <div className="border-t border-ink/10 px-5 py-3 sm:px-8"><div className="mx-auto flex max-w-5xl items-center gap-3"><Search size={17} className="text-forest" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search objects, materials, little rituals…" className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-ink/40" /><button onClick={() => { setQuery(''); setSearchOpen(false); }} className="text-xs text-ink/50">Clear</button></div></div>}
        {mobileMenu && <nav className="grid gap-1 border-t border-ink/10 px-6 py-4 md:hidden"><a onClick={() => setMobileMenu(false)} href="#shop" className="py-2 text-sm">Shop all</a><a onClick={() => setMobileMenu(false)} href="#story" className="py-2 text-sm">Our point of view</a>{customer?.role === 'admin' && <a href="/admin" className="py-2 text-sm text-forest">Admin dashboard</a>}</nav>}
      </header>

      <main>
        <section className="relative mx-auto grid min-h-[560px] max-w-[1440px] overflow-hidden lg:min-h-[660px] lg:grid-cols-[.86fr_1.14fr]">
          <div className="relative z-10 flex flex-col justify-center px-6 py-14 sm:px-10 lg:px-16 xl:px-24">
            <p className="reveal flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-forest"><Sparkles size={14} /> A little more considered</p>
            <h1 className="reveal mt-6 max-w-xl font-display text-[46px] leading-[1.06] sm:text-[58px] lg:text-[64px]">Keep what<br />makes a <em className="font-medium text-forest">difference.</em></h1>
            <p className="reveal mt-5 max-w-sm text-sm leading-7 text-ink/65">Useful, beautiful things for the everyday. Selected slowly, made to stay, and always a pleasure to bring home.</p>
            <a className="reveal mt-8 inline-flex w-fit items-center gap-3 border-b border-forest pb-2 text-xs font-semibold uppercase tracking-[.15em] text-forest transition hover:gap-5" href="#shop">Find your next favorite <ArrowDownRight size={16} /></a>
            <div className="mt-12 flex items-center gap-3 text-xs text-ink/50"><span className="grid h-9 w-9 place-items-center rounded-full bg-leaf text-forest"><Leaf size={16} /></span> Made for living with, not just looking at.</div>
          </div>
          <div className="relative min-h-[360px] overflow-hidden lg:min-h-full">
            <img src={heroImage} alt="Warm, natural home interior with considered objects" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-paper/20 via-transparent to-transparent lg:from-paper/30" />
            <div className="absolute bottom-5 left-5 flex items-center gap-3 bg-paper/90 px-4 py-3 backdrop-blur-sm sm:bottom-8 sm:left-8"><span className="h-8 w-8 bg-[url('https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=100&q=75')] bg-cover bg-center" /><div><p className="text-[9px] uppercase tracking-[.16em] text-ink/50">The edit / No. 04</p><p className="font-display text-sm">Objects that feel like home</p></div><ArrowRight size={15} className="ml-4 text-forest" /></div>
          </div>
        </section>

        <section id="story" className="border-y border-ink/10 bg-[#e9eee7] px-5 py-7 sm:px-10">
          <div className="mx-auto flex max-w-[1250px] flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><p className="font-display text-xl sm:text-2xl">Less, but better. <em className="text-forest">For the life you actually live.</em></p><div className="flex gap-7 text-[10px] font-semibold uppercase tracking-[.15em] text-ink/60"><span className="flex items-center gap-2"><Leaf size={14} className="text-forest" /> Small makers</span><span className="flex items-center gap-2"><LockKeyhole size={13} className="text-forest" /> Thoughtful materials</span></div></div>
        </section>

        <section id="shop" className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-coral">The Reshopy selection</p><h2 className="mt-2 font-display text-4xl sm:text-5xl">Find your everyday.</h2></div><div className="flex items-center gap-2 text-xs text-ink/55"><span className="hidden sm:inline">Selected with intention</span><span className="h-px w-8 bg-coral" /><span>{products.length} objects</span></div></div>
          <div className="mt-8 flex flex-col justify-between gap-4 border-y border-ink/10 py-4 sm:flex-row sm:items-center">
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:pb-0"><button className={`filter-pill ${!selectedCategory ? 'filter-pill-active' : ''}`} onClick={() => setSelectedCategory('')}>Everything</button>{categories.map((category) => <button key={category.id} className={`filter-pill ${String(category.id) === selectedCategory ? 'filter-pill-active' : ''}`} onClick={() => setSelectedCategory(String(category.id))}>{category.name}</button>)}</div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-ink/55">Sort by <select className="max-w-36 bg-transparent py-2 font-medium text-ink outline-none" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Just arrived</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name</option></select><ChevronDown size={13} /></label>
          </div>
          {notice && <div className="mt-5 flex items-center justify-between border-l-2 border-forest bg-leaf/60 px-4 py-3 text-sm text-forest" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}
          {error && <div className="mt-5 flex items-center justify-between border-l-2 border-coral bg-coral/10 px-4 py-3 text-sm text-coral" role="alert"><span>{error} Is the API server running?</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
          {loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-forest" size={25} /></div> : products.length ? <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-7 lg:gap-y-12">{products.map((product) => <ProductCard key={product.id} product={product} onAdd={handleAdd} added={addedId === product.id} />)}</div> : <div className="py-20 text-center"><p className="font-display text-2xl">Nothing in this corner just yet.</p><button className="mt-3 text-sm text-forest underline underline-offset-4" onClick={() => { setSelectedCategory(''); setQuery(''); }}>See everything</button></div>}
          <div className="mt-14 flex items-center justify-between border-t border-ink/10 pt-5 text-xs text-ink/55"><span>Curated for the long run.</span><a href="#top" className="inline-flex items-center gap-2 font-semibold uppercase tracking-widest text-forest">Back to top <ChevronRight size={14} /></a></div>
        </section>
      </main>

      <footer className="bg-ink px-5 py-11 text-white sm:px-10"><div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-8 sm:flex-row sm:items-end"><div><p className="font-display text-3xl">reshopy<span className="text-coral">.</span></p><p className="mt-2 max-w-sm text-xs leading-6 text-white/55">Everyday things, chosen for how they make a life feel.</p></div><div className="flex gap-7 text-xs text-white/65"><a href="#shop" className="hover:text-white">Shop</a><a href="#story" className="hover:text-white">Our point of view</a><button onClick={() => setAccountOpen(true)} className="hover:text-white">Your account</button></div><p className="text-[10px] uppercase tracking-[.14em] text-white/40">© Reshopy 2026</p></div></footer>

      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} onSignedIn={(profile) => { setCustomer(profile); setNotice('You are signed in. Welcome to Reshopy.'); }} customer={customer} onSignOut={() => { setCustomer(null); setCartItems([]); setSubtotal(0); setNotice('You have signed out.'); }} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={cartItems} subtotal={subtotal} onQuantity={handleQuantity} onRemove={handleRemove} customer={customer} onLogin={() => { setCartOpen(false); setAccountOpen(true); }} onCheckout={completeOrder} />
    </div>
  );
}