import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { FaMoneyBillWave, FaShoppingCart } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../server/firebase';
import MetodoDePago from './metodopago/metododepago';
import './carrito.css';

const fechaIdDesdeInput = (fecha) => {
  const [yyyy, mm, dd] = fecha.split('-');
  return `${dd}_${mm}_${yyyy}`;
};

const Carrito = forwardRef(({ selectedDate }, ref) => {
  const [carrito, setCarrito] = useState([]);
  const [mostrarPago, setMostrarPago] = useState(false);
  const [cajaAbierta, setCajaAbierta] = useState(false);

  const getItemIdentityKey = (item = {}) => {
    const tipo = item.isRefill
      ? 'refill'
      : item.isEnvase
        ? 'envase'
        : item.isDescuento
          ? 'descuento'
          : item.isAdicional
            ? 'adicional'
            : 'producto';

    const baseId = item.documentId || item.id || 'sin-id';
    const variante = [
      item.refillFrom || '',
      item.idFormula || '',
      item.idEsencia || '',
      item.category || '',
      item.name || ''
    ].join('|');

    return `${tipo}:${baseId}:${variante}`;
  };

  useEffect(() => {
    try {
      const id = fechaIdDesdeInput(selectedDate);
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
  }, [selectedDate]);

  useImperativeHandle(ref, () => ({
    agregarAlCarrito: (producto) => {
      const itemBase = {
        ...producto,
        cantidad: 1,
        idFormula: producto.idFormula || null,
        idEsencia: producto.idEsencia || null
      };

      if (producto.esenciaGramos) {
        setCarrito((prev) => {
          const itemKey = getItemIdentityKey(itemBase);
          const exist = prev.find((item) => getItemIdentityKey(item) === itemKey);

          if (exist) {
            return prev.map((item) =>
              getItemIdentityKey(item) === itemKey
                ? { ...item, esenciaGramos: Number(item.esenciaGramos || 0) + Number(producto.esenciaGramos || 0) }
                : item
            );
          }

          return [...prev, {
            ...itemBase,
            esenciaGramos: Number(producto.esenciaGramos || 0)
          }];
        });
        return;
      }

      setCarrito((prev) => {
        const itemKey = getItemIdentityKey(itemBase);
        const itemExistente = prev.find((item) => getItemIdentityKey(item) === itemKey);

        if (itemExistente) {
          return prev.map((item) =>
            getItemIdentityKey(item) === itemKey
              ? { ...item, cantidad: Number(item.cantidad || 0) + 1 }
              : item
          );
        }

        return [...prev, itemBase];
      });
    }
  }));

  const eliminarDelCarrito = (itemSeleccionado) => {
    if (!itemSeleccionado) return;

    const itemKey = getItemIdentityKey(itemSeleccionado);
    setCarrito((prev) => prev.filter((item) => getItemIdentityKey(item) !== itemKey));
  };

  const modificarCantidad = (itemSeleccionado, nuevaCantidad) => {
    if (!itemSeleccionado) return;

    const itemKey = getItemIdentityKey(itemSeleccionado);

    if (nuevaCantidad <= 0) {
      eliminarDelCarrito(itemSeleccionado);
      return;
    }

    setCarrito((prev) => prev.map((item) =>
      getItemIdentityKey(item) === itemKey
        ? {
            ...item,
            ...(item.esenciaGramos ? { esenciaGramos: Number(nuevaCantidad) } : { cantidad: Number(nuevaCantidad) })
          }
        : item
    ));
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
            carrito.map((item, index) => (
              <div key={`${getItemIdentityKey(item)}-${index}`} className="carrito-item">
                <span className="col-id">{item.id}</span>
                <span className="col-nombre">{item.name}</span>
                {item.esenciaGramos ? (
                  <div className="col-cantidad item-cantidad">
                    <button onClick={() => modificarCantidad(item, Math.max(Number(item.esenciaGramos) - 1, 0))}>-</button>
                    <input
                      type="number"
                      value={item.esenciaGramos}
                      onChange={(e) => modificarCantidad(item, parseInt(e.target.value) || 0)}
                    />
                    <button onClick={() => modificarCantidad(item, Number(item.esenciaGramos) + 1)}>+</button>
                  </div>
                ) : (
                  <div className="col-cantidad item-cantidad">
                    <button onClick={() => modificarCantidad(item, item.cantidad - 1)}>-</button>
                    <input 
                      type="number" 
                      value={item.cantidad}
                      onChange={(e) => modificarCantidad(item, parseInt(e.target.value) || 1)}
                    />
                    <button onClick={() => modificarCantidad(item, item.cantidad + 1)}>+</button>
                  </div>
                )}
                <span className="col-valor">{item.esenciaGramos ? `${formatearPrecio(item.price)}/g` : `$${formatearPrecio(item.price)}`}</span>
                <span className="col-total">${formatearPrecio(calcularTotal(item))}</span>
                <button 
                  className="btn-eliminar"
                  onClick={() => eliminarDelCarrito(item)}
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
          selectedDate={selectedDate}
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
