import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../server/firebase';
import './Login.css';

import Register from './Register';
import ResetPassword from '../password/ResetPassword';

import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // ⏰ Función para obtener el timestamp de la próxima medianoche
  const getMidnightTimestamp = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Siguiente 00:00
    return midnight.getTime();
  };

  // ⏳ Limpiar credenciales si expiraron
  useEffect(() => {
    const expiration = localStorage.getItem('userExpiration');
    if (expiration && Date.now() > Number(expiration)) {
      localStorage.removeItem('userName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userExpiration');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Completa todos los campos');
      return;
    }

    try {
      setLoading(true);

      // 🔐 Login Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 📦 Obtener datos del empleado
      const userDoc = await getDoc(doc(db, 'EMPLEADOS', user.uid));

      if (!userDoc.exists()) {
        toast.error('Usuario no encontrado en la base de datos');
        return;
      }

      const { rol, nombre } = userDoc.data();

      // 💾 Guardar sesión
      localStorage.setItem('userName', nombre);
      localStorage.setItem('userRole', rol);
      localStorage.setItem('userEmail', user.email);
      // ⏰ Guardar expiración a medianoche
      localStorage.setItem('userExpiration', getMidnightTimestamp());

      // Evitar toasts duplicados y asegurar autoClose
      toast.dismiss();
      toast.success('Sesión iniciada correctamente', {
        toastId: 'login-success',
        autoClose: 3000,
        closeOnClick: true,
        pauseOnHover: true,
      });

      // 🧭 Redirección por rol (GitHub Pages SAFE)
      setTimeout(() => {
        if (rol === 'ADMINISTRADOR') {
          navigate('/');
        } else {
          navigate('/');
        }
      }, 1000);

    } catch (err) {
      console.error(err);
      toast.error('Correo o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  // 🔁 Vistas alternas
  if (showRegister) {
    return <Register onClose={() => setShowRegister(false)} />;
  }

  if (showReset) {
    return <ResetPassword onClose={() => setShowReset(false)} />;
  }

  return (
    <div className="login-container">
      {/* Ajuste: autoClose y limit para manejar toasts */}
      <ToastContainer position="top-right" autoClose={3000} limit={3} />
      <form className="login-card" onSubmit={handleSubmit}>
        <h2>Iniciar sesión</h2>

        <div className="input-group">
          <label>Correo electrónico</label>
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            required
          />
        </div>

        <div className="input-group">
          <label>Contraseña</label>
          <div className="password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </div>

        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="secondary-actions">
          <button
            type="button"
            className="link-button"
            onClick={() => setShowReset(true)}
          >
            ¿Olvidaste tu contraseña?
          </button>
          <span className="divider">·</span>
          <button
            type="button"
            className="link-button"
            onClick={() => setShowRegister(true)}
          >
            Crear cuenta
          </button>
        </div>
      </form>
    </div>
  );
}
