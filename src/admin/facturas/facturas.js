import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { FaSearch, FaTimes, FaFileInvoice } from 'react-icons/fa';
import { toast } from 'react-toastify';
import './facturas.css';

export default function Facturas() {
  const [facturas, setFacturas] = useState([]);
  const [facturasFiltradas, setFacturasFiltradas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [searchFecha, setSearchFecha] = useState('');

  useEffect(() => {
    cargarFacturas();
  }, []);

  useEffect(() => {
    filtrarFacturas();
  }, [searchId, searchFecha, facturas]);

  const cargarFacturas = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'FACTURAS'));
      const facturasArray = [];

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
    } catch (err) {
      console.error('Error al cargar facturas:', err);
      toast.error('Error al cargar facturas');
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

    setFacturasFiltradas(resultado);
  };

  const limpiarBusqueda = () => {
    setSearchId('');
    setSearchFecha('');
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

        {(searchId || searchFecha) && (
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
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
