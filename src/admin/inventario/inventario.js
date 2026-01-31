import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { FaPlus, FaEdit, FaTrash, FaDownload, FaUpload, FaSearch, FaTimes } from 'react-icons/fa';
import './inventario.css';

export default function AdminInventario() {
  const [productos, setProductos] = useState([]);
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: '',
    stock: '',
    price: '',
    idFormulas: [],
    idEsencia: '',
    formulasPrices: {} // NUEVO: guardar precios por fórmula
  });
  const [categorias, setCategorias] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [esencias, setEsencias] = useState([]);
  const [showFormulas, setShowFormulas] = useState(false);
  const [loadingFormulas, setLoadingFormulas] = useState(false);
  const [loadingEsencias, setLoadingEsencias] = useState(false);

  useEffect(() => {
    cargarProductos();
  }, []);

  useEffect(() => {
    filtrarProductos();
  }, [busqueda, productos]);

  const cargarProductos = async () => {
    try {
      setLoading(true);
      const productosRef = collection(db, 'PRODUCTOS');
      const snapshot = await getDocs(productosRef);
      const prods = snapshot.docs.map(doc => ({
        documentId: doc.id,
        ...doc.data()
      }));
      setProductos(prods);
      setProductosFiltrados(prods);
      
      const cats = new Set(prods.map(p => p.category).filter(Boolean));
      setCategorias(Array.from(cats));
    } catch (err) {
      console.error('Error al cargar productos:', err);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  const cargarFormulas = async () => {
    try {
      setLoadingFormulas(true);
      const formulasRef = collection(db, 'FORMULAS');
      const snapshot = await getDocs(formulasRef);
      const frms = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Ordenar fórmulas ascendentemente por número
      frms.sort((a, b) => {
        const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      setFormulas(frms);
    } catch (err) {
      console.error('Error al cargar fórmulas:', err);
      toast.error('Error al cargar fórmulas');
    } finally {
      setLoadingFormulas(false);
    }
  };

  const cargarEsencias = async () => {
    try {
      setLoadingEsencias(true);
      const esenciasRef = collection(db, 'ESENCIA');
      const snapshot = await getDocs(esenciasRef);
      const esen = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Filtrar y excluir esencias destinadas a PRODUCCION (no deben mostrarse en el select)
      const esenFiltradas = esen.filter(e => {
        const genero = (e.genero || '').toString().trim().toUpperCase();
        return genero !== 'PRODUCCION';
      });
      setEsencias(esen);
      // Reemplazar por las esencias filtradas
      setEsencias(esenFiltradas);
    } catch (err) {
      console.error('Error al cargar esencias:', err);
      toast.error('Error al cargar esencias');
    } finally {
      setLoadingEsencias(false);
    }
  };

  const handleToggleFormulas = async () => {
    if (!showFormulas) {
      // Si no está mostrando, cargar fórmulas y esencias
      if (formulas.length === 0) {
        await cargarFormulas();
      }
      if (esencias.length === 0) {
        await cargarEsencias();
      }
    }
    setShowFormulas(!showFormulas);
  };

  const handleSelectFormula = (formulaId) => {
    setFormData(prev => {
      const nuevasFormulas = prev.idFormulas.includes(formulaId)
        ? prev.idFormulas.filter(id => id !== formulaId)
        : [...prev.idFormulas, formulaId];
      
      // Si se deselecciona, eliminar el precio asociado
      const nuevosPrecios = { ...prev.formulasPrices };
      if (!nuevasFormulas.includes(formulaId)) {
        delete nuevosPrecios[formulaId];
      }
      
      return {
        ...prev,
        idFormulas: nuevasFormulas,
        formulasPrices: nuevosPrecios
      };
    });
  };

  const handleFormulaPriceChange = (formulaId, price) => {
    setFormData(prev => ({
      ...prev,
      formulasPrices: {
        ...prev.formulasPrices,
        [formulaId]: price
      }
    }));
  };

  const normalizarIdBusqueda = (id) => {
    // Si es un número, lo convierte a string con 12 dígitos
    if (!isNaN(id)) {
      return parseInt(id).toString().padStart(12, '0');
    }
    // Si ya es string con formato, lo retorna
    return id.padStart(12, 0);
  };

  const filtrarProductos = () => {
    if (!busqueda.trim()) {
      setProductosFiltrados(productos);
      return;
    }

    const busquedaLower = busqueda.toLowerCase().trim();
    
    const filtrados = productos.filter(prod => {
      const coincideNombre = prod.name && prod.name.toLowerCase().includes(busquedaLower);
      
      let coincideId = false;
      try {
        const idNormalizado = normalizarIdBusqueda(busquedaLower);
        coincideId = prod.id && prod.id.includes(idNormalizado);
      } catch {
        coincideId = false;
      }
      
      return coincideNombre || coincideId;
    });

    setProductosFiltrados(filtrados);
  };

  const generarIdIncremental = () => {
    const idsNumericos = productos
      .map(p => parseInt(p.id))
      .filter(id => !isNaN(id))
      .sort((a, b) => b - a);
    
    const nuevoId = idsNumericos.length > 0 ? idsNumericos[0] + 1 : 1;
    return nuevoId.toString().padStart(12, '0');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let finalValue = value;
    
    if (name === 'name') {
      finalValue = value.toUpperCase();
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: finalValue
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const tieneFormulas = formData.idFormulas && formData.idFormulas.length > 0;
    
    // Validación: campos obligatorios
    if (!formData.name || !formData.category) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    // Si tiene fórmulas, requiere esencia y precios por fórmula
    if (tieneFormulas) {
      if (!formData.idEsencia) {
        toast.error('Por favor selecciona una esencia');
        return;
      }
      // Validar que todas las fórmulas tengan precio
      for (const formulaId of formData.idFormulas) {
        if (!formData.formulasPrices[formulaId]) {
          toast.error(`Por favor ingresa el precio para la fórmula ${formulaId}`);
          return;
        }
      }
    } else {
      // Si no tiene fórmulas, requiere stock y precio general
      if (!formData.stock || !formData.price) {
        toast.error('Por favor completa el stock y precio');
        return;
      }
    }

    try {
      setLoading(true);
      
      if (editingId) {
        // Editar producto
        const idProducto = formData.id || generarIdIncremental();
        const docRef = doc(db, 'PRODUCTOS', editingId);
        
        const dataToUpdate = {
          id: idProducto,
          name: formData.name,
          category: formData.category
        };

        if (tieneFormulas) {
          // Al editar un producto con fórmula guardamos idFormula (singular) y price,
          // eliminamos campos pluralizados para mantener consistencia y ponemos stock = 0
          if (formData.idFormulas.length !== 1) {
            toast.error('Para editar un producto con fórmula, selecciona exactamente una fórmula.');
            setLoading(false);
            return;
          }
          const formulaId = formData.idFormulas[0];
          const precio = parseFloat(formData.formulasPrices[formulaId]);
          if (isNaN(precio)) {
            toast.error('Por favor ingresa un precio válido para la fórmula seleccionada');
            setLoading(false);
            return;
          }

          dataToUpdate.idFormula = formulaId;
          dataToUpdate.price = precio;
          dataToUpdate.idEsencia = formData.idEsencia || deleteField();
          dataToUpdate.stock = 0;

          // Eliminar posibles campos plurales que no usamos en cada documento individual
          dataToUpdate.idFormulas = deleteField();
          dataToUpdate.formulasPrices = deleteField();
        } else {
          // Producto sin fórmula: eliminar campos relacionados con fórmulas si existen
          dataToUpdate.idFormulas = deleteField();
          dataToUpdate.idEsencia = deleteField();
          dataToUpdate.formulasPrices = deleteField();
          dataToUpdate.idFormula = deleteField(); // eliminar idFormula si existía antes
          dataToUpdate.stock = parseInt(formData.stock);
          dataToUpdate.price = parseFloat(formData.price);
        }

        await updateDoc(docRef, dataToUpdate);
        toast.success('Producto actualizado correctamente');
      } else {
        // Crear producto(s)
        if (tieneFormulas) {
  let ultimoId = obtenerUltimoIdNumerico();
  let productosCreados = 0;

  for (const formulaId of formData.idFormulas) {
    ultimoId++;

    const idProducto = ultimoId.toString().padStart(12, '0');

    const numberMatch = formulaId.match(/(\d+)/);
    const gramos = numberMatch ? numberMatch[1] : '';

    const nombreProducto = gramos
      ? `${formData.name} ${gramos}GR`
      : formData.name;

    await setDoc(doc(db, 'PRODUCTOS', idProducto), {
      id: idProducto,
      name: nombreProducto,
      category: formData.category,
      price: parseFloat(formData.formulasPrices[formulaId]),
      idFormula: formulaId,
      idEsencia: formData.idEsencia,
      stock: 0
    });

    productosCreados++;
  }

  toast.success(`${productosCreados} producto(s) agregado(s) correctamente`);
}
else {
          // Crear un solo producto sin fórmula (NO crear campos idFormulas ni idEsencia)
          const idProducto = formData.id || generarIdIncremental();
          const docRef = doc(db, 'PRODUCTOS', idProducto);
          await setDoc(docRef, {
            id: idProducto,
            name: formData.name,
            category: formData.category,
            stock: parseInt(formData.stock),
            price: parseFloat(formData.price)
          });
          toast.success('Producto agregado correctamente');
        }
      }
      
      setShowModal(false);
      setFormData({ id: '', name: '', category: '', stock: '', price: '', idFormulas: [], idEsencia: '', formulasPrices: {} });
      setEditingId(null);
      cargarProductos();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al guardar el producto');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (producto) => {
    setFormData({
      id: producto.id,
      name: producto.name,
      category: producto.category,
      stock: producto.stock || '',
      price: producto.price,
      idFormulas: producto.idFormula ? [producto.idFormula] : [],
      idEsencia: producto.idEsencia || '',
      formulasPrices: producto.idFormula ? { [producto.idFormula]: producto.price } : {}
    });
    setEditingId(producto.documentId);
    setShowModal(true);
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este producto?')) return;
    
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'PRODUCTOS', documentId));
      toast.success('Producto eliminado correctamente');
      cargarProductos();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al eliminar el producto');
    } finally {
      setLoading(false);
    }
  };

  const descargarExcel = () => {
    try {
      const datos = productos.map(p => ({
        ID: p.id,
        Nombre: p.name,
        Categoría: p.category,
        Stock: p.stock,
        Precio: p.price,
        'ID Fórmula': p.idFormula || ''
      }));

      const ws = XLSX.utils.json_to_sheet(datos);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Productos');
      
      ws['!cols'] = [
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 10 },
        { wch: 12 },
        { wch: 15 }
      ];

      XLSX.writeFile(wb, 'productos.xlsx');
      toast.success('Archivo descargado correctamente');
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al descargar el archivo');
    }
  };

  const descargarFormatoExcel = () => {
    try {
      const datosFormato = [
        {
          ID: '000000000001',
          Nombre: 'EJEMPLO PERFUME',
          Categoría: 'PERFUME',
          Stock: 50,
          Precio: 120000,
          'ID Fórmula': 'FORMULA001'
        },
        {
          ID: '000000000002',
          Nombre: 'EJEMPLO COLONIA',
          Categoría: 'COLONIA',
          Stock: 30,
          Precio: 85000,
          'ID Fórmula': ''
        }
      ];

      const ws = XLSX.utils.json_to_sheet(datosFormato);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Productos');
      
      ws['!cols'] = [
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 10 },
        { wch: 12 },
        { wch: 15 }
      ];

      XLSX.writeFile(wb, 'plantilla_productos.xlsx');
      toast.success('Plantilla descargada correctamente');
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al descargar la plantilla');
    }
  };

  const importarExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        setLoading(true);
        let importados = 0;
        
        for (const row of jsonData) {
          if (row.Nombre && row.Categoría && row.Stock !== undefined && row.Precio !== undefined) {
            const idProducto = row.ID ? row.ID.toString().padStart(12, '0') : generarIdIncremental();
            const docRef = doc(db, 'PRODUCTOS', idProducto);
            // Sólo incluir idFormula si viene en la fila (no crear campo vacío/null)
            const dataToSave = {
              id: idProducto,
              name: row.Nombre,
              category: row.Categoría,
              stock: parseInt(row.Stock),
              price: parseFloat(row.Precio)
            };
            if (row['ID Fórmula']) dataToSave.idFormula = row['ID Fórmula'];
            await setDoc(docRef, dataToSave);
             importados++;
          }
        }

        toast.success(`${importados} productos importados correctamente`);
        setShowImportModal(false);
        cargarProductos();
      } catch (err) {
        console.error('Error al importar:', err);
        toast.error('Error al importar el archivo');
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData({ id: '', name: '', category: '', stock: '', price: '', idFormulas: [], idEsencia: '', formulasPrices: {} });
    setEditingId(null);
    setShowFormulas(false);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
  };

  const handleLimpiarBusqueda = () => {
    setBusqueda('');
  };

  const tieneFormulas = formData.idFormulas && formData.idFormulas.length > 0;

  const obtenerUltimoIdNumerico = () => {
  const idsNumericos = productos
    .map(p => parseInt(p.id))
    .filter(id => !isNaN(id));

  return idsNumericos.length > 0 ? Math.max(...idsNumericos) : 0;
};

  return (
    <div className="inventario-container">
      <div className="inventario-header">
        <h2>📦 Gestión de Inventario</h2>
        <div className="inventario-actions">
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <FaPlus /> Agregar Producto
          </button>
          <button onClick={descargarExcel} className="btn btn-secondary" disabled={loading}>
            <FaDownload /> Descargar Excel
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary" disabled={loading}>
            <FaUpload /> Importar Excel
          </button>
        </div>
      </div>

      <div className="inventario-search">
        <div className="search-container">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por nombre o ID (ej: 1 o 000000000001)..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="search-input"
          />
          {busqueda && (
            <button onClick={handleLimpiarBusqueda} className="clear-search">
              <FaTimes />
            </button>
          )}
        </div>
        {busqueda && (
          <p className="search-results">
            Se encontraron <strong>{productosFiltrados.length}</strong> producto(s)
          </p>
        )}
      </div>

      {loading && <p className="loading">Cargando...</p>}

      <div className="productos-tabla">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>Precio</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map(prod => (
              <tr key={prod.documentId}>
                <td>{prod.id}</td>
                <td>{prod.name}</td>
                <td>{prod.category}</td>
                <td>{prod.stock}</td>
                <td>${parseFloat(prod.price).toLocaleString('es-CO')}</td>
                <td className="acciones">
                  <button onClick={() => handleEdit(prod)} className="btn-icon btn-edit" title="Editar">
                    <FaEdit />
                  </button>
                  <button onClick={() => handleDelete(prod.documentId)} className="btn-icon btn-delete" title="Eliminar">
                    <FaTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {productosFiltrados.length === 0 && (
          <p className="sin-datos">
            {busqueda ? 'No se encontraron productos con esa búsqueda' : 'No hay productos en el inventario'}
          </p>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Editar Producto' : 'Agregar Producto'}</h3>
              <button onClick={closeModal} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>ID (opcional - se genera automáticamente)</label>
                <input 
                  type="text" 
                  name="id" 
                  value={formData.id}
                  onChange={handleInputChange}
                  placeholder={`Próximo ID: ${generarIdIncremental()}`}
                />
              </div>
              <div className="form-group">
                <label>Nombre *</label>
                <input 
                  type="text" 
                  name="name" 
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Nombre del producto"
                  required
                />
              </div>
              <div className="form-group">
                <label>Categoría *</label>
                <input 
                  type="text" 
                  name="category" 
                  value={formData.category}
                  onChange={handleInputChange}
                  placeholder="Ej: Perfume, Colonia"
                  list="categorias-list"
                  required
                />
                <datalist id="categorias-list">
                  {categorias.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div className="forms-group">
                <label className="formula-toggle">
  <input
    type="checkbox"
    checked={showFormulas}
    onChange={handleToggleFormulas}
  />
  <span className="toggle-slider"></span>
  <span className="toggle-text">¿Este producto tiene fórmula?</span>
</label>

              </div>

              {showFormulas && (
                <>
                  <div className="form-group">
                    <label>Selecciona Fórmulas *</label>
                    {formData.idFormulas.length > 0 && (
                      <div className="selected-formulas">
                        {formData.idFormulas.map(formulaId => (
                          <span key={formulaId} className="formula-tag">
                            {formulaId}
                            <button
                              type="button"
                              onClick={() => handleSelectFormula(formulaId)}
                              className="formula-tag-remove"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="formulas-list">
                      {loadingFormulas ? (
                        <p className="formulas-loading">Cargando fórmulas...</p>
                      ) : formulas.length > 0 ? (
                        <ul className="formulas-dropdown">
                          {formulas.map(formula => (
                            <li key={formula.id} className="formula-item">
                              <button
                                type="button"
                                onClick={() => handleSelectFormula(formula.id)}
                                className={`formula-button ${formData.idFormulas.includes(formula.id) ? 'selected' : ''}`}
                              >
                                <div className="formula-header">
                                  <strong>{formula.id}</strong>
                                  {formData.idFormulas.includes(formula.id) && <span>✓</span>}
                                </div>
                                <div className="formula-details">
                                  <span>🧪 Alcohol: {formula.alcohol}g</span>
                                  <span>🌿 Esencia: {formula.esenciagr}g</span>
                                  <span>💫 Feromonas: {formula.feromonasgotas} gotas</span>
                                  <span>🔒 Fijador: {formula.fijadorgr}g</span>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="formulas-empty">No hay fórmulas disponibles</p>
                      )}
                    </div>
                  </div>

                  {/* Inputs de precio por fórmula seleccionada */}
                  {formData.idFormulas.length > 0 && (
                    <div className="formulas-prices">
                      <label style={{ fontWeight: 600, marginBottom: '12px', display: 'block' }}>Precio por Fórmula *</label>
                      {formData.idFormulas.map(formulaId => (
                        <div key={formulaId} className="form-group" style={{ marginBottom: '12px' }}>
                          <label>{formulaId}</label>
                          <input 
                            type="number" 
                            value={formData.formulasPrices[formulaId] || ''}
                            onChange={(e) => handleFormulaPriceChange(formulaId, e.target.value)}
                            placeholder={`Precio para ${formulaId}`}
                            step="0.01"
                            min="0"
                            required
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="form-group">
                    <label>Esencia *</label>
                    {loadingEsencias ? (
                      <p style={{ color: 'var(--color-text-soft)', fontSize: '13px' }}>Cargando esencias...</p>
                    ) : (
                      <select
                        name="idEsencia"
                        value={formData.idEsencia}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">-- Selecciona una esencia --</option>
                        {esencias.map(esencia => (
                          <option key={esencia.id} value={esencia.id}>
                            {esencia.nombre || esencia.name || esencia.id}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}

              {!tieneFormulas && (
                <>
                  <div className="form-group">
                    <label>Stock *</label>
                    <input 
                      type="number" 
                      name="stock" 
                      value={formData.stock}
                      onChange={handleInputChange}
                      placeholder="Cantidad"
                      min="0"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Precio *</label>
                    <input 
                      type="number" 
                      name="price" 
                      value={formData.price}
                      onChange={handleInputChange}
                      placeholder="Precio"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>
                </>
              )}

              <div className="form-actions">
                <button type="button" onClick={closeModal} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={closeImportModal}>
          <div className="modal modal-import" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📥 Importar Productos desde Excel</h3>
              <button onClick={closeImportModal} className="close-btn">&times;</button>
            </div>
            <div className="modal-content">
              <div className="import-info">
                <h4>Formato esperado del Excel:</h4>
                <div className="formato-tabla">
                  <table>
                    <thead>
                      <tr>
                        <th>Columna A</th>
                        <th>Columna B</th>
                        <th>Columna C</th>
                        <th>Columna D</th>
                        <th>Columna E</th>
                        <th>Columna F</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="header-cell">ID</td>
                        <td className="header-cell">Nombre</td>
                        <td className="header-cell">Categoría</td>
                        <td className="header-cell">Stock</td>
                        <td className="header-cell">Precio</td>
                        <td className="header-cell">ID Fórmula</td>
                      </tr>
                      <tr>
                        <td className="type-cell">String (12 dígitos)</td>
                        <td className="type-cell">String (MAYÚSCULAS)</td>
                        <td className="type-cell">String</td>
                        <td className="type-cell">Número</td>
                        <td className="type-cell">Número</td>
                        <td className="type-cell">String (opcional)</td>
                      </tr>
                      <tr>
                        <td className="example-cell">000000000001</td>
                        <td className="example-cell">PERFUME ROSA</td>
                        <td className="example-cell">PERFUME</td>
                        <td className="example-cell">50</td>
                        <td className="example-cell">120000</td>
                        <td className="example-cell">FORMULA001</td>
                      </tr>
                      <tr>
                        <td className="example-cell">000000000002</td>
                        <td className="example-cell">COLONIA LAVANDA</td>
                        <td className="example-cell">COLONIA</td>
                        <td className="example-cell">30</td>
                        <td className="example-cell">85000</td>
                        <td className="example-cell"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="import-notes">
                  <h5>📝 Notas importantes:</h5>
                  <ul>
                    <li><strong>ID:</strong> Debe tener 12 dígitos con ceros a la izquierda. Se genera automáticamente si está vacío.</li>
                    <li><strong>Nombre:</strong> Será convertido automáticamente a MAYÚSCULAS.</li>
                    <li><strong>Categoría:</strong> Campo obligatorio. Debe coincidir con categorías existentes o crear nuevas.</li>
                    <li><strong>Stock:</strong> Número entero positivo obligatorio.</li>
                    <li><strong>Precio:</strong> Número decimal obligatorio.</li>
                    <li><strong>ID Fórmula:</strong> Campo opcional. Déjalo en blanco si no aplica.</li>
                  </ul>
                </div>
              </div>

              <div className="import-actions">
                <button onClick={descargarFormatoExcel} className="btn btn-secondary">
                  <FaDownload /> Descargar Plantilla
                </button>
                <label className="btn btn-primary">
                  <FaUpload /> Seleccionar Archivo
                  <input 
                    type="file" 
                    accept=".xlsx,.xls" 
                    onChange={importarExcel}
                    style={{ display: 'none' }}
                    disabled={loading}
                  />
                </label>
              </div>

              <button onClick={closeImportModal} className="btn btn-secondary" style={{ marginTop: '15px', width: '100%' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
