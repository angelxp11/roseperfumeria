import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, updateDoc, increment, setDoc } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { getAuth } from 'firebase/auth';
import { FaSearch, FaTimes, FaFileInvoice, FaTrash } from 'react-icons/fa';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './facturas.css';

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

export default function Facturas() {
  const [facturas, setFacturas] = useState([]);
  const [facturasFiltradas, setFacturasFiltradas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [searchFecha, setSearchFecha] = useState('');
  const [searchMetodoPago, setSearchMetodoPago] = useState('');
  const [metodosDisponibles, setMetodosDisponibles] = useState([]);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [facturaCancelar, setFacturaCancelar] = useState(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [usuarioActual, setUsuarioActual] = useState('Admin');

  useEffect(() => {
    cargarFacturas();
    cargarNombreUsuario();
  }, []);

  useEffect(() => {
    filtrarFacturas();
  }, [searchId, searchFecha, searchMetodoPago, facturas]);

  const cargarNombreUsuario = async () => {
    const nombre = await obtenerNombreEmpleado();
    setUsuarioActual(nombre);
  };

  const cargarFacturas = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'FACTURAS'));
      const facturasArray = [];
      const metodosSet = new Set();

      for (const docSnap of snap.docs) {
        const fecha = docSnap.id; // dd_mm_yyyy
        const data = docSnap.data();

        // data es { facturaId1: {...}, facturaId2: {...}, ... }
        for (const [facturaId, facturaData] of Object.entries(data)) {
          facturasArray.push({
            documentId: docSnap.id,
            facturaId,
            fecha,
            ...facturaData
          });

          // Extraer métodos de pago disponibles
          if (facturaData.metodo_pago) {
            if (Array.isArray(facturaData.metodo_pago)) {
              facturaData.metodo_pago.forEach(m => metodosSet.add(m.metodo));
            } else if (typeof facturaData.metodo_pago === 'object') {
              metodosSet.add(facturaData.metodo_pago.metodo || 'N/A');
            } else {
              metodosSet.add(facturaData.metodo_pago);
            }
          }
        }
      }

      // Ordena de más nueva a más antigua
      facturasArray.sort((a, b) => {
        const dateA = convertirFechaADate(a.fecha);
        const dateB = convertirFechaADate(b.fecha);
        return dateB - dateA;
      });

      setFacturas(facturasArray);
      setFacturasFiltradas(facturasArray);
      setMetodosDisponibles(Array.from(metodosSet).sort());
    } catch (err) {
      console.error('Error al cargar facturas:', err);
      toast.error('Error al cargar facturas', { containerId: 'local', position: 'top-right' });
    } finally {
      setLoading(false);
    }
  };

  const convertirFechaADate = (fechaStr) => {
    // fecha formato ISO: "2026-01-24T10:25:44.676Z"
    return new Date(fechaStr);
  };

  const formatearFecha = (fechaStr) => {
    const fecha = convertirFechaADate(fechaStr);
    return fecha.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatearHora = (fechaStr) => {
    const fecha = convertirFechaADate(fechaStr);
    return fecha.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatNumber = (val) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(val) || 0);

  const fechaHoyId = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}_${mm}_${yyyy}`;
  };

  const obtenerNombreMetodo = (metodo) => {
    // Función auxiliar para normalizar nombre de método
    if (typeof metodo === 'string') {
      const normalizado = metodo.toLowerCase();
      if (normalizado.includes('nequi')) return 'NEQUI';
      if (normalizado.includes('bancolombia')) return 'BANCOLOMBIA';
      if (normalizado.includes('efectivo')) return 'EFECTIVO';
      if (normalizado.includes('tarjeta')) return 'TARJETA';
      return metodo.toUpperCase();
    }
    return 'DESCONOCIDO';
  };

  const decrementarCaja = async (metodos, monto) => {
    try {
      const id = fechaHoyId();
      const docRef = doc(db, 'CAJAS', id);

      // Si metodos es un array, decrementar cada uno proporcionalmente
      if (Array.isArray(metodos)) {
        const updateObj = {};
        metodos.forEach(m => {
          const nombreMetodo = obtenerNombreMetodo(m.metodo);
          updateObj[`APERTURA.${nombreMetodo}`] = increment(-Number(m.monto || 0));
        });
        await updateDoc(docRef, updateObj);
      } else {
        // Si es un objeto único
        const nombreMetodo = obtenerNombreMetodo(metodos.metodo || metodos);
        await updateDoc(docRef, {
          [`APERTURA.${nombreMetodo}`]: increment(-monto)
        });
      }
    } catch (err) {
      console.error('Error al decrementar caja:', err);
      // No lanzar error, solo registrar
    }
  };

  const registrarMovimiento = async (facturaId, motivo, monto) => {
    try {
      const movimientoId = String(Date.now());
      const fechaHoy = fechaHoyId();
      const movimientosRef = doc(db, 'MOVIMIENTOS', fechaHoy);

      const movimiento = {
        id: movimientoId,
        tipo: 'CANCELACION',
        factura_id: facturaId,
        usuario: usuarioActual,
        motivo: motivo,
        monto: monto,
        fecha: new Date().toISOString(),
        descripcion: `La factura #${facturaId} fue cancelada por ${usuarioActual}`
      };

      await setDoc(
        movimientosRef,
        {
          [movimientoId]: movimiento
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error al registrar movimiento:', err);
      // No lanzar error, solo registrar en consola
    }
  };

  const filtrarFacturas = () => {
    let resultado = [...facturas];

    // Filtrar por ID de factura
    if (searchId.trim()) {
      resultado = resultado.filter(f =>
        f.facturaId.toLowerCase().includes(searchId.toLowerCase())
      );
    }

    // Filtrar por fecha
    if (searchFecha.trim()) {
      const [yyyySearch, mmSearch, ddSearch] = searchFecha.split('-');
      const fechaBuscada = new Date(yyyySearch, parseInt(mmSearch) - 1, ddSearch);
      
      resultado = resultado.filter(f => {
        const fechaFactura = new Date(f.fecha);
        return (
          fechaFactura.getFullYear() === fechaBuscada.getFullYear() &&
          fechaFactura.getMonth() === fechaBuscada.getMonth() &&
          fechaFactura.getDate() === fechaBuscada.getDate()
        );
      });
    }

    // Filtrar por método de pago
    if (searchMetodoPago.trim()) {
      resultado = resultado.filter(f => {
        if (Array.isArray(f.metodo_pago)) {
          return f.metodo_pago.some(m => m.metodo === searchMetodoPago);
        } else if (typeof f.metodo_pago === 'object') {
          return f.metodo_pago.metodo === searchMetodoPago;
        }
        return f.metodo_pago === searchMetodoPago;
      });
    }

    setFacturasFiltradas(resultado);
  };

  const limpiarBusqueda = () => {
    setSearchId('');
    setSearchFecha('');
    setSearchMetodoPago('');
  };

  const abrirModalCancelar = (factura) => {
    if (factura.estado === 'CANCELADA') {
      toast.warning('Esta factura ya está cancelada', { containerId: 'local', position: 'top-right' });
      return;
    }
    setFacturaCancelar(factura);
    setMotivoCancelacion('');
    setModalCancelar(true);
  };

  // NEW: Restaurar stock para los productos de una factura
  const restaurarStockPorProductos = async (productos = []) => {
    try {
      if (!Array.isArray(productos) || productos.length === 0) return;

      for (const prod of productos) {
        const cantidad = Number(prod.cantidad) || 0;
        if (cantidad <= 0) continue;

        // Caso: producto con fórmula -> restaurar INSUMOS y ESENCIA si es posible
        if (prod.idFormula) {
          try {
            const formulaRef = doc(db, 'FORMULAS', prod.idFormula);
            const formulaSnap = await getDoc(formulaRef);
            if (formulaSnap.exists()) {
              const formula = formulaSnap.data();

              const insumos = [
                { id: 'ALCOHOL', campo: 'alcohol' },
                { id: 'FIJADOR', campo: 'fijadorgr' },
                { id: 'FEROMONAS', campo: 'feromonasgotas' }
              ];

              for (const insumo of insumos) {
                const valorPorUnidad = Number(formula[insumo.campo]) || 0;
                const total = valorPorUnidad * cantidad;
                if (total > 0) {
                  try {
                    const ref = doc(db, 'INSUMOS', insumo.id);
                    await updateDoc(ref, { stock: increment(total) });
                  } catch (err) {
                    console.error(`Error restaurando insumo ${insumo.id}:`, err);
                  }
                }
              }

              // Esencia: requiere id de esencia en el producto (si lo tenemos)
              const idEsencia = prod.idEsencia || null;
              const esenciagr = Number(formula.esenciagr) || 0;
              if (idEsencia && esenciagr > 0) {
                try {
                  const refEs = doc(db, 'ESENCIA', idEsencia);
                  await updateDoc(refEs, { stock: increment(esenciagr * cantidad) });
                } catch (err) {
                  console.error('Error restaurando ESENCIA:', err);
                }
              }
            }
          } catch (err) {
            console.error('Error procesando fórmula para restaurar stock:', err);
          }
        }

        // NEW: Restaurar ESENCIA consumida por ADICIONALES
        // (productos que guardaron 'esenciaGramos' y 'idEsencia' al agregarse)
        try {
          const esenciaId = prod.idEsencia || null;
          const gramosPorItem = Number(prod.esenciaGramos || 0);
          const totalGramosAdicional = gramosPorItem * (cantidad || 1);

          if (esenciaId && totalGramosAdicional > 0) {
            try {
              const refEs = doc(db, 'ESENCIA', esenciaId);
              await updateDoc(refEs, { stock: increment(totalGramosAdicional) });
              console.log(`✅ Restaurados ${totalGramosAdicional}g en ESENCIA ${esenciaId} (adicional)`);
            } catch (err) {
              console.error('Error restaurando ESENCIA (adicional):', err);
            }
          }
        } catch (err) {
          console.error('Error calculando/restaurando ESENCIA para adicional:', err);
        }

        // Caso: producto con documento en PRODUCTOS -> incrementar stock
        if (prod.documentId) {
          try {
            const prodRef = doc(db, 'PRODUCTOS', prod.documentId);
            await updateDoc(prodRef, { stock: increment(cantidad) });
          } catch (err) {
            console.error('Error restaurando stock de PRODUCTOS:', err);
          }
        } else if (prod.id && prod.id !== 'N/A') {
          // fallback: intentar con prod.id si no existe documentId
          try {
            const prodRef = doc(db, 'PRODUCTOS', prod.id);
            await updateDoc(prodRef, { stock: increment(cantidad) });
          } catch (err) {
            // puede que no sea un id válido; ignorar sin romper el proceso
          }
        }
      }
    } catch (err) {
      console.error('Error en restaurarStockPorProductos:', err);
    }
  };

  const cancelarFactura = async () => {
    if (!motivoCancelacion.trim()) {
      toast.warning('Debes ingresar un motivo de cancelación', { containerId: 'local', position: 'top-right' });
      return;
    }

    try {
      setCancelando(true);
      const docRef = doc(db, 'FACTURAS', facturaCancelar.documentId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        const montoTotal = data[facturaCancelar.facturaId].total || 0;
        const metodoPago = data[facturaCancelar.facturaId].metodo_pago;
        const productosFactura = data[facturaCancelar.facturaId].productos || [];

        const facturaActualizada = {
          ...data[facturaCancelar.facturaId],
          estado: 'CANCELADA',
          motivo_cancelacion: motivoCancelacion,
          fecha_cancelacion: new Date().toISOString(),
          devolucion_monto: montoTotal
        };

        const nuevosData = {
          ...data,
          [facturaCancelar.facturaId]: facturaActualizada
        };

        // Actualizar factura
        await updateDoc(docRef, nuevosData);

        // NEW: Restaurar stock de los productos (si aplica)
        await restaurarStockPorProductos(productosFactura);

        // Decrementar dinero de la caja según método de pago
        if (metodoPago) {
          await decrementarCaja(metodoPago, montoTotal);
        }

        // Registrar movimiento
        await registrarMovimiento(facturaCancelar.facturaId, motivoCancelacion, montoTotal);
        
        toast.success(`Factura #${facturaCancelar.facturaId} cancelada. Dinero devuelto: $${formatNumber(montoTotal)}`, { containerId: 'local', position: 'top-right', autoClose: 4000 });
        setModalCancelar(false);
        cargarFacturas();
      }
    } catch (err) {
      console.error('Error al cancelar factura:', err);
      toast.error('Error al cancelar factura', { containerId: 'local', position: 'top-right', autoClose: 4000 });
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div className="rf-facturas-container">
      <div className="rf-facturas-header">
        <FaFileInvoice className="rf-facturas-icon" />
        <h2>Facturas</h2>
      </div>

      <div className="rf-facturas-filters">
        <div className="rf-filter-group">
          <FaSearch className="rf-filter-icon" />
          <input
            type="text"
            placeholder="Buscar por ID de factura..."
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="rf-filter-input"
          />
        </div>

        <div className="rf-filter-group">
          <input
            type="date"
            value={searchFecha}
            onChange={(e) => setSearchFecha(e.target.value)}
            className="rf-filter-input rf-filter-date"
          />
        </div>

        <div className="rf-filter-group">
          <select
            value={searchMetodoPago}
            onChange={(e) => setSearchMetodoPago(e.target.value)}
            className="rf-filter-input rf-filter-select"
          >
            <option value="">Todos los métodos de pago</option>
            {metodosDisponibles.map((metodo) => (
              <option key={metodo} value={metodo}>
                {metodo}
              </option>
            ))}
          </select>
        </div>

        {(searchId || searchFecha || searchMetodoPago) && (
          <button className="rf-btn-limpiar" onClick={limpiarBusqueda}>
            <FaTimes />
          </button>
        )}
      </div>

      <div className="rf-facturas-list">
        {loading ? (
          <p className="rf-loading-text">Cargando facturas...</p>
        ) : facturasFiltradas.length === 0 ? (
          <p className="rf-no-results">
            {facturas.length === 0 ? 'No hay facturas registradas' : 'No se encontraron facturas con esos criterios'}
          </p>
        ) : (
          facturasFiltradas.map((factura) => (
            <div key={`${factura.documentId}-${factura.facturaId}`} className="rf-factura-card">
              <div className="rf-factura-header-card">
                <div className="rf-factura-id-fecha">
                  <h3 className="rf-factura-id">#{factura.facturaId}</h3>
                  <p className="rf-factura-fecha">
                    {formatearFecha(factura.fecha)} - {formatearHora(factura.fecha)}
                  </p>
                </div>
                <div className="rf-factura-total">
                  <span className="rf-total-label">Total:</span>
                  <span className="rf-total-amount">${formatNumber(factura.total || 0)}</span>
                </div>
              </div>

              <div className="rf-factura-productos">
                <h4>Productos</h4>
                <table className="rf-productos-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Cantidad</th>
                      <th>Precio Unit.</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factura.productos && factura.productos.length > 0 ? (
                      factura.productos.map((prod, idx) => (
                        <tr key={idx}>
                          <td>{prod.nombre || 'N/A'}</td>
                          <td>{prod.cantidad || 0}</td>
                          <td>${formatNumber(prod.precio_unitario || 0)}</td>
                          <td>${formatNumber(prod.subtotal || 0)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="rf-no-data">Sin productos</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rf-factura-metodo">
                <h4>Método de Pago</h4>
                <div className="rf-metodo-content">
                  {factura.metodo_pago ? (
                    Array.isArray(factura.metodo_pago) ? (
                      factura.metodo_pago.map((m, idx) => (
                        <div key={idx} className="rf-metodo-item">
                          {m.metodo}: ${formatNumber(m.monto || 0)}
                        </div>
                      ))
                    ) : typeof factura.metodo_pago === 'object' ? (
                      <div className="rf-metodo-item">
                        {factura.metodo_pago.metodo || 'N/A'}
                      </div>
                    ) : (
                      <div className="rf-metodo-item">{factura.metodo_pago}</div>
                    )
                  ) : (
                    <div className="rf-metodo-item">N/A</div>
                  )}
                </div>
              </div>

              <div className="rf-factura-status">
                <span className={`rf-status-badge rf-status-${(factura.estado || 'COMPLETADA').toLowerCase()}`}>
                  {factura.estado || 'COMPLETADA'}
                </span>
                {factura.motivo_cancelacion && (
                  <div className="rf-motivo-cancelacion">
                    <p><strong>Motivo:</strong> {factura.motivo_cancelacion}</p>
                  </div>
                )}
              </div>

              <div className="rf-factura-actions">
                <button 
                  className="rf-btn-cancelar"
                  onClick={() => abrirModalCancelar(factura)}
                  disabled={factura.estado === 'CANCELADA'}
                >
                  <FaTrash /> Cancelar Factura
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {modalCancelar && (
        <div className="rf-modal-overlay">
          <div className="rf-modal-content">
            <h3>Cancelar Factura #{facturaCancelar?.facturaId}</h3>
            <p className="rf-modal-info">
              Total a devolver: <strong>${formatNumber(facturaCancelar?.total)}</strong>
            </p>
            
            <textarea
              placeholder="¿Cuál es el motivo de la cancelación?"
              value={motivoCancelacion}
              onChange={(e) => setMotivoCancelacion(e.target.value)}
              className="rf-modal-textarea"
              rows="4"
            />

            <div className="rf-modal-actions">
              <button 
                className="rf-btn-confirmar"
                onClick={cancelarFactura}
                disabled={cancelando || !motivoCancelacion.trim()}
              >
                {cancelando ? 'Procesando...' : 'Confirmar Cancelación'}
              </button>
              <button 
                className="rf-btn-cerrar"
                onClick={() => setModalCancelar(false)}
                disabled={cancelando}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast local para este componente */}
      <ToastContainer containerId="local" position="top-right" autoClose={3000} limit={3} newestOnTop pauseOnHover closeOnClick />
    </div>
  );
}
