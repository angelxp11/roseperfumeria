import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, getDoc, query, where, deleteDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { getAuth } from 'firebase/auth';
import { toast } from 'react-toastify';
import './AdminWallet.css';
import { FaExchangeAlt, FaWallet, FaArrowUp, FaArrowDown, FaFileDownload, FaPlus, FaEdit } from 'react-icons/fa'; // agregado FaEdit
import ReportePDFBankStatement from '../../worker/Facturacion/ReportePDF/ReportePDFBankStatement.js';

// NUEVO: importar imágenes desde carpeta images
import images from '../../resources/Images/indesx.js';

const paymentImages = {
  AGROSUR: images.AGROSUR,
  BANCOLOMBIA: images.BANCOLOMBIA,
  EFECTIVO: images.EFECTIVO,
  NEQUI: images.NEQUI,
};

export default function AdminWallet() {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [showRetiroModal, setShowRetiroModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // --- NUEVO: estados para crear método de pago ---
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createBalance, setCreateBalance] = useState('');
  const [createNumber, setCreateNumber] = useState('');
  const [createTitular, setCreateTitular] = useState('');
  const [createType, setCreateType] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // NUEVO: imagen seleccionada para crear/editar método
  const [createImage, setCreateImage] = useState('');
  const [editImage, setEditImage] = useState('');

  // --- NUEVO: estados para editar método de pago ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editTitular, setEditTitular] = useState('');
  const [editType, setEditType] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Transfer states
  const [fromMethod, setFromMethod] = useState('');
  const [toMethod, setToMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  // Ingreso/Retiro states
  const [selectedMethod, setSelectedMethod] = useState('');
  const [operationAmount, setOperationAmount] = useState('');
  const [operationDesc, setOperationDesc] = useState('');
  const [operationLoading, setOperationLoading] = useState(false);

  // PDF states
  const [pdfMethod, setPdfMethod] = useState('');
  const [pdfStartDate, setPdfStartDate] = useState('');
  const [pdfEndDate, setPdfEndDate] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Suscripción en tiempo real a PAYMENT
  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'PAYMENT');
    const unsubscribe = onSnapshot(q, (snap) => {
      const methods = [];
      const balancesMap = {};
      snap.forEach(d => {
        const data = d.data();
        methods.push({
          id: d.id,
          name: data.name,
          balance: Number(data.balance || 0),
          number: data.number || '',
          titular: data.titular || '',
          type: data.type || '',
          image: data.image || ''
        });
        balancesMap[data.name] = Number(data.balance || 0);
      });
      setPaymentMethods(methods);
      setBalances(balancesMap);
      // Set defaults solo si no existen (no sobreescribir selección del usuario)
      setFromMethod(prev => prev || (methods[0]?.name || ''));
      setToMethod(prev => prev || (methods[1]?.name || ''));
      setSelectedMethod(prev => prev || (methods[0]?.name || ''));
      setPdfMethod(prev => prev || (methods[0]?.name || ''));
      setLoading(false);
    }, (err) => {
      console.error('Error escuchando PAYMENT:', err);
      toast.error('Error al recibir actualizaciones de métodos de pago');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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
        return 'N/A';
      }

      const emailLower = user.email.toLowerCase();
      const q = query(collection(db, 'EMPLEADOS'), where('email', '==', emailLower));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        return snap.docs[0].data().nombre || 'N/A';
      }
      
      return 'N/A';
    } catch (e) {
      console.error('Error obteniendo nombre empleado:', e);
      return 'N/A';
    }
  };

  const formatNumber = (val) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(val) || 0);

  // --- INGRESO ---
  const handleIngreso = async () => {
    if (!operationAmount || Number(operationAmount) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (!operationDesc || !operationDesc.trim()) {
      toast.error('Ingresa una descripción');
      return;
    }

    try {
      setOperationLoading(true);
      const fechaHoyId = getFechaHoyId();
      const empleadoNombre = await obtenerNombreEmpleado();
      const paymentDoc = paymentMethods.find(m => m.name === selectedMethod);
      if (!paymentDoc) throw new Error('Método de pago no encontrado');

      const paymentRef = doc(db, 'PAYMENT', paymentDoc.id);
      const movRef = doc(db, 'MOVIMIENTOSPAYMENT', fechaHoyId);
      const movId = String(Date.now());
      const movObj = {
        momento: new Date().toISOString(),
        tipo: 'INGRESO',
        metodo: selectedMethod,
        monto: Number(operationAmount),
        descripcion: `Ingreso de $${formatNumber(operationAmount)} a ${selectedMethod}. ${operationDesc ? `Motivo: ${operationDesc}` : ''} Realizado por ${empleadoNombre}.`
      };

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(paymentRef);
        if (!snap.exists()) throw new Error('Método no encontrado en transacción');
        const saldoAnterior = Number(snap.data().balance || 0);
        const saldoPosterior = saldoAnterior + Number(operationAmount);
        transaction.update(paymentRef, { balance: saldoPosterior });
        transaction.set(movRef, { [movId]: { ...movObj, saldoAnterior, saldoPosterior } }, { merge: true });
      });

      toast.success('✓ Ingreso realizado correctamente');
      setShowIngresoModal(false);
      setOperationAmount('');
      setOperationDesc('');
    } catch (err) {
      console.error('Error en ingreso:', err);
      toast.error('Error al realizar el ingreso');
    } finally {
      setOperationLoading(false);
    }
  };

  // --- RETIRO ---
  const handleRetiro = async () => {
    if (!operationAmount || Number(operationAmount) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (!operationDesc || !operationDesc.trim()) {
      toast.error('Ingresa una descripción');
      return;
    }

    if (Number(operationAmount) > balances[selectedMethod]) {
      toast.error('Saldo insuficiente');
      return;
    }

    try {
      setOperationLoading(true);
      const fechaHoyId = getFechaHoyId();
      const empleadoNombre = await obtenerNombreEmpleado();
      const paymentDoc = paymentMethods.find(m => m.name === selectedMethod);
      if (!paymentDoc) throw new Error('Método de pago no encontrado');

      const paymentRef = doc(db, 'PAYMENT', paymentDoc.id);
      const movRef = doc(db, 'MOVIMIENTOSPAYMENT', fechaHoyId);
      const movId = String(Date.now());
      const movObj = {
        momento: new Date().toISOString(),
        tipo: 'RETIRO',
        metodo: selectedMethod,
        monto: Number(operationAmount),
        descripcion: `Retiro de $${formatNumber(operationAmount)} de ${selectedMethod}. ${operationDesc ? `Motivo: ${operationDesc}` : ''} Realizado por ${empleadoNombre}.`
      };

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(paymentRef);
        if (!snap.exists()) throw new Error('Método no encontrado en transacción');
        const saldoAnterior = Number(snap.data().balance || 0);
        if (Number(operationAmount) > saldoAnterior) throw new Error('Saldo insuficiente en transacción');
        const saldoPosterior = saldoAnterior - Number(operationAmount);
        transaction.update(paymentRef, { balance: saldoPosterior });
        transaction.set(movRef, { [movId]: { ...movObj, saldoAnterior, saldoPosterior } }, { merge: true });
      });

      toast.success('✓ Retiro realizado correctamente');
      setShowRetiroModal(false);
      setOperationAmount('');
      setOperationDesc('');
    } catch (err) {
      console.error('Error en retiro:', err);
      toast.error('Error al realizar el retiro');
    } finally {
      setOperationLoading(false);
    }
  };

  // --- TRANSFERENCIA ---
  const handleTransfer = async () => {
    if (!amount || Number(amount) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (!description || !description.trim()) {
      toast.error('Ingresa una descripción');
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
      const fromDoc = paymentMethods.find(m => m.name === fromMethod);
      const toDoc = paymentMethods.find(m => m.name === toMethod);
      if (!fromDoc || !toDoc) throw new Error('Método origen/destino no encontrado');
      const fromRef = doc(db, 'PAYMENT', fromDoc.id);
      const toRef = doc(db, 'PAYMENT', toDoc.id);
      const movRef = doc(db, 'MOVIMIENTOSPAYMENT', fechaHoyId);
      const empleadoNombre = await obtenerNombreEmpleado();
      const movId = String(Date.now());
      const movObjBase = {
        momento: new Date().toISOString(),
        tipo: 'TRANSFERENCIA',
        desde: fromMethod,
        hacia: toMethod,
        monto: Number(amount),
        descripcion: `Transferencia de $${formatNumber(amount)} de ${fromMethod} a ${toMethod}. ${description ? `Motivo: ${description}` : ''} Realizado por ${empleadoNombre}.`
      };

      await runTransaction(db, async (transaction) => {
        const sFrom = await transaction.get(fromRef);
        const sTo = await transaction.get(toRef);
        if (!sFrom.exists() || !sTo.exists()) throw new Error('Documento no existe en transacción');
        const saldoAnteriorDesde = Number(sFrom.data().balance || 0);
        const saldoAnteriorHacia = Number(sTo.data().balance || 0);
        if (Number(amount) > saldoAnteriorDesde) throw new Error('Saldo insuficiente en transacción');
        const saldoPosteriorDesde = saldoAnteriorDesde - Number(amount);
        const saldoPosteriorHacia = saldoAnteriorHacia + Number(amount);
        transaction.update(fromRef, { balance: saldoPosteriorDesde });
        transaction.update(toRef, { balance: saldoPosteriorHacia });
        transaction.set(movRef, { [movId]: { ...movObjBase, saldoAnteriorDesde, saldoPosteriorDesde, saldoAnteriorHacia, saldoPosteriorHacia } }, { merge: true });
      });

      toast.success('✓ Transferencia realizada correctamente');
      setShowTransferModal(false);
      setAmount('');
      setDescription('');
    } catch (err) {
      console.error('Error en transferencia:', err);
      toast.error('Error al realizar la transferencia');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!pdfMethod) {
      toast.error('Selecciona un método de pago');
      return;
    }

    if (!pdfStartDate || !pdfEndDate) {
      toast.error('Selecciona fechas de inicio y fin');
      return;
    }

    const start = new Date(pdfStartDate + 'T00:00:00');
    const end = new Date(pdfEndDate + 'T23:59:59');

    if (start > end) {
      toast.error('La fecha de inicio no puede ser posterior a la fecha final');
      return;
    }

    try {
      setPdfLoading(true);
      await ReportePDFBankStatement.generateBankStatement(pdfMethod === 'todos' ? null : pdfMethod, start, end);
      toast.success('✓ PDF generado correctamente');
      setShowPdfModal(false);
      setPdfStartDate('');
      setPdfEndDate('');
    } catch (err) {
      console.error('Error generando PDF:', err);
      toast.error('Error al generar el PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  // --- NUEVO: crear método de pago ---
  const generatePaymentId = async () => {
    // encuentra el máximo entre los IDs numéricos existentes y genera el siguiente con padding 12
    let max = 0;
    paymentMethods.forEach(m => {
      if (/^\d+$/.test(m.id)) {
        const n = Number(m.id);
        if (n > max) max = n;
      }
    });
    let next = max + 1;
    let candidate = String(next).padStart(12, '0');
    // asegurar unicidad consultando Firestore (evita race conditions)
    // incrementa hasta que no exista el documento
    while ((await getDoc(doc(db, 'PAYMENT', candidate))).exists()) {
      next += 1;
      candidate = String(next).padStart(12, '0');
    }
    return candidate;
  };

  const handleCreateMethod = async () => {
    if (!createName || !createName.trim()) {
      toast.error('Ingresa el nombre del método');
      return;
    }
    if (createBalance === '' || Number(createBalance) < 0) {
      toast.error('Ingresa un balance válido');
      return;
    }
    // Para EFECTIVO no es necesario número/titular (decidimos por el tipo seleccionado)
    const isEfectivoCreate = (createType || '').trim().toUpperCase() === 'EFECTIVO';
    if (!isEfectivoCreate) {
      if (!createNumber || !createNumber.trim()) {
        toast.error('Ingresa el número de cuenta');
        return;
      }
      if (!createTitular || !createTitular.trim()) {
        toast.error('Ingresa el titular');
        return;
      }
    }
    if (!createType || !(createType || '').trim()) {
      toast.error('Ingresa el tipo');
      return;
    }
 
    try {
      setCreateLoading(true);
      const newDoc = {
        name: createName.trim(),
        balance: Number(createBalance) || 0,
        number: createNumber.trim(),
        titular: createTitular.trim(),
        type: createType.trim(),
        image: createImage ? createImage.trim() : '' // <-- guardar clave de imagen
      };
      const paymentId = await generatePaymentId();
      await setDoc(doc(db, 'PAYMENT', paymentId), newDoc);
      toast.success('✓ Método de pago creado correctamente');
      setShowCreateModal(false);
      setCreateName('');
      setCreateBalance('');
      setCreateNumber('');
      setCreateTitular('');
      setCreateType('');
      setCreateImage('');
    } catch (err) {
      console.error('Error creando método de pago:', err);
      toast.error('Error al crear método de pago');
    } finally {
      setCreateLoading(false);
    }
   };

   // Abre el modal de edición con los datos del método seleccionado
   const openEditModal = (method) => {
     setEditId(method.id);
     setEditName(method.name || '');
     setEditBalance(method.balance !== undefined ? String(method.balance) : '');
     setEditNumber(method.number || '');
     setEditTitular(method.titular || '');
     setEditType(method.type || '');
     setEditImage(method.image || ''); // <-- cargar imagen existente
     setShowEditModal(true);
   };
 
   const handleDeleteMethod = async () => {
     if (!editId) return;
     const ok = window.confirm('¿Eliminar método de pago? Esta acción no se puede deshacer.');
     if (!ok) return;
     try {
       setEditLoading(true);
       await deleteDoc(doc(db, 'PAYMENT', editId));
       toast.success('✓ Método eliminado correctamente');
       setShowEditModal(false);
       // limpiar y refrescar
       setEditId(''); setEditName(''); setEditBalance(''); setEditNumber(''); setEditTitular(''); setEditType('');
     } catch (err) {
       console.error('Error eliminando método:', err);
       toast.error('Error al eliminar método');
     } finally {
       setEditLoading(false);
     }
   };
 
   const handleUpdateMethod = async () => {
    if (!editName || !editName.trim()) { toast.error('Ingresa el nombre del método'); return; }
    if (editBalance === '' || Number(editBalance) < 0) { toast.error('Ingresa un balance válido'); return; }
    // Para EFECTIVO no es necesario número/titular (decidido por el tipo)
    const isEfectivoEdit = (editType || '').trim().toUpperCase() === 'EFECTIVO';
    if (!isEfectivoEdit) {
      if (!editNumber || !editNumber.trim()) { toast.error('Ingresa el número de cuenta'); return; }
      if (!editTitular || !editTitular.trim()) { toast.error('Ingresa el titular'); return; }
    }
    if (!editType || !(editType || '').trim()) { toast.error('Ingresa el tipo'); return; }
 
     try {
       setEditLoading(true);
       const payload = {
         name: editName.trim(),
         balance: Number(editBalance) || 0,
         number: editNumber.trim(),
         titular: editTitular.trim(),
         type: editType.trim(),
         image: editImage ? editImage.trim() : '' // <-- guardar clave de imagen
       };
       await setDoc(doc(db, 'PAYMENT', editId), payload, { merge: true });
       toast.success('✓ Método actualizado correctamente');
       setShowEditModal(false);
       // limpiar y refrescar
       setEditId(''); setEditName(''); setEditBalance(''); setEditNumber(''); setEditTitular(''); setEditType('');
       setEditImage('');
     } catch (err) {
       console.error('Error actualizando método:', err);
       toast.error('Error al actualizar método');
     } finally {
       setEditLoading(false);
     }
   };

  // Mejorado: buscar imagen por clave/nombre en import images
  const getImageForMethod = (name) => {
    if (!name) return '';
    // si ya es la clave exacta
    if (images[name]) return images[name];
    const key = String(name).trim().toUpperCase().replace(/\s+/g, '');
    if (images[key]) return images[key];
    // fallback: intentar variantes básicas
    const alt = String(name).trim().toUpperCase();
    if (images[alt]) return images[alt];
    return '';
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
          <div
            key={method.id}
            className={`balance-card ${method.image || getImageForMethod(method.name) ? 'background-image' : ''}`}
            style={ (method.image && getImageForMethod(method.image)) || getImageForMethod(method.name) ? { backgroundImage: `url(${ getImageForMethod(method.image || method.name) })` } : {} }
          >
            <div className="card-content">
              {/* Si no hay imagen de fondo, mostrar icono pequeño */}
              {!((method.image && getImageForMethod(method.image)) || getImageForMethod(method.name)) && getImageForMethod(method.name) && (
                <img src={getImageForMethod(method.name)} alt={`${method.name} icon`} style={{ width: 40, height: 40, objectFit: 'contain', marginRight: 8 }} />
              )}
              <div className="card-method">{method.name}</div>
              <div className="card-balance">${formatNumber(balances[method.name] || 0)}</div>
              {/* meta info y botón editar */}
              <div className="card-meta">
                <div>
                  <span style={{ display: 'block' }}>{method.type ? method.type : ''}</span>
                  <span style={{ display: 'block', fontSize: 11 }}>{method.number ? `# ${method.number}` : ''}</span>
                </div>
                <button className="btn-edit-medio" onClick={() => openEditModal(method)}>
                  <FaEdit /> Editar
                </button>
              </div>
            </div>
          </div>
         ))}
       </div>

      <div className="wallet-total-section">
        <h3>Acumulacion de cuentas:</h3>
        <div className="wallet-total-amount">
          ${formatNumber(Object.values(balances).reduce((a, b) => a + b, 0))}
        </div>
      </div>

      <div className="wallet-operations">
        <button className="btn-ingreso" onClick={() => { setShowIngresoModal(true); setOperationAmount(''); setOperationDesc(''); }}>
          <FaArrowUp />
          Ingresar Dinero
        </button>
        <button className="btn-retiro" onClick={() => { setShowRetiroModal(true); setOperationAmount(''); setOperationDesc(''); }}>
          <FaArrowDown />
          Retirar Dinero
        </button>
        <button className="btn-transfer" onClick={() => setShowTransferModal(true)}>
          <FaExchangeAlt />
          Transferir Dinero
        </button>
        <button className="btn-pdf" onClick={() => { setShowPdfModal(true); setPdfStartDate(''); setPdfEndDate(''); }}>
          <FaFileDownload />
          Generar PDF
        </button>

        {/* NUEVO: Botón crear método de pago */}
        <button className="btn-crear-medio" onClick={() => { setShowCreateModal(true); setCreateName(''); setCreateBalance(''); setCreateNumber(''); setCreateTitular(''); setCreateType(''); }}>
          <FaPlus />
          Crear método de pago
        </button>
      </div>

      {/* Modal Ingreso */}
      {showIngresoModal && (
        <div className="transfer-modal-overlay">
          <div className="transfer-modal">
            <h3>Ingreso de Dinero</h3>
            <div className="transfer-form">
              <div className="form-group">
                <label>Método de pago:</label>
                <select value={selectedMethod} onChange={(e) => setSelectedMethod(e.target.value)}>
                  {paymentMethods.map(m => (
                    <option key={m.id} value={m.name}>{m.name} (${formatNumber(balances[m.name] || 0)})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Monto:</label>
                <input
                  type="text"
                  value={operationAmount !== '' ? formatNumber(operationAmount) : ''}
                  onChange={(e) => setOperationAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>
              <div className="form-group">
                <label>Descripción:</label>
                <textarea
                  value={operationDesc}
                  onChange={(e) => setOperationDesc(e.target.value)}
                  placeholder="Motivo del ingreso"
                  rows="3"
                />
              </div>
            </div>
            <div className="modal-buttons">
              <button className="btn-cancelar" onClick={() => setShowIngresoModal(false)} disabled={operationLoading}>
                Cancelar
              </button>
              <button className="btn-confirmar" onClick={handleIngreso} disabled={operationLoading || !operationDesc.trim()}>
                {operationLoading ? 'Procesando...' : 'Confirmar Ingreso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Retiro */}
      {showRetiroModal && (
        <div className="transfer-modal-overlay">
          <div className="transfer-modal">
            <h3>Retiro de Dinero</h3>
            <div className="transfer-form">
              <div className="form-group">
                <label>Método de pago:</label>
                <select value={selectedMethod} onChange={(e) => setSelectedMethod(e.target.value)}>
                  {paymentMethods.map(m => (
                    <option key={m.id} value={m.name}>{m.name} (${formatNumber(balances[m.name] || 0)})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Monto:</label>
                <input
                  type="text"
                  value={operationAmount !== '' ? formatNumber(operationAmount) : ''}
                  onChange={(e) => setOperationAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>
              <div className="form-group">
                <label>Descripción:</label>
                <textarea
                  value={operationDesc}
                  onChange={(e) => setOperationDesc(e.target.value)}
                  placeholder="Motivo del retiro"
                  rows="3"
                />
              </div>
            </div>
            <div className="modal-buttons">
              <button className="btn-cancelar" onClick={() => setShowRetiroModal(false)} disabled={operationLoading}>
                Cancelar
              </button>
              <button className="btn-confirmar" onClick={handleRetiro} disabled={operationLoading || !operationDesc.trim()}>
                {operationLoading ? 'Procesando...' : 'Confirmar Retiro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Transferencia */}
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
                <label>Descripción:</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Motivo de la transferencia"
                  rows="3"
                />
              </div>
              <div className="transfer-summary">
                <p><strong>De:</strong> {fromMethod} ${formatNumber(balances[fromMethod] || 0)}</p>
                <p><strong> monto:</strong> ${formatNumber(amount || 0)}</p>
                <p><strong>Hacia:</strong> {toMethod} ${formatNumber(balances[toMethod] || 0)}</p>
              </div>
            </div>
            <div className="modal-buttons">
              <button className="btn-cancelar" onClick={() => setShowTransferModal(false)} disabled={transferLoading}>
                Cancelar
              </button>
              <button className="btn-confirmar" onClick={handleTransfer} disabled={transferLoading || !description.trim()}>
                {transferLoading ? 'Procesando...' : 'Confirmar Transferencia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal PDF */}
      {showPdfModal && (
        <div className="transfer-modal-overlay">
          <div className="transfer-modal">
            <h3>Generar Estado de Cuenta</h3>
            <div className="transfer-form">
              <div className="form-group">
                <label>Método de pago:</label>
                <select value={pdfMethod} onChange={(e) => setPdfMethod(e.target.value)}>
                  <option value="">Selecciona un método</option>
                  <option value="todos">Todos los métodos</option>
                  {paymentMethods.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Fecha de inicio:</label>
                <input
                  type="date"
                  value={pdfStartDate}
                  onChange={(e) => setPdfStartDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Fecha de fin:</label>
                <input
                  type="date"
                  value={pdfEndDate}
                  onChange={(e) => setPdfEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-buttons">
              <button className="btn-cancelar" onClick={() => setShowPdfModal(false)} disabled={pdfLoading}>
                Cancelar
              </button>
              <button className="btn-confirmar" onClick={handleGeneratePDF} disabled={pdfLoading || !pdfMethod || !pdfStartDate || !pdfEndDate}>
                {pdfLoading ? 'Generando...' : 'Generar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Método de Pago */}
      {showCreateModal && (
        <div className="transfer-modal-overlay">
          <div className="transfer-modal">
            <h3>Crear Método de Pago</h3>
            <div className="transfer-form">
              <div className="form-group">
                <label>Nombre:</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Nombre del método"
                />
              </div>
              <div className="form-group">
                <label>Balance inicial:</label>
                <input
                  type="text"
                  value={createBalance !== '' ? formatNumber(createBalance) : ''}
                  onChange={(e) => setCreateBalance(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>
              <div className="form-group">
                <label>Tipo:</label>
                <select value={createType} onChange={(e) => setCreateType(e.target.value)}>
                  <option value="">Selecciona un tipo</option>
                  <option value="AHORRO">AHORRO</option>
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                </select>
              </div>
              
              {/* Si el tipo es EFECTIVO, no mostramos número/titular */}
              {(createType || '').trim().toUpperCase() !== 'EFECTIVO' && (
                <>
                  <div className="form-group">
                    <label>Número de cuenta:</label>
                    <input
                      type="text"
                      value={createNumber}
                      onChange={(e) => setCreateNumber(e.target.value)}
                      placeholder="Número de cuenta"
                    />
                  </div>
                  <div className="form-group">
                    <label>Titular:</label>
                    <input
                      type="text"
                      value={createTitular}
                      onChange={(e) => setCreateTitular(e.target.value)}
                      placeholder="Titular de la cuenta"
                    />
                  </div>
                </>
              )}
              
             <div className="form-group">
               <label>Seleccionar imagen (opcional):</label>
               <div className="preset-grid">
                 {Object.keys(images).map((k) => (
                   <button
                     key={k}
                     type="button"
                     className={`preset-thumb ${createImage === k ? 'selected' : ''}`}
                     onClick={() => setCreateImage(createImage === k ? '' : k)}
                     style={{ backgroundImage: `url(${images[k]})` }}
                   />
                 ))}
               </div>
               {createImage && (
                 <div className="preview-row" style={{ marginTop: 8 }}>
                   <div className="preview-img" style={{ backgroundImage: `url(${getImageForMethod(createImage)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                   <button className="btn-remove-img" onClick={() => setCreateImage('')}>Quitar</button>
                 </div>
               )}
             </div>
            </div>
            <div className="modal-buttons">
              <button className="btn-cancelar" onClick={() => setShowCreateModal(false)} disabled={createLoading}>
                Cancelar
              </button>
              <button className="btn-confirmar" onClick={handleCreateMethod} disabled={createLoading || !createName.trim() || !(createType || '').trim() || ((createType || '').trim().toUpperCase() !== 'EFECTIVO' && (!createNumber.trim() || !createTitular.trim()))}>
                {createLoading ? 'Creando...' : 'Crear Método'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Método de Pago */}
      {showEditModal && (
        <div className="transfer-modal-overlay">
          <div className="transfer-modal">
            <h3>Editar Método de Pago</h3>
            <div className="transfer-form">
              <div className="form-group">
                <label>Nombre:</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre del método" />
              </div>
              <div className="form-group">
                <label>Balance:</label>
                <input
                  type="text"
                  value={editBalance !== '' ? formatNumber(editBalance) : ''}
                  onChange={(e) => setEditBalance(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>
              <div className="form-group">
                <label>Tipo:</label>
                <select value={editType} onChange={(e) => setEditType(e.target.value)}>
                  <option value="">Selecciona un tipo</option>
                  <option value="AHORRO">AHORRO</option>
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                </select>
              </div>
 
              {/* Para EFECTIVO ocultamos número/titular */}
              {(editType || '').trim().toUpperCase() !== 'EFECTIVO' && (
                <>
                  <div className="form-group">
                    <label>Número de cuenta:</label>
                    <input type="text" value={editNumber} onChange={(e) => setEditNumber(e.target.value)} placeholder="Número de cuenta" />
                  </div>
                  <div className="form-group">
                    <label>Titular:</label>
                    <input type="text" value={editTitular} onChange={(e) => setEditTitular(e.target.value)} placeholder="Titular" />
                  </div>
                </>
              )}
              
             <div className="form-group">
               <label>Seleccionar imagen (opcional):</label>
               <div className="preset-grid">
                 {Object.keys(images).map((k) => (
                   <button
                     key={k}
                     type="button"
                     className={`preset-thumb ${editImage === k ? 'selected' : ''}`}
                     onClick={() => setEditImage(editImage === k ? '' : k)}
                     style={{ backgroundImage: `url(${images[k]})` }}
                   />
                 ))}
               </div>
               {editImage && (
                 <div className="preview-row" style={{ marginTop: 8 }}>
                   <div className="preview-img" style={{ backgroundImage: `url(${getImageForMethod(editImage)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                   <button className="btn-remove-img" onClick={() => setEditImage('')}>Quitar</button>
                 </div>
               )}
             </div>

            </div>
            <div className="modal-buttons">
              <button className="btn-cancelar" onClick={() => setShowEditModal(false)} disabled={editLoading}>Cancelar</button>
              <button className="btn-delete-medio" onClick={handleDeleteMethod} disabled={editLoading}>
                {editLoading ? '...' : 'Eliminar'}
              </button>
              <button className="btn-confirmar" onClick={handleUpdateMethod} disabled={editLoading || !editName.trim() || !(editType || '').trim() || ((editType || '').trim().toUpperCase() !== 'EFECTIVO' && (!editNumber.trim() || !editTitular.trim()))}>
                {editLoading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
