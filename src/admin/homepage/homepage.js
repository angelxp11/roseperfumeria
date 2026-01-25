import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../server/firebase';
import { toast } from 'react-toastify';
import Sidebar from '../../resources/sidebar/menu';
import Facturacion from '../../worker/Facturacion/Facturacion';
import Flujo from '../../worker/flujo/Ingresoandegreso';
import AdminInventario from '../inventario/inventario';
import AdminEmpleados from '../empleados/AdminEmpleados';
import AdminWallet from '../wallet/AdminWallet';
import Facturas from '../facturas/facturas';
import './homepage.css';

export default function AdminHomepage() {
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState('factura');

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName) {
      setUserName(storedName);
    }

    scheduleClearCredentials();
  }, []);

  const scheduleClearCredentials = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);

    const timeUntilClear = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      clearCredentials();
    }, timeUntilClear);
  };

  const clearCredentials = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('userName');
      localStorage.removeItem('userRole');
      window.location.href = '/roseperfumeria';
    } catch (err) {
      console.error('Error al borrar credenciales:', err);
    }
  };

  const handleClearCredentials = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      localStorage.removeItem('userName');
      localStorage.removeItem('userRole');
      toast.success('Credenciales borradas correctamente');
      window.location.href = '/roseperfumeria';
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al borrar credenciales');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="layout">
      <Sidebar onSelect={setSection} onLogout={handleClearCredentials} loading={loading} rol="ADMINISTRADOR" />

      <main className="content">
        <h1>Hola, {userName} 👋</h1>

        {section === 'factura' && (
          <Facturacion />
        )}

        {section === 'flujo' && (
          <Flujo />
        )}

        {section === 'facturas' && (
          <Facturas />
        )}

        {section === 'inventario' && (
          <AdminInventario />
        )}

        {section === 'empleados' && (
          <AdminEmpleados />
        )}

        {section === 'wallet' && (
          <AdminWallet />
        )}
      </main>
    </div>
  );
}
