import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { FaMoneyBillWave, FaShoppingCart } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../server/firebase';
import MetodoDePago from './metodopago/metododepago';
import './carrito.css';

const Carrito = forwardRef((props, ref) => {
  const [carrito, setCarrito] = useState([]);
  const [mostrarPago, setMostrarPago] = useState(false);
  const [cajaAbierta, setCajaAbierta] = useState(false);

  const fechaHoyId = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}_${mm}_${yyyy}`;
  };

  useEffect(() => {
    try {
      const id = fechaHoyId();
      const docRef = doc(db, 'CAJAS', id);
      
      const unsubscribe = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCajaAbierta(data.APERTURA_ACTIVE === 1);
        }
      }, (error) => {
        console.error('Error al escuchar cambios en caja:', error);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error al configurar listener:', error);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    agregarAlCarrito: (producto) => {
      // Si el producto viene con gramos de esencia, sumar por idEsencia
      if (producto.esenciaGramos) {
        const exist = carrito.find(item => item.documentId === producto.documentId && item.idEsencia === producto.idEsencia);
        if (exist) {
          setCarrito(carrito.map(item =>
            (item.documentId === producto.documentId && item.idEsencia === producto.idEsencia)
              ? { ...item, esenciaGramos: Number(item.esenciaGramos || 0) + Number(producto.esenciaGramos || 0) }
              : item
          ));
        } else {
          setCarrito([...carrito, { 
            ...producto,
            esenciaGramos: Number(producto.esenciaGramos || 0),
            cantidad: 1,
            idFormula: producto.idFormula || null,
            idEsencia: producto.idEsencia || null
          }]);
        }
        return;
      }

      // Comportamiento normal para productos sin esencia (por unidades)
      const itemExistente = carrito.find(item => item.documentId === producto.documentId && !item.esenciaGramos);
      
      if (itemExistente) {
        setCarrito(carrito.map(item =>
          item.documentId === producto.documentId && !item.esenciaGramos
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        ));
      } else {
        setCarrito([...carrito, { 
          ...producto, 
          cantidad: 1,
          idFormula: producto.idFormula || null,
          idEsencia: producto.idEsencia || null
        }]);
      }
    }
  }));

  const eliminarDelCarrito = (documentId, idEsencia = null) => {
    if (idEsencia) {
      setCarrito(carrito.filter(item => !(item.documentId === documentId && item.idEsencia === idEsencia)));
    } else {
      // Eliminar el producto por unidades (no tocar entradas de esencias específicas)
      setCarrito(carrito.filter(item => !(item.documentId === documentId && !item.esenciaGramos)));
    }
  };

  const modificarCantidad = (documentId, nuevaCantidad, idEsencia = null) => {
    if (idEsencia) {
      if (nuevaCantidad <= 0) {
        eliminarDelCarrito(documentId, idEsencia);
      } else {
        setCarrito(carrito.map(item =>
          (item.documentId === documentId && item.idEsencia === idEsencia)
            ? { ...item, esenciaGramos: Number(nuevaCantidad) }
            : item
        ));
      }
    } else {
      if (nuevaCantidad <= 0) {
        eliminarDelCarrito(documentId);
      } else {
        setCarrito(carrito.map(item =>
          item.documentId === documentId && !item.esenciaGramos
            ? { ...item, cantidad: nuevaCantidad }
            : item
        ));
      }
    }
  };

  const calcularTotal = (item) => {
    if (item.esenciaGramos) {
      return (Number(item.price) || 0) * Number(item.esenciaGramos || 0);
    }
    return (Number(item.price) || 0) * Number(item.cantidad || 0);
  };

  const calcularTotalCarrito = () => {
    return carrito.reduce((total, item) => total + calcularTotal(item), 0);
  };

  const formatearPrecio = (precio) => {
    if (!precio || isNaN(precio)) return '0';
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Number(precio));
  };

  const handleCompletarCompra = (datosPago) => {
    console.log('Compra completada:', datosPago);
    console.log('Items de la compra:', carrito);
    toast.success('¡Compra finalizada con éxito!', {
        position: 'top-right',
        autoClose: 3000,
    });
    setMostrarPago(false);
    setCarrito([]);
  };

  return (
    <>
      <div className="carrito-container">
        <h3><FaShoppingCart /> Carrito</h3>
        <div className="carrito-header">
          <span className="col-id">ID</span>
          <span className="col-nombre">Nombre</span>
          <span className="col-cantidad">Cantidad</span>
          <span className="col-valor">Valor Unit.</span>
          <span className="col-total">Total</span>
        </div>
        <div className="carrito-items">
          {carrito.length === 0 ? (
            <p className="carrito-vacio">Sin artículos</p>
          ) : (
            carrito.map((item) => (
              <div key={item.documentId} className="carrito-item">
                <span className="col-id">{item.id}</span>
                <span className="col-nombre">{item.name}</span>
                {item.esenciaGramos ? (
                  <div className="col-cantidad item-cantidad">
                    <button onClick={() => modificarCantidad(item.documentId, Math.max(Number(item.esenciaGramos) - 1, 0), item.idEsencia)}>-</button>
                    <input
                      type="number"
                      value={item.esenciaGramos}
                      onChange={(e) => modificarCantidad(item.documentId, parseInt(e.target.value) || 0, item.idEsencia)}
                    />
                    <button onClick={() => modificarCantidad(item.documentId, Number(item.esenciaGramos) + 1, item.idEsencia)}>+</button>
                  </div>
                ) : (
                  <div className="col-cantidad item-cantidad">
                    <button onClick={() => modificarCantidad(item.documentId, item.cantidad - 1)}>-</button>
                    <input 
                      type="number" 
                      value={item.cantidad}
                      onChange={(e) => modificarCantidad(item.documentId, parseInt(e.target.value) || 1)}
                    />
                    <button onClick={() => modificarCantidad(item.documentId, item.cantidad + 1)}>+</button>
                  </div>
                )}
                <span className="col-valor">{item.esenciaGramos ? `${formatearPrecio(item.price)}/g` : `$${formatearPrecio(item.price)}`}</span>
                <span className="col-total">${formatearPrecio(calcularTotal(item))}</span>
                <button 
                  className="btn-eliminar"
                  onClick={() => eliminarDelCarrito(item.documentId, item.idEsencia)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
        <div className="total-section-wrapper">
          <div className="total-section">
            <div className="total-amount">
              <span className="total-label">Total a Pagar:</span>
              <span className="total-value">${formatearPrecio(calcularTotalCarrito())}</span>
            </div>
          </div>
          {carrito.length > 0 && (
            <button 
              className="btn-pagar"
              onClick={() => cajaAbierta && setMostrarPago(true)}
              title={cajaAbierta ? "Proceder al pago" : "Debes abrir caja para proceder con la compra"}
              disabled={!cajaAbierta}
              style={!cajaAbierta ? { cursor: 'not-allowed', opacity: 0.6 } : {}}
            >
              <FaMoneyBillWave size={24} />
            </button>
          )}
        </div>
      </div>

      {mostrarPago && (
        <MetodoDePago 
          total={calcularTotalCarrito()}
          onClose={() => setMostrarPago(false)}
          onCompletarCompra={handleCompletarCompra}
          items={carrito}
        />
      )}
      <ToastContainer />
    </>
  );
});

Carrito.displayName = 'Carrito';

export default Carrito;
