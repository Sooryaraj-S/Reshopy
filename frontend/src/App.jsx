import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, clearSession, getCustomer } from './api';
import Storefront from './Storefront';

const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'));

function AdminRoute() {
  const [customer, setCustomer] = useState(getCustomer());
  const [checking, setChecking] = useState(Boolean(customer));
  const navigate = useNavigate();

  useEffect(() => {
    const refresh = () => setCustomer(getCustomer());
    window.addEventListener('reshopy-session', refresh);
    return () => window.removeEventListener('reshopy-session', refresh);
  }, []);

  useEffect(() => {
    if (!customer) {
      setChecking(false);
      return;
    }
    let active = true;
    api('/auth/me')
      .then(({ customer: profile }) => {
        if (!active) return;
        if (profile.role !== 'admin') {
          clearSession();
          navigate('/', { replace: true, state: { message: 'Administrator access is required.' } });
        } else {
          setCustomer(profile);
        }
      })
      .catch(() => {
        if (active) clearSession();
      })
      .finally(() => active && setChecking(false));
    return () => { active = false; };
  }, []);

  if (checking) return <div className="grid min-h-screen place-items-center text-sm text-ink/60">Checking access…</div>;
  if (!customer || customer.role !== 'admin') return <Navigate to="/" replace />;
  return <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-ink/60">Loading dashboard…</div>}><AdminDashboard /></Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Storefront />} />
      <Route path="/admin/*" element={<AdminRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}