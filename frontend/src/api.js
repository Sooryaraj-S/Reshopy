const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export function getToken() {
  return localStorage.getItem('reshopy_token');
}

export function setSession(token, customer) {
  localStorage.setItem('reshopy_token', token);
  localStorage.setItem('reshopy_customer', JSON.stringify(customer));
  window.dispatchEvent(new Event('reshopy-session'));
}

export function clearSession() {
  localStorage.removeItem('reshopy_token');
  localStorage.removeItem('reshopy_customer');
  window.dispatchEvent(new Event('reshopy-session'));
}

export function getCustomer() {
  try {
    return JSON.parse(localStorage.getItem('reshopy_customer') || 'null');
  } catch {
    return null;
  }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (getToken()) headers.set('Authorization', `Bearer ${getToken()}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(payload.error || 'Something went wrong. Please try again.');
  }
  return payload;
}

export async function downloadInvoice(orderId) {
  const response = await fetch(`${API_URL}/orders/${orderId}/invoice`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'The invoice could not be downloaded.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reshopy-invoice-${orderId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const fetchProducts = (params = {}) => {
  const search = new URLSearchParams(params);
  return api(`/products${search.size ? `?${search}` : ''}`);
};

export const fetchCart = () => api('/cart');
export const addCartItem = (product_id, quantity = 1) => api('/cart/items', { method: 'POST', body: JSON.stringify({ product_id, quantity }) });
export const updateCartItem = (id, quantity) => api(`/cart/items/${id}`, { method: 'PUT', body: JSON.stringify({ quantity }) });
export const removeCartItem = (id) => api(`/cart/items/${id}`, { method: 'DELETE' });

export function currency(value, code = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(Number(value || 0));
}