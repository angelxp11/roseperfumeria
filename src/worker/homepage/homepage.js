import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../server/firebase';
import { toast } from 'react-toastify';
import '../../resources/colors/colors.css';
import Sidebar from '../../resources/sidebar/menu';
import Facturacion from '../Facturacion/Facturacion';
import Flujo from '../flujo/Ingresoandegreso';
import './homepage.css';

export default function WorkerHomepage() {
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState('factura');
  const [rol, setRol] = useState(''); // Estado para el rol del usuario

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    const storedRol = localStorage.getItem('rol'); // Obtener el rol almacenado
    if (storedName) setUserName(storedName);
    if (storedRol) setRol(storedRol); // Establecer el rol en el estado
    scheduleClearCredentials();
  }, []);

  const scheduleClearCredentials = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    setTimeout(clearCredentials, tomorrow - now);
  };

  const clearCredentials = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      window.location.href = '/roseperfumeria';
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearCredentials = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      localStorage.clear();
      toast.success('Credenciales borradas correctamente');
      window.location.href = '/roseperfumeria';
    } catch {
      toast.error('Error al borrar credenciales');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="layout">
      <Sidebar onSelect={setSection} onLogout={handleClearCredentials} loading={loading} rol={rol} />

      <main className="content">
        <h1>Hola, {userName} 👋</h1>

        {section === 'factura' && (
          <Facturacion />
        )}

        {section === 'inventario' && (
          <div className="section-card">
            <h2>📦 Inventario</h2>
            <p>Aquí irá el módulo de inventario</p>
          </div>
        )}

        {section === 'flujo' && (
          <Flujo />
        )}
      </main>
    </div>
  );
}
