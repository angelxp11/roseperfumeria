import { useRef, useState, useEffect } from 'react';
import { FaShoppingBag, FaDownload } from 'react-icons/fa';
import Inventario from './Inventario/Inventario';
import Carrito from './carrito/carrito';
import Cajas from './Inventario/Cajas';
import ReporteModal from './ReporteModal/ReporteModal';
import './Facturacion.css';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../server/firebase';

export default function Facturacion() {
  const carritoRef = useRef(null);
  const [isCajaOpen, setIsCajaOpen] = useState(false);
  const [cajaMode, setCajaMode] = useState('open'); // 'open' or 'close'
  const [aperturaActive, setAperturaActive] = useState(false);
  const [cierreActive, setCierreActive] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showReporteModal, setShowReporteModal] = useState(false);

  const fechaHoyId = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}_${mm}_${yyyy}`;
  };

  useEffect(() => {
    const verificarCaja = async () => {
      const id = fechaHoyId();
      const ref = doc(db, 'CAJAS', id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (data.APERTURA_ACTIVE === 1) setAperturaActive(true);
        if (data.CIERRE_ACTIVE === 1) setCierreActive(true);
      }
    };
    
    const verificarRol = () => {
      const userRole = localStorage.getItem('userRole');
      setIsAdmin(userRole === 'ADMINISTRADOR');
    };
    
    verificarCaja();
    verificarRol();
  }, []);

  const handleCierreClick = (e) => {
    if (isAdmin && e.ctrlKey) {
      setCajaMode('close');
      setIsCajaOpen(true);
    } else if (!cierreActive && !isAdmin) {
      setCajaMode('close');
      setIsCajaOpen(true);
    }
  };

  const handleAgregarAlCarrito = (producto) => {
    if (carritoRef.current) {
      carritoRef.current.agregarAlCarrito(producto);
    }
  };

  return (
    <div className="facturacion-container">
      <div className="facturacion-header">
        <h2><FaShoppingBag /> Ventas</h2>
        <div className="caja-buttons">
          {isAdmin && (
            <button
              className="btn-caja btn-descargar"
              onClick={() => setShowReporteModal(true)}
            >
              <FaDownload /> Descargar Resumen
            </button>
          )}
          <button
            className={`btn-caja ${isCajaOpen || aperturaActive ? 'open' : ''}`}
            onClick={() => { setCajaMode('open'); setIsCajaOpen(true); }}
            disabled={isCajaOpen || aperturaActive}
            style={{ opacity: isCajaOpen || aperturaActive ? 0.5 : 1 }}
          >
            Abrir Caja
          </button>
          <button
            className="btn-caja btn-cerrar"
            onClick={handleCierreClick}
            disabled={cierreActive && !isAdmin}
            style={{ opacity: cierreActive && !isAdmin ? 0.5 : 1 }}
            title={isAdmin ? "Presiona Ctrl + Click para cerrar caja" : ""}
          >
            Cerrar Caja
          </button>
        </div>
      </div>

      <div className="facturacion-content">
        <Carrito ref={carritoRef} />
        <Inventario onAgregarAlCarrito={handleAgregarAlCarrito} />
      </div>

      {isCajaOpen && (
        <Cajas
          mode={cajaMode}
          onClose={() => setIsCajaOpen(false)}
          onOpened={() => {
            setAperturaActive(true);
            setCierreActive(false);
            setIsCajaOpen(false);
          }}
          onClosed={() => {
            setCierreActive(true);
            setAperturaActive(false);
            setIsCajaOpen(false);
          }}
        />
      )}

      {showReporteModal && (
        <ReporteModal onClose={() => setShowReporteModal(false)} />
      )}
    </div>
  );
}
