import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../server/firebase';
import { GiDelicatePerfume } from 'react-icons/gi';
import { FaSearch, FaTimes, FaBoxes } from 'react-icons/fa';
import './Inventario.css';

export default function Inventario({ onAgregarAlCarrito }) {
  const [categoriaActiva, setCategoriaActiva] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [productosInventario, setProductosInventario] = useState([]);
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    cargarCategorias();
  }, []);

  useEffect(() => {
    filtrarProductos();
  }, [busqueda, productosInventario]);

  const cargarCategorias = async () => {
    try {
      setLoading(true);
      const productosRef = collection(db, 'PRODUCTOS');
      const snapshot = await getDocs(productosRef);
      
      const categoriasSet = new Set();
      snapshot.docs.forEach(doc => {
        if (doc.data().category) {
          categoriasSet.add(doc.data().category);
        }
      });
      
      const categoriasArray = Array.from(categoriasSet);
      setCategorias(categoriasArray);
      
      if (categoriasArray.length > 0) {
        setCategoriaActiva(categoriasArray[0]);
        cargarProductosPorCategoria(categoriasArray[0]);
      }
    } catch (err) {
      console.error('Error al cargar categorías:', err);
    } finally {
      setLoading(false);
    }
  };

  const cargarProductosPorCategoria = async (categoria) => {
    try {
      const productosRef = collection(db, 'PRODUCTOS');
      const q = query(productosRef, where('category', '==', categoria));
      const snapshot = await getDocs(q);
      
      const prods = snapshot.docs.map(doc => ({
        documentId: doc.id,
        id: doc.data().id,
        name: doc.data().name,
        category: doc.data().category,
        stock: doc.data().stock,
        price: Number(doc.data().price) || 0,
        idFormula: doc.data().idFormula || null,
        idEsencia: doc.data().idEsencia || null,
        tieneFormula: !!doc.data().idFormula
      }));
      
      setProductosInventario(prods);
      setProductosFiltrados(prods);
    } catch (err) {
      console.error('Error al cargar productos:', err);
    }
  };

  const normalizarIdBusqueda = (id) => {
    if (!isNaN(id)) {
      return parseInt(id).toString().padStart(12, '0');
    }
    return id.padStart(12, '0');
  };

  const filtrarProductos = () => {
    if (!busqueda.trim()) {
      setProductosFiltrados(productosInventario);
      return;
    }

    const busquedaLower = busqueda.toLowerCase().trim();
    
    const filtrados = productosInventario.filter(prod => {
      const coincideNombre = prod.name.toLowerCase().includes(busquedaLower);
      
      let coincideId = false;
      try {
        const idNormalizado = normalizarIdBusqueda(busquedaLower);
        coincideId = prod.id.includes(idNormalizado);
      } catch {
        coincideId = false;
      }
      
      return coincideNombre || coincideId;
    });

    setProductosFiltrados(filtrados);
  };

  const handleCambiarCategoria = (categoria) => {
    setCategoriaActiva(categoria);
    setBusqueda('');
    cargarProductosPorCategoria(categoria);
  };

  const handleLimpiarBusqueda = () => {
    setBusqueda('');
  };

  const formatearPrecio = (precio) => {
    if (!precio || isNaN(precio)) return '0';
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Number(precio));
  };

  const handleProductoClick = (producto) => {
    if (onAgregarAlCarrito) {
      onAgregarAlCarrito({
        documentId: producto.documentId,
        id: producto.id,
        name: producto.name,
        category: producto.category,
        price: producto.price,
        idFormula: producto.idFormula,
        idEsencia: producto.idEsencia,
        cantidad: 1
      });
    }
  };

  return (
    <div className="right-panel">
      <div className="categorias-container">
        <h3><FaBoxes /> Inventario</h3>
        <div className="tabs-container">
          {categorias.map((cat) => (
            <button
              key={cat}
              className={`tab-button ${categoriaActiva === cat ? 'active' : ''}`}
              onClick={() => handleCambiarCategoria(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="search-container-worker">
          <FaSearch className="search-icon-worker" />
          <input
            type="text"
            placeholder="Buscar por nombre o ID..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="search-input-worker"
          />
          {busqueda && (
            <button onClick={handleLimpiarBusqueda} className="clear-search-worker">
              <FaTimes />
            </button>
          )}
        </div>

        <div className="categorias-list">
          {loading ? (
            <p>Cargando productos...</p>
          ) : productosFiltrados.length === 0 ? (
            <p>{busqueda ? 'No se encontraron productos con esa búsqueda' : 'No hay productos en esta categoría'}</p>
          ) : (
            <div className="productos-grid">
              {productosFiltrados.map((prod) => (
                <div 
                  key={prod.documentId} 
                  className="producto-card"
                  onClick={() => handleProductoClick(prod)}
                >
                  <div className="producto-icono">
                    <GiDelicatePerfume size={40} />
                  </div>
                  <div className="producto-info">
                    <p className="producto-nombre">{prod.name}</p>
                    <p className="producto-precio">${formatearPrecio(prod.price)}</p>
                    {prod.tieneFormula && (
                      <span className="producto-formula">Con fórmula</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
