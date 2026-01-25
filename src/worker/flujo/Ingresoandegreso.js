import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { getAuth } from 'firebase/auth';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaMoneyBillWave, FaArrowUp, FaArrowDown, FaExchangeAlt } from 'react-icons/fa';
import './Ingresoandegreso.css';

function getFechaHoyId() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}_${mm}_${yyyy}`;
}

function formatNumber(val) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(val) || 0);
}

async function obtenerNombreEmpleado() {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user?.email) return 'N/A';
    const emailLower = user.email.toLowerCase();
    const snap = await getDocs(collection(db, 'EMPLEADOS'));
    for (const docu of snap.docs) {
      if (docu.data().email?.toLowerCase() === emailLower) {
        return docu.data().nombre || 'N/A';
      }
    }
    return 'N/A';
  } catch {
    return 'N/A';
  }
}

export default function Flujo() {
  const [modal, setModal] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [balances, setBalances] = useState({});
  const [cajaBalances, setCajaBalances] = useState({});
  const [loading, setLoading] = useState(false);

  // Form states
  const [metodo, setMetodo] = useState('');
  const [valor, setValor] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fromMethod, setFromMethod] = useState('');
  const [toMethod, setToMethod] = useState('');
  const [transferValor, setTransferValor] = useState('');
  const [transferDesc, setTransferDesc] = useState('');

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'PAYMENT'));
    const methods = [];
    const balancesMap = {};
    snap.forEach(doc => {
      const data = doc.data();
      methods.push({ id: doc.id, name: data.name, balance: Number(data.balance || 0) });
      balancesMap[data.name] = Number(data.balance || 0);
    });
    setPaymentMethods(methods);
    setBalances(balancesMap);

    // Obtener saldos desde CAJAS (fecha de hoy)
    const fechaHoyId = getFechaHoyId();
    const cajaRef = doc(db, 'CAJAS', fechaHoyId);
    const cajaSnap = await getDoc(cajaRef);
    const cajaData = cajaSnap.exists() ? cajaSnap.data() : {};
    const apertura = cajaData.APERTURA || {};
    const cajaMap = {};
    Object.keys(apertura).forEach(k => {
      cajaMap[k] = Number(apertura[k] || 0);
    });
    setCajaBalances(cajaMap);

    if (methods.length) setMetodo(methods[0].name);
    if (methods.length >= 2) {
      setFromMethod(methods[0].name);
      setToMethod(methods[1].name);
    }
    setLoading(false);
  };

  // --- INGRESO ---
  const handleIngreso = async () => {
    if (!valor || Number(valor) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (!descripcion || !descripcion.trim()) {
      toast.error('Ingresa un motivo para el movimiento');
      return;
    }
    setLoading(true);
    try {
      // Update PAYMENT
      const pm = paymentMethods.find(m => m.name === metodo);
      await setDoc(doc(db, 'PAYMENT', pm.id), {
        balance: balances[metodo] + Number(valor)
      }, { merge: true });

      // Update CAJAS
      const fechaHoyId = getFechaHoyId();
      const cajaRef = doc(db, 'CAJAS', fechaHoyId);
      const cajaSnap = await getDoc(cajaRef);
      let cajaData = cajaSnap.exists() ? cajaSnap.data() : {};
      const prevApertura = cajaData.APERTURA || {};
      const prev = Number(prevApertura[metodo] || 0);
      await setDoc(cajaRef, {
        APERTURA: {
          ...prevApertura,
          [metodo]: prev + Number(valor)
        }
      }, { merge: true });

      // MOVIMIENTOS
      const empleadoNombre = await obtenerNombreEmpleado();
      const movRef = doc(db, 'MOVIMIENTOS', fechaHoyId);
      const movId = String(Date.now());
      const movObj = {
        momento: new Date().toISOString(),
        descripcion: `Ingreso de dinero: $${formatNumber(valor)} a ${metodo}. ${descripcion ? `Motivo: ${descripcion}.` : ''} Realizado por ${empleadoNombre}.`
      };
      await setDoc(movRef, { [movId]: movObj }, { merge: true });

      toast.success('✓ Ingreso realizado');
      setModal(null);
      setValor('');
      setDescripcion('');
      fetchPaymentMethods();
    } catch (e) {
      toast.error('Error al ingresar dinero');
    }
    setLoading(false);
  };

  // --- RETIRO ---
  const handleRetiro = async () => {
    if (!valor || Number(valor) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (!descripcion || !descripcion.trim()) {
      toast.error('Ingresa un motivo para el movimiento');
      return;
    }
    if (Number(valor) > balances[metodo]) {
      toast.error('Saldo insuficiente en Caja');
      return;
    }

    // Verificar saldo en CAJAS
    const fechaHoyId = getFechaHoyId();
    const cajaRef = doc(db, 'CAJAS', fechaHoyId);
    const cajaSnap = await getDoc(cajaRef);
    const cajaData = cajaSnap.exists() ? cajaSnap.data() : {};
    const saldoCaja = Number(cajaData.APERTURA?.[metodo] || 0);

    if (Number(valor) > saldoCaja) {
      toast.error(`❌ No puedes sacar más plata de la que hay en caja. Disponible: $${formatNumber(saldoCaja)}`);
      return;
    }

    setLoading(true);
    try {
      // Update PAYMENT
      const pm = paymentMethods.find(m => m.name === metodo);
      await setDoc(doc(db, 'PAYMENT', pm.id), {
        balance: balances[metodo] - Number(valor)
      }, { merge: true });

      // Update CAJAS
      const prevApertura = cajaData.APERTURA || {};
      const prev = Number(prevApertura[metodo] || 0);
      await setDoc(cajaRef, {
        APERTURA: {
          ...prevApertura,
          [metodo]: prev - Number(valor)
        }
      }, { merge: true });

      // MOVIMIENTOS
      const empleadoNombre = await obtenerNombreEmpleado();
      const movRef = doc(db, 'MOVIMIENTOS', fechaHoyId);
      const movId = String(Date.now());
      const movObj = {
        momento: new Date().toISOString(),
        descripcion: `Retiro de dinero: $${formatNumber(valor)} de ${metodo}. ${descripcion ? `Motivo: ${descripcion}.` : ''} Realizado por ${empleadoNombre}.`
      };
      await setDoc(movRef, { [movId]: movObj }, { merge: true });

      toast.success('✓ Retiro realizado');
      setModal(null);
      setValor('');
      setDescripcion('');
      fetchPaymentMethods();
    } catch (e) {
      toast.error('Error al retirar dinero');
    }
    setLoading(false);
  };

  // --- TRANSFERENCIA ---
  const handleTransfer = async () => {
    if (!transferValor || Number(transferValor) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (!transferDesc || !transferDesc.trim()) {
      toast.error('Ingresa un motivo para el movimiento');
      return;
    }
    if (fromMethod === toMethod) {
      toast.error('Selecciona cuentas diferentes');
      return;
    }
    if (Number(transferValor) > balances[fromMethod]) {
      toast.error('Saldo insuficiente en Caja');
      return;
    }

    // Verificar saldo en CAJAS
    const fechaHoyId = getFechaHoyId();
    const cajaRef = doc(db, 'CAJAS', fechaHoyId);
    const cajaSnap = await getDoc(cajaRef);
    const cajaData = cajaSnap.exists() ? cajaSnap.data() : {};
    const saldoCajaFrom = Number(cajaData.APERTURA?.[fromMethod] || 0);

    if (Number(transferValor) > saldoCajaFrom) {
      toast.error(`❌ No puedes transferir más plata de la que hay en caja. Disponible en ${fromMethod}: $${formatNumber(saldoCajaFrom)}`);
      return;
    }

    setLoading(true);
    try {
      // Update PAYMENT
      const fromPM = paymentMethods.find(m => m.name === fromMethod);
      const toPM = paymentMethods.find(m => m.name === toMethod);
      await setDoc(doc(db, 'PAYMENT', fromPM.id), {
        balance: balances[fromMethod] - Number(transferValor)
      }, { merge: true });
      await setDoc(doc(db, 'PAYMENT', toPM.id), {
        balance: balances[toMethod] + Number(transferValor)
      }, { merge: true });

      // Update CAJAS
      const prevApertura = cajaData.APERTURA || {};
      const prevFrom = Number(prevApertura[fromMethod] || 0);
      const prevTo = Number(prevApertura[toMethod] || 0);
      await setDoc(cajaRef, {
        APERTURA: {
          ...prevApertura,
          [fromMethod]: prevFrom - Number(transferValor),
          [toMethod]: prevTo + Number(transferValor)
        }
      }, { merge: true });

      // MOVIMIENTOS
      const empleadoNombre = await obtenerNombreEmpleado();
      const movRef = doc(db, 'MOVIMIENTOS', fechaHoyId);
      const movId = String(Date.now());
      const movObj = {
        momento: new Date().toISOString(),
        descripcion: `Transferencia de $${formatNumber(transferValor)} de ${fromMethod} a ${toMethod}. ${transferDesc ? `Motivo: ${transferDesc}.` : ''} Realizado por ${empleadoNombre}.`
      };
      await setDoc(movRef, { [movId]: movObj }, { merge: true });

      toast.success('✓ Transferencia realizada');
      setModal(null);
      setTransferValor('');
      setTransferDesc('');
      fetchPaymentMethods();
    } catch (e) {
      toast.error('Error al transferir dinero');
    }
    setLoading(false);
  };

  // --- UI ---
  return (
    <div className="flujo-container-main">
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />

      <div className="flujo-header-main">
        <FaMoneyBillWave className="flujo-header-icon-main" />
        <h2>Flujo de Dinero</h2>
      </div>

      <div className="flujo-buttons-main">
        <button 
          className="flujo-btn-ingreso"
          onClick={() => { setModal('ingreso'); setValor(''); setDescripcion(''); }} 
        >
          <FaArrowUp className="flujo-btn-icon" />
          <span>Ingresar Dinero</span>
        </button>
        <button 
          className="flujo-btn-retiro"
          onClick={() => { setModal('retiro'); setValor(''); setDescripcion(''); }} 
        >
          <FaArrowDown className="flujo-btn-icon" />
          <span>Retirar Dinero</span>
        </button>
        <button 
          className="flujo-btn-transfer"
          onClick={() => { setModal('transfer'); setTransferValor(''); setTransferDesc(''); }} 
        >
          <FaExchangeAlt className="flujo-btn-icon" />
          <span>Transferir Dinero</span>
        </button>
      </div>

      {/* Modal Ingreso */}
      {modal === 'ingreso' && (
        <div className="flujo-modal-overlay">
          <div className="flujo-modal">
            <h3>Ingreso de Dinero</h3>
            <div>
              <label>Método de pago:</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)}>
                {paymentMethods.map(m => (
                  <option key={m.id} value={m.name}>{m.name} (${formatNumber(cajaBalances[m.name] ?? 0)})</option>
                ))}
              </select>
            </div>
            <div>
              <label>Valor:</label>
              <input type="text" value={valor !== '' ? formatNumber(valor) : ''} onChange={e => setValor(e.target.value.replace(/\D/g, ''))} placeholder="0" />
            </div>
            <div>
              <label>Descripción:</label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Motivo del ingreso" rows={2} />
            </div>
            <div className="flujo-modal-buttons">
              <button onClick={() => setModal(null)} disabled={loading}>Cancelar</button>
              <button onClick={handleIngreso} disabled={loading || !(descripcion || '').trim()}>{loading ? 'Procesando...' : 'Confirmar Ingreso'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Retiro */}
      {modal === 'retiro' && (
        <div className="flujo-modal-overlay">
          <div className="flujo-modal">
            <h3>Retiro de Dinero</h3>
            <div>
              <label>Método de pago:</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)}>
                {paymentMethods.map(m => (
                  <option key={m.id} value={m.name}>{m.name} (${formatNumber(cajaBalances[m.name] ?? 0)})</option>
                ))}
              </select>
            </div>
            <div>
              <label>Valor:</label>
              <input type="text" value={valor !== '' ? formatNumber(valor) : ''} onChange={e => setValor(e.target.value.replace(/\D/g, ''))} placeholder="0" />
            </div>
            <div>
              <label>Descripción:</label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Motivo del retiro" rows={2} />
            </div>
            <div className="flujo-modal-buttons">
              <button onClick={() => setModal(null)} disabled={loading}>Cancelar</button>
              <button onClick={handleRetiro} disabled={loading || !(descripcion || '').trim()}>{loading ? 'Procesando...' : 'Confirmar Retiro'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Transferencia */}
      {modal === 'transfer' && (
        <div className="flujo-modal-overlay">
          <div className="flujo-modal">
            <h3>Transferencia de Dinero</h3>
            <div>
              <label>De:</label>
              <select value={fromMethod} onChange={e => setFromMethod(e.target.value)}>
                {paymentMethods.filter(m => m.name !== toMethod).map(m => (
                  <option key={m.id} value={m.name}>{m.name} (${formatNumber(cajaBalances[m.name] ?? 0)})</option>
                ))}
              </select>
            </div>
            <div>
              <label>Hacia:</label>
              <select value={toMethod} onChange={e => setToMethod(e.target.value)}>
                {paymentMethods.filter(m => m.name !== fromMethod).map(m => (
                  <option key={m.id} value={m.name}>{m.name} (${formatNumber(cajaBalances[m.name] ?? 0)})</option>
                ))}
              </select>
            </div>
            <div>
              <label>Monto a transferir:</label>
              <input type="text" value={transferValor !== '' ? formatNumber(transferValor) : ''} onChange={e => setTransferValor(e.target.value.replace(/\D/g, ''))} placeholder="0" />
            </div>
            <div>
              <label>Descripción:</label>
              <textarea value={transferDesc} onChange={e => setTransferDesc(e.target.value)} placeholder="Motivo de la transferencia" rows={2} />
            </div>
            <div className="flujo-modal-buttons">
              <button onClick={() => setModal(null)} disabled={loading}>Cancelar</button>
              <button onClick={handleTransfer} disabled={loading || !(transferDesc || '').trim()}>{loading ? 'Procesando...' : 'Confirmar Transferencia'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
