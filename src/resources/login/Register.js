import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../server/firebase';
import './Register.css';
import ResetPassword from '../password/ResetPassword';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Register({ onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      const msg = 'La contraseña debe tener al menos 6 caracteres.';
      setError(msg);
      toast.error(msg.toLowerCase());
      return;
    }

    if (password !== confirmPassword) {
      const msg = 'Las contraseñas no coinciden.';
      setError(msg);
      toast.error(msg.toLowerCase());
      return;
    }

    try {
      setLoading(true);

      // 🔐 Crear usuario en Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      // 🗄️ Guardar empleado en Firestore (colección en minúsculas)
      await setDoc(doc(db, 'EMPLEADOS', user.uid), {
        nombre: name,
        email: email.toLowerCase(),
        rol: 'EMPLEADO',
        createdAt: new Date()
      });

      const successMsg = 'Usuario registrado correctamente';
      console.log(successMsg);
      toast.success(successMsg.toLowerCase());

      if (onClose) onClose();
    } catch (err) {
      console.error(err);
      const msg = err?.message ?? 'Error al registrar el usuario. Intenta nuevamente.';
      setError(msg);
      toast.error(msg.toLowerCase()); // Show error in toast
    } finally {
      setLoading(false);
    }
  };

  if (showReset) {
    return (
      <ResetPassword
        onClose={() => setShowReset(false)}
        onBackToLogin={onClose}
      />
    );
  }

  return (
    <div className="login-container">
      <ToastContainer position="top-right" />
      <form className="login-card" onSubmit={handleRegister}>
        <h2>Registro</h2>

        <div className="input-group">
          <label>Nombre</label>
          <input
            type="text"
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            required
          />
        </div>

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

        <div className="input-group">
          <label>Confirmar contraseña</label>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Repite la contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'Registrando...' : 'Registrar'}
        </button>

        <div className="secondary-actions">
          <button
            type="button"
            className="link-button"
            onClick={() => setShowReset(true)}
          >
            ¿Olvidaste tu contraseña?
          </button>

          {onClose && (
            <>
              <span className="divider">·</span>
              <button
                type="button"
                className="link-button"
                onClick={onClose}
              >
                Volver a iniciar sesión
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
