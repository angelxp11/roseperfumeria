import { useState, useEffect } from 'react';
import { GiMoneyStack } from 'react-icons/gi';
import { FaDivide, FaCcMastercard } from 'react-icons/fa';
import { FaMoneyBillTransfer } from 'react-icons/fa6';
import { ToastContainer, toast } from 'react-toastify';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  increment,
  setDoc,
  query,
  where
} from 'firebase/firestore';

import { db } from '../../../../server/firebase';
import Carga from '../../../../resources/Carga/Carga';
import './metododepago.css';

export default function MetodoDePago({ total, onClose, onCompletarCompra, items = [] }) {
  const [metodoSeleccionado, setMetodoSeleccionado] = useState('efectivo');
  const [montoEntregado, setMontoEntregado] = useState('');
  const [cuentaTransferencia, setCuentaTransferencia] = useState(null);
  const [metodos, setMetodos] = useState({
    primero: null,
    segundo: null,
    montoPrimero: '',
    cuentaPrimero: null,
    cuentaSegundo: null
  });
  const [metodosPago, setMetodosPago] = useState([]);
  const [cargando, setCargando] = useState(false);

  const denominaciones = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

  /* =======================
     CARGAR PAYMENT
  ======================= */
  useEffect(() => {
    const cargarMetodos = async () => {
      const snap = await getDocs(collection(db, 'PAYMENT'));
      // Excluir métodos cuyo type === 'AHORRO' (case-insensitive)
      const data = snap.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .filter(m => ((m.type || '').toString().trim().toUpperCase() !== 'AHORRO'));
      setMetodosPago(data);
    };

    cargarMetodos();
  }, []);

  // detectar efectivo incluso si tiene type 'EFECTIVO' o no tiene type
  const efectivo = metodosPago.find(m => !(m.type) || (m.type || '').toString().trim().toUpperCase() === 'EFECTIVO');
  const transferencias = metodosPago.filter(m => (m.type || '').toString().trim().toUpperCase() === 'TRANSFERENCIA');
  const todosMetodos = metodosPago;
 
  // Incrementar balance en PAYMENT (docId) usando increment para evitar race conditions
  const incrementarPayment = async (docId, monto) => {
    try {
      if (!docId || Number(monto) === 0) return;
      const ref = doc(db, 'PAYMENT', docId);
      await updateDoc(ref, { balance: increment(Number(monto)) });
    } catch (e) {
      console.error('Error incrementando PAYMENT:', e);
    }
  };

  /* =======================
     HELPERS
  ======================= */
const descontarInsumosPorFormula = async (items = []) => {
  console.log('🟡 Iniciando descuento de insumos');
  console.log('🟡 Items recibidos:', items);

  for (const item of items) {
    console.log('➡️ Procesando item:', item);
    console.log('   id:', item.id);
    console.log('   name:', item.name);
    console.log('   idFormula:', item.idFormula);
    console.log('   idEsencia:', item.idEsencia);
    console.log('   documentId:', item.documentId);
    console.log('   cantidad:', item.cantidad);

    const cantidad = Number(item.cantidad) || 0;

    if (cantidad <= 0) {
      console.warn('❌ Cantidad inválida, se omite');
      continue;
    }

    /* =================================================
       CASO 1: PRODUCTO CON FÓRMULA
    ================================================= */
    if (item.idFormula) {
      console.log('📦 CASO 1: Producto con fórmula');

      // 1️⃣ Obtener fórmula
      console.log('🔍 Buscando fórmula:', item.idFormula);

      const formulaRef = doc(db, 'FORMULAS', item.idFormula);
      const formulaSnap = await getDoc(formulaRef);

      if (!formulaSnap.exists()) {
        console.error('❌ NO existe la fórmula:', item.idFormula);
        continue;
      }

      const formula = formulaSnap.data();
      console.log('✅ Fórmula encontrada:', formula);

      // 2️⃣ Insumos generales (ALCOHOL, FIJADOR, FEROMONAS)
      const insumos = [
        { id: 'ALCOHOL', campo: 'alcohol' },
        { id: 'FIJADOR', campo: 'fijadorgr' },
        { id: 'FEROMONAS', campo: 'feromonasgotas' }
      ];

      for (const insumo of insumos) {
        const valor = Number(formula[insumo.campo]) || 0;
        const total = valor * cantidad;

        console.log(`🧪 Insumo ${insumo.id}`);
        console.log(`   Valor por unidad: ${valor}`);
        console.log(`   Total a descontar: ${total}`);

        if (total <= 0) {
          console.warn(`⚠️ No se descuenta ${insumo.id} (total <= 0)`);
          continue;
        }

        try {
          const ref = doc(db, 'INSUMOS', insumo.id);
          await updateDoc(ref, {
            stock: increment(-total)
          });
          console.log(`✅ Descontado ${total} de ${insumo.id}`);
        } catch (error) {
          console.error(`🔥 Error descontando ${insumo.id}`, error);
        }
      }

      // 3️⃣ Esencia específica (por idEsencia)
      if (item.idEsencia) {
        const esenciaUsada = Number(formula.esenciagr) || 0;
        const totalEsencia = esenciaUsada * cantidad;

        console.log('🌸 Esencia específica:', item.idEsencia);
        console.log('   Total a descontar:', totalEsencia);

        if (totalEsencia > 0) {
          try {
            const esenciaRef = doc(db, 'ESENCIA', item.idEsencia);
            await updateDoc(esenciaRef, {
              stock: increment(-totalEsencia)
            });
            console.log(`✅ Descontada esencia ${totalEsencia}`);
          } catch (error) {
            console.error('🔥 Error descontando ESENCIA', error);
          }
        }
      } else {
        console.warn('⚠️ Item sin idEsencia');
      }

      continue;
    }

    /* =================================================
       CASO 2: PRODUCTO NORMAL (SIN FÓRMULA)
    ================================================= */
    console.log('📦 CASO 2: Producto normal sin fórmula');

    if (item.documentId) {
      try {
        const productoRef = doc(db, 'PRODUCTOS', item.documentId);
        console.log(`✏️ Descontando ${cantidad} del producto ${item.documentId}`);

        await updateDoc(productoRef, {
          stock: increment(-cantidad)
        });

        console.log(`✅ Descontado ${cantidad} del producto`);
      } catch (error) {
        console.error('🔥 Error descontando stock del producto', error);
      }
    } else {
      console.warn('⚠️ Item sin documentId');
    }
  }

  console.log('🟢 Fin descuento de insumos');
};





  const formatearPrecio = (valor) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(valor || 0);

  const calcularVuelto = () => Number(montoEntregado || 0) - total;
  const calcularMontoSegundo = () => total - Number(metodos.montoPrimero || 0);

  const fechaHoyId = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}_${mm}_${yyyy}`;
  };

  const obtenerClaveCaja = (docId) => {
    const p = metodosPago.find(m => m.docId === docId);
    if (!p) return 'TRANSFERENCIA';
    const name = (p.name || '').toLowerCase();
    if (name.includes('nequi')) return 'NEQUI';
    if (name.includes('bancolombia')) return 'BANCOLOMBIA';
    return 'TRANSFERENCIA';
  };

  const obtenerNombreMetodoPago = (docId) => {
    const p = metodosPago.find(m => m.docId === docId);
    return p?.name || 'Desconocido';
  };

  const incrementarCaja = async (clave, monto) => {
		const id = fechaHoyId();
		const ref = doc(db, 'CAJAS', id);
		await setDoc(ref, { 
			APERTURA: {
				[clave]: increment(Number(monto))
			}
		}, { merge: true });
	};

  const crearFactura = async (metodo, montoTotal, detalleMetodos) => {
    try {
      const fechaHoyId_val = fechaHoyId();
      const facturaRef = doc(db, 'FACTURAS', fechaHoyId_val);
      const facturaId = String(Date.now());

      const productosDetalles = items
        .map(item => ({
          id: item.id || item.documentId || 'N/A',
          nombre: item.nombre || item.name || 'Producto sin nombre',
          cantidad: item.cantidad || 0,
          precio_unitario: item.precio || item.price || 0,
          subtotal: (item.cantidad || 0) * (item.precio || item.price || 0),
          // NEW: preservar campos útiles para restaurar stock en caso de cancelación
          documentId: item.documentId || null,
          idFormula: item.idFormula || null,
          idEsencia: item.idEsencia || null
        }))
        .filter(p => p.nombre && p.cantidad > 0);

      const facturaObj = {
        fecha: new Date().toISOString(),
        productos: productosDetalles.length > 0 ? productosDetalles : [],
        total: montoTotal || 0,
        metodo_pago: detalleMetodos && typeof detalleMetodos === 'object' ? detalleMetodos : {},
        estado: 'COMPLETADA'
      };

      await setDoc(facturaRef, { [facturaId]: facturaObj }, { merge: true });
    } catch (e) {
      console.error('Error creando factura:', e);
      throw e;
    }
  };

  /* =======================
     COMPLETAR COMPRA
  ======================= */
  const handleCompletarCompra = async () => {
    try {
      setCargando(true);

      if (metodoSeleccionado === 'efectivo') {
        if (Number(montoEntregado) < total) {
          toast.error('Dinero insuficiente');
          setCargando(false);
          return;
        }
        // incrementar CAJA y PAYMENT (si existe método EFECTIVO)
        if (efectivo) {
          await incrementarCaja('EFECTIVO', total);
          await incrementarPayment(efectivo.docId, total);
        } else {
          // fallback: sólo caja
          await incrementarCaja('EFECTIVO', total);
        }
        await crearFactura('Efectivo', total, { metodo: 'Efectivo' });
      }

      if (metodoSeleccionado === 'transferencia') {
        if (cuentaTransferencia) {
          const clave = obtenerClaveCaja(cuentaTransferencia);
          const nombreMetodo = obtenerNombreMetodoPago(cuentaTransferencia);
          await incrementarCaja(clave, total);
          // actualizar PAYMENT por docId
          await incrementarPayment(cuentaTransferencia, total);
          await crearFactura(nombreMetodo, total, { metodo: nombreMetodo });
        }
      }

      if (metodoSeleccionado === 'dividido') {
        const monto1 = Number(metodos.montoPrimero) || 0;
        const monto2 = total - monto1;
        
        let detalleMetodos = [];

        if (metodos.primero === 'efectivo' && efectivo) {
          await incrementarCaja('EFECTIVO', monto1);
          await incrementarPayment(efectivo.docId, monto1);
          detalleMetodos.push({ metodo: 'Efectivo', monto: monto1 });
        }
        if (metodos.primero === 'transferencia' && metodos.cuentaPrimero) {
          await incrementarCaja(obtenerClaveCaja(metodos.cuentaPrimero), monto1);
          await incrementarPayment(metodos.cuentaPrimero, monto1);
          const nombreMetodo = obtenerNombreMetodoPago(metodos.cuentaPrimero);
          detalleMetodos.push({ metodo: nombreMetodo, monto: monto1 });
        }
        if (metodos.segundo === 'efectivo' && efectivo) {
          await incrementarCaja('EFECTIVO', monto2);
          await incrementarPayment(efectivo.docId, monto2);
          detalleMetodos.push({ metodo: 'Efectivo', monto: monto2 });
        }
        if (metodos.segundo === 'transferencia' && metodos.cuentaSegundo) {
          await incrementarCaja(obtenerClaveCaja(metodos.cuentaSegundo), monto2);
          await incrementarPayment(metodos.cuentaSegundo, monto2);
          const nombreMetodo = obtenerNombreMetodoPago(metodos.cuentaSegundo);
          detalleMetodos.push({ metodo: nombreMetodo, monto: monto2 });
        }

        await crearFactura('Dividido', total, detalleMetodos);
      }

      if (metodoSeleccionado === 'tarjeta') {
        // si existe un PAYMENT para tarjeta, incrementar su balance
        const tarjetaMethod = metodosPago.find(m => (m.type || '').toString().trim().toUpperCase() === 'TARJETA' || (m.name || '').toLowerCase().includes('tarjeta'));
        if (tarjetaMethod) {
          await incrementarPayment(tarjetaMethod.docId, total);
        }
        await crearFactura('Tarjeta', total, { metodo: 'Tarjeta' });
      }
      // después de crear factura y actualizar caja
      await descontarInsumosPorFormula(items);

      toast.success('¡Pago realizado con éxito!');
      setTimeout(() => {
        setCargando(false);
        onCompletarCompra();
        onClose();
      }, 2000);
    } catch (e) {
      console.error('Error:', e);
      toast.error('Error procesando el pago');
      setCargando(false);
    }
  };

  if (cargando) {
    return (
      <>
        <Carga />
        <ToastContainer />
      </>
    );
  }

  /* =======================
     UI
  ======================= */
  return (
    <div className="overlay">
      <div className="modal-pago">
        {/* SIDEBAR */}
        <div className="metodos-sidebar">
          <button 
            className={`metodo-btn ${metodoSeleccionado === 'efectivo' ? 'active' : ''}`}
            onClick={() => setMetodoSeleccionado('efectivo')}
          >
            <GiMoneyStack size={24} />
            <span>Efectivo</span>
          </button>
          <button 
            className={`metodo-btn ${metodoSeleccionado === 'transferencia' ? 'active' : ''}`}
            onClick={() => setMetodoSeleccionado('transferencia')}
          >
            <FaMoneyBillTransfer size={24} />
            <span>Transferencia</span>
          </button>
          <button 
            className={`metodo-btn ${metodoSeleccionado === 'dividido' ? 'active' : ''}`}
            onClick={() => setMetodoSeleccionado('dividido')}
          >
            <FaDivide size={24} />
            <span>Dividido</span>
          </button>
          <button 
            className={`metodo-btn ${metodoSeleccionado === 'tarjeta' ? 'active' : ''}`}
            onClick={() => setMetodoSeleccionado('tarjeta')}
          >
            <FaCcMastercard size={24} />
            <span>Tarjeta</span>
          </button>
        </div>

        {/* CONTENIDO */}
        <div className="contenido-pago">
          {metodoSeleccionado === 'efectivo' && (
            <div className="efectivo-content">
              <h3>Pago en Efectivo</h3>
              <div className="total-info">
                <p>Total: <strong>${formatearPrecio(total)}</strong></p>
              </div>
              <div className="recibo-section">
                <label>Recibo:</label>
                <input 
                  type="text"
                  readOnly
                  value={formatearPrecio(montoEntregado)}
                  className="recibo-input"
                />
              </div>
              <div className="denominaciones">
                {denominaciones.map(d => (
                  <button
                    key={d}
                    className="denom-btn"
                    onClick={() => setMontoEntregado(Number(montoEntregado || 0) + d)}
                  >
                    ${formatearPrecio(d)}
                  </button>
                ))}
              </div>
              <button className="btn-limpiar" onClick={() => setMontoEntregado('')}>
                Borrar
              </button>
              {montoEntregado && (
                <div className="vuelto-info">
                  <p>Vuelto: <strong>${formatearPrecio(calcularVuelto())}</strong></p>
                </div>
              )}
            </div>
          )}

          {metodoSeleccionado === 'tarjeta' && (
            <div className="tarjeta-content">
              <h3>Pago con Tarjeta</h3>
              <div className="total-info">
                <p>Total: <strong>${formatearPrecio(total)}</strong></p>
              </div>
              <p className="info-tarjeta">La transacción se procesará de forma segura</p>
            </div>
          )}

          {metodoSeleccionado === 'transferencia' && (
            <div className="transferencia-content">
              <h3>Pago por Transferencia</h3>
              <div className="total-info">
                <p>Total: <strong>${formatearPrecio(total)}</strong></p>
              </div>
              <div className="cuentas-list">
                {transferencias.map(c => (
                  <div
                    key={c.docId}
                    className={`cuenta-item ${cuentaTransferencia === c.docId ? 'selected' : ''}`}
                    onClick={() => setCuentaTransferencia(c.docId)}
                  >
                    <h4>{c.name}</h4>
                    <p><strong>Titular:</strong> {c.titular}</p>
                    <p><strong>Cuenta:</strong> {c.number}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {metodoSeleccionado === 'dividido' && (
            <div className="dividido-content">
              <h3>Pago Dividido</h3>
              <div className="total-info">
                <p>Total: <strong>${formatearPrecio(total)}</strong></p>
              </div>
              <div className="dividido-metodos">
                <div className="dividido-select">
                  <label>Primer método:</label>
                  <select
                    value={metodos.primero || ''}
                    onChange={e => setMetodos({ ...metodos, primero: e.target.value })}
                  >
                    <option value="">Seleccionar</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>

                {metodos.primero === 'transferencia' && (
                  <div className="dividido-select cuentas-dividido">
                    <label>Cuenta para Transferencia:</label>
                    <div className="cuentas-list-dividido">
                      {transferencias.map(c => (
                        <div
                          key={c.docId}
                          className={`cuenta-item-dividido ${metodos.cuentaPrimero === c.docId ? 'selected' : ''}`}
                          onClick={() => setMetodos({ ...metodos, cuentaPrimero: c.docId })}
                        >
                          <h5>{c.name}</h5>
                          <p>{c.number}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {metodos.primero && (
                  <div className="dividido-select">
                    <label>Monto Primer Pago:</label>
                    <input
                      type="text"
                      value={formatearPrecio(metodos.montoPrimero || 0)}
                      onChange={e => setMetodos({ ...metodos, montoPrimero: e.target.value.replace(/\D/g, '') })}
                      placeholder="Ingrese el monto"
                    />
                    <small>Falta: ${formatearPrecio(calcularMontoSegundo())}</small>
                  </div>
                )}

                <div className="dividido-select">
                  <label>Segundo método:</label>
                  <select
                    value={metodos.segundo || ''}
                    onChange={e => setMetodos({ ...metodos, segundo: e.target.value })}
                  >
                    <option value="">Seleccionar</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>

                {metodos.segundo === 'transferencia' && metodos.montoPrimero && (
                  <div className="dividido-select cuentas-dividido">
                    <label>Cuenta para Transferencia:</label>
                    <div className="cuentas-list-dividido">
                      {transferencias.map(c => (
                        <div
                          key={c.docId}
                          className={`cuenta-item-dividido ${metodos.cuentaSegundo === c.docId ? 'selected' : ''}`}
                          onClick={() => setMetodos({ ...metodos, cuentaSegundo: c.docId })}
                        >
                          <h5>{c.name}</h5>
                          <p>{c.number}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {metodos.primero && metodos.segundo && metodos.montoPrimero && (
                  <div className="resumen-dividido">
                    <h4>Resumen de pago:</h4>
                    <p>
                      {metodos.primero.charAt(0).toUpperCase() + metodos.primero.slice(1)}
                      {metodos.primero === 'transferencia' && metodos.cuentaPrimero !== null ? ` a ${transferencias.find(c => c.docId === metodos.cuentaPrimero)?.name}` : ''}
                      : ${formatearPrecio(metodos.montoPrimero)}
                    </p>
                    <p>
                      {metodos.segundo.charAt(0).toUpperCase() + metodos.segundo.slice(1)}
                      {metodos.segundo === 'transferencia' && metodos.cuentaSegundo !== null ? ` a ${transferencias.find(c => c.docId === metodos.cuentaSegundo)?.name}` : ''}
                      : ${formatearPrecio(calcularMontoSegundo())}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="modal-buttons">
            <button className="btn-cancelar" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn-completar"
              onClick={handleCompletarCompra}
              disabled={
                (metodoSeleccionado === 'efectivo' && !montoEntregado) ||
                (metodoSeleccionado === 'transferencia' && cuentaTransferencia === null) ||
                (metodoSeleccionado === 'dividido' && (!metodos.primero || !metodos.segundo || !metodos.montoPrimero)) ||
                !metodoSeleccionado
              }
            >
              Finalizar Compra
            </button>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
