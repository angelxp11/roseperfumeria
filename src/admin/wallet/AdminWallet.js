import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { getAuth } from 'firebase/auth';
import { toast } from 'react-toastify';
import './AdminWallet.css';
import { FaExchangeAlt, FaWallet } from 'react-icons/fa';

export default function AdminWallet() {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [fromMethod, setFromMethod] = useState('');
  const [toMethod, setToMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'PAYMENT'));
      const methods = [];
      const balancesMap = {};
      
      snap.forEach(doc => {
        const data = doc.data();
        methods.push({
          id: doc.id,
          name: data.name,
          balance: Number(data.balance || 0)
        });
        balancesMap[data.name] = Number(data.balance || 0);
      });
      
      setPaymentMethods(methods);
      setBalances(balancesMap);
      
      // Set default methods if available
      if (methods.length >= 2) {
        setFromMethod(methods[0].name);
        setToMethod(methods[1].name);
      }
    } catch (err) {
      console.error('Error al cargar métodos de pago:', err);
      toast.error('Error al cargar métodos de pago');
    } finally {
      setLoading(false);
    }
  };

  const getFechaHoyId = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}_${mm}_${yyyy}`;
  };

  const obtenerNombreEmpleado = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user?.email) {
        console.warn('No hay usuario autenticado');
        return 'N/A';
      }

      const emailLower = user.email.toLowerCase();
      const q = query(collection(db, 'EMPLEADOS'), where('email', '==', emailLower));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const nombre = snap.docs[0].data().nombre;
        console.log('Empleado encontrado:', nombre);
        return nombre || 'N/A';
      }
      
      console.warn('No se encontró empleado con email:', emailLower);
      return 'N/A';
    } catch (e) {
      console.error('Error obteniendo nombre empleado:', e);
      return 'N/A';
    }
  };

  const formatNumber = (val) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(val) || 0);

  const handleTransfer = async () => {
    if (!amount || Number(amount) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (fromMethod === toMethod) {
      toast.error('Selecciona cuentas diferentes');
      return;
    }

    if (Number(amount) > balances[fromMethod]) {
      toast.error('Saldo insuficiente');
      return;
    }

    try {
      setTransferLoading(true);
      const fechaHoyId = getFechaHoyId();
      const movRef = doc(db, 'MOVIMIENTOS', fechaHoyId);

      // Update balances in PAYMENT collection
      const fromPaymentDoc = paymentMethods.find(m => m.name === fromMethod);
      const toPaymentDoc = paymentMethods.find(m => m.name === toMethod);

      if (fromPaymentDoc) {
        await setDoc(doc(db, 'PAYMENT', fromPaymentDoc.id), {
          balance: balances[fromMethod] - Number(amount)
        }, { merge: true });
      }

      if (toPaymentDoc) {
        await setDoc(doc(db, 'PAYMENT', toPaymentDoc.id), {
          balance: balances[toMethod] + Number(amount)
        }, { merge: true });
      }

      // Registrar movimiento
      const empleadoNombre = await obtenerNombreEmpleado();
      const movId = String(Date.now());
      const movObj = {
        momento: new Date().toISOString(),
        descripcion: `El empleado ${empleadoNombre} realizó una transferencia de $${formatNumber(amount)} desde ${fromMethod} hacia ${toMethod}. ${description ? `Motivo: ${description}` : ''}`.trim()
      };

      await setDoc(movRef, { [movId]: movObj }, { merge: true });

      toast.success('✓ Transferencia realizada correctamente');
      setShowTransferModal(false);
      setAmount('');
      setDescription('');
      fetchPaymentMethods();
    } catch (err) {
      console.error('Error en transferencia:', err);
      toast.error('Error al realizar la transferencia');
    } finally {
      setTransferLoading(false);
    }
  };

  if (loading) {
    return <div className="wallet-container"><p>Cargando wallet...</p></div>;
  }

  return (
    <div className="wallet-container">
      <div className="wallet-header">
        <FaWallet className="wallet-icon" />
        <h2>Mi Wallet</h2>
      </div>

      <div className="balance-cards">
        {paymentMethods.map((method) => (
          <div key={method.id} className="balance-card">
            <div className="card-method">{method.name}</div>
            <div className="card-balance">${formatNumber(balances[method.name] || 0)}</div>
          </div>
        ))}
      </div>

      <div className="wallet-total-section">
        <h3>Acumulacion de cuentas:</h3>
        <div className="wallet-total-amount">
          ${formatNumber(Object.values(balances).reduce((a, b) => a + b, 0))}
        </div>
      </div>

      <button className="btn-transfer" onClick={() => setShowTransferModal(true)}>
        <FaExchangeAlt />
        Hacer Transferencia
      </button>

      {showTransferModal && (
        <div className="transfer-modal-overlay">
          <div className="transfer-modal">
            <h3>Transferencia de Fondos</h3>

            <div className="transfer-form">
              <div className="form-group">
                <label>De:</label>
                <select value={fromMethod} onChange={(e) => setFromMethod(e.target.value)}>
                  {paymentMethods.filter(m => m.name !== toMethod).map(m => (
                    <option key={m.id} value={m.name}>{m.name} (${formatNumber(balances[m.name] || 0)})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Hacia:</label>
                <select value={toMethod} onChange={(e) => setToMethod(e.target.value)}>
                  {paymentMethods.filter(m => m.name !== fromMethod).map(m => (
                    <option key={m.id} value={m.name}>{m.name} (${formatNumber(balances[m.name] || 0)})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Monto a transferir:</label>
                <input
                  type="text"
                  value={amount !== '' ? formatNumber(amount) : ''}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>

              <div className="form-group">
                <label>Descripción (opcional):</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Cambio de caja, retiro parcial, etc."
                  rows="3"
                />
              </div>

              <div className="transfer-summary">
                <p><strong>De:</strong> {fromMethod} ${formatNumber(balances[fromMethod] || 0)}</p>
                <p><strong>Monto:</strong> ${formatNumber(amount || 0)}</p>
                <p><strong>Hacia:</strong> {toMethod} ${formatNumber(balances[toMethod] || 0)}</p>
              </div>
            </div>

            <div className="modal-buttons">
              <button 
                className="btn-cancelar" 
                onClick={() => setShowTransferModal(false)} 
                disabled={transferLoading}
              >
                Cancelar
              </button>
              <button 
                className="btn-confirmar" 
                onClick={handleTransfer} 
                disabled={transferLoading}
              >
                {transferLoading ? 'Procesando...' : 'Confirmar Transferencia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
