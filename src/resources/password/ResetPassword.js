import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../server/firebase';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './ResetPassword.css';

export default function ResetPassword({ onClose }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();

    if (!email) {
      toast.error('Ingresa un correo válido');
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, email);

      // ✅ Toast de éxito
      toast.success('Correo de recuperación enviado');

      // ✅ Limpiar input
      setEmail('');
    } catch (err) {
      const msg =
        err?.code === 'auth/user-not-found'
          ? 'El correo no está registrado'
          : 'Error al enviar el correo de recuperación';

      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <ToastContainer position="top-right" />
      <form className="login-card" onSubmit={handleReset}>
        <h2>Recuperar contraseña</h2>

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

        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar instrucciones'}
        </button>

        <div className="secondary-actions">
          <button type="button" className="link-button" onClick={onClose}>
            Volver
          </button>
        </div>
      </form>
    </div>
  );
}
