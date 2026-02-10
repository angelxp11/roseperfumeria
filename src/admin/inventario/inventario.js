import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, deleteField, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import * as XLSX from 'xlsx';
import { FaPlus, FaEdit, FaTrash, FaDownload, FaUpload, FaSearch, FaTimes } from 'react-icons/fa';
import './inventario.css';

const CACHE_KEY = 'productos_cache';
const CACHE_TIMESTAMP_KEY = 'productos_cache_timestamp';
const CACHE_VERSION_KEY = 'productos_cache_version';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos en ms

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
    formulasPrices: {},
    esenciaGramos: ''
  });
  const [categorias, setCategorias] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [esencias, setEsencias] = useState([]);
  const [showFormulas, setShowFormulas] = useState(false);
  const [loadingFormulas, setLoadingFormulas] = useState(false);
  const [loadingEsencias, setLoadingEsencias] = useState(false);

  // Refs para listener y debounce
  const unsubscribeRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const cacheInitializedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    inicializarDatos();
    
    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      filtrarProductos();
    }, 300);
  }, [busqueda, productos]);

  useEffect(() => {
    if (showModal && esencias.length === 0) {
      cargarEsencias();
    }
  }, [showModal]);

  // ====== CACHÉ FUNCTIONS ======
  const obtenerProductosDelCache = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      
      if (!cached || !timestamp) return null;
      
      const ahora = Date.now();
      const tiempoTranscurrido = ahora - parseInt(timestamp);
      
      if (tiempoTranscurrido > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
        return null;
      }
      
      return JSON.parse(cached);
    } catch (err) {
      console.error('Error al leer caché:', err);
      return null;
    }
  };

  const guardarProductosEnCache = (prods) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(prods));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (err) {
      console.error('Error al guardar caché:', err);
    }
  };

  const actualizarProductoEnCache = (productoActualizado) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return;
      
      const prods = JSON.parse(cached);
      const indice = prods.findIndex(p => p.documentId === productoActualizado.documentId);
      
      if (indice !== -1) {
        prods[indice] = productoActualizado;
        guardarProductosEnCache(prods);
      }
    } catch (err) {
      console.error('Error al actualizar caché:', err);
    }
  };

  const agregarProductoAlCache = (productoNuevo) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const prods = cached ? JSON.parse(cached) : [];
      prods.push(productoNuevo);
      guardarProductosEnCache(prods);
    } catch (err) {
      console.error('Error al agregar a caché:', err);
    }
  };

  const eliminarProductoDelCache = (documentId) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return;
      
      const prods = JSON.parse(cached);
      const filtrados = prods.filter(p => p.documentId !== documentId);
      guardarProductosEnCache(filtrados);
    } catch (err) {
      console.error('Error al eliminar de caché:', err);
    }
  };

  // ====== INITIALIZE ======
  const inicializarDatos = async () => {
    try {
      setLoading(true);
      
      // Intentar obtener del caché primero
      const productosEnCache = obtenerProductosDelCache();
      
      if (productosEnCache && productosEnCache.length > 0) {
        // Usar caché mientras se sincroniza con servidor
        if (isMountedRef.current) {
          setProductos(productosEnCache);
          setProductosFiltrados(productosEnCache);
          const cats = new Set(productosEnCache.map(p => p.category).filter(Boolean));
          setCategorias(Array.from(cats));
        }
      }
      
      // Configurar listener en tiempo real (sin descargar todo nuevamente)
      configurarListenerTiempoReal();
      
    } catch (err) {
      console.error('Error al inicializar:', err);
      toast.error('Error al cargar productos', { containerId: 'local', position: 'top-right' });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ====== LISTENER TIEMPO REAL ======
  const configurarListenerTiempoReal = () => {
    try {
      const productosRef = collection(db, 'PRODUCTOS');
      
      unsubscribeRef.current = onSnapshot(productosRef, (snapshot) => {
        if (!isMountedRef.current) return;
        
        const prods = snapshot.docs.map(doc => ({
          documentId: doc.id,
          ...doc.data()
        }));
        
        setProductos(prods);
        setProductosFiltrados(prods);
        guardarProductosEnCache(prods);
        
        const cats = new Set(prods.map(p => p.category).filter(Boolean));
        setCategorias(Array.from(cats));
        
      }, (error) => {
        console.error('Error en listener:', error);
      });
    } catch (err) {
      console.error('Error al configurar listener:', err);
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
      frms.sort((a, b) => {
        const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      if (isMountedRef.current) {
        setFormulas(frms);
      }
    } catch (err) {
      console.error('Error al cargar fórmulas:', err);
      toast.error('Error al cargar fórmulas', { containerId: 'local', position: 'top-right' });
    } finally {
      if (isMountedRef.current) {
        setLoadingFormulas(false);
      }
    }
  };

  const cargarEsencias = async () => {
    try {
      setLoadingEsencias(true);
      const esenciasRef = collection(db, 'ESENCIA');
      const insumosRef = collection(db, 'INSUMOS');
      const [esenciasSnap, insumosSnap] = await Promise.all([getDocs(esenciasRef), getDocs(insumosRef)]);
      
      const esen = esenciasSnap.docs.map(d => ({ documentId: d.id, id: d.id, tipo: 'ESENCIA', ...d.data() }));
      const insu = insumosSnap.docs.map(d => ({ documentId: d.id, id: d.id, tipo: 'INSUMOS', ...d.data() }));
      
      const esenFiltradas = esen.filter(e => {
        const genero = (e.genero || '').toString().trim().toUpperCase();
        return genero !== 'PRODUCCION';
      });
      
      const combinadas = [...esenFiltradas, ...insu];
      if (isMountedRef.current) {
        setEsencias(combinadas);
      }
    } catch (err) {
      console.error('Error al cargar esencias:', err);
      toast.error('Error al cargar esencias', { containerId: 'local', position: 'top-right' });
    } finally {
      if (isMountedRef.current) {
        setLoadingEsencias(false);
      }
    }
  };

  const handleToggleFormulas = async () => {
    if (!showFormulas) {
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
    if (!isNaN(id)) {
      return parseInt(id).toString().padStart(12, '0');
    }
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

    if (name === 'category' && value.toString().trim().toUpperCase() === 'ADICIONALES' && esencias.length === 0) {
      cargarEsencias();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const tieneFormulas = formData.idFormulas && formData.idFormulas.length > 0;
    
    if (!formData.name || !formData.category) {
      toast.error('Por favor completa todos los campos requeridos', { containerId: 'local', position: 'top-right' });
      return;
    }

    const categoriaUpper = (formData.category || '').toString().trim().toUpperCase();

    if (tieneFormulas) {
      if (!formData.idEsencia) {
        toast.error('Por favor selecciona una esencia', { containerId: 'local', position: 'top-right' });
        return;
      }
      if (formData.price === '' || formData.price === undefined) {
        toast.error('Por favor ingresa el precio para el producto con fórmula', { containerId: 'local', position: 'top-right' });
        return;
      }
      if (isNaN(parseFloat(formData.price))) {
        toast.error('Por favor ingresa un precio válido', { containerId: 'local', position: 'top-right' });
        return;
      }
    } else {
      if (categoriaUpper === 'ADICIONALES') {
        if (!formData.idEsencia || !formData.esenciaGramos || formData.price === '' || formData.price === undefined) {
          toast.error('Para la categoría ADICIONALES selecciona la esencia, los gramos por unidad y el precio', { containerId: 'local', position: 'top-right' });
          return;
        }
      } else {
        if (!formData.stock || !formData.price) {
          toast.error('Por favor completa el stock y precio', { containerId: 'local', position: 'top-right' });
          return;
        }
      }
    }

    try {
      setLoading(true);
      
      if (editingId) {
        // EDICIÓN: actualizar solo el documento específico
        const idProducto = formData.id || generarIdIncremental();
        const docRef = doc(db, 'PRODUCTOS', editingId);
        
        const dataToUpdate = {
          id: idProducto,
          name: formData.name,
          category: formData.category
        };

        if (tieneFormulas) {
          if (formData.idFormulas.length !== 1) {
            toast.error('Para editar un producto con fórmula, selecciona exactamente una fórmula.', { containerId: 'local', position: 'top-right' });
            setLoading(false);
            return;
          }
          const formulaId = formData.idFormulas[0];
          const precio = parseFloat(formData.price);
          if (isNaN(precio)) {
            toast.error('Por favor ingresa un precio válido para el producto con fórmula', { containerId: 'local', position: 'top-right' });
            setLoading(false);
            return;
          }

          dataToUpdate.idFormula = formulaId;
          dataToUpdate.price = precio;
          dataToUpdate.idEsencia = formData.idEsencia || deleteField();
          dataToUpdate.stock = deleteField();
          dataToUpdate.idFormulas = deleteField();
          dataToUpdate.formulasPrices = deleteField();
        } else {
          dataToUpdate.idFormulas = deleteField();
          dataToUpdate.idEsencia = deleteField();
          dataToUpdate.formulasPrices = deleteField();
          dataToUpdate.idFormula = deleteField();

          if (categoriaUpper === 'ADICIONALES') {
            dataToUpdate.stock = deleteField();
            dataToUpdate.idEsencia = formData.idEsencia;
            dataToUpdate.esenciaGramos = Number(formData.esenciaGramos);
            dataToUpdate.price = parseFloat(formData.price);
          } else {
            dataToUpdate.stock = parseInt(formData.stock);
            dataToUpdate.price = parseFloat(formData.price);
            dataToUpdate.idEsencia = deleteField();
            dataToUpdate.esenciaGramos = deleteField();
          }
        }

        await updateDoc(docRef, dataToUpdate);
        
        // Actualizar en caché y estado sin hacer consulta adicional
        const productoActualizado = {
          documentId: editingId,
          ...dataToUpdate
        };
        actualizarProductoEnCache(productoActualizado);
        setProductos(prev => prev.map(p => p.documentId === editingId ? productoActualizado : p));
        
        toast.success('Producto actualizado correctamente', { containerId: 'local', position: 'top-right' });
      } else {
        // CREACIÓN: agregar productos nuevos
        if (tieneFormulas) {
          let ultimoId = obtenerUltimoIdNumerico();
          let productosCreados = 0;
          const precioComun = parseFloat(formData.price);

          for (const formulaId of formData.idFormulas) {
            ultimoId++;
            const idProducto = ultimoId.toString().padStart(12, '0');
            const numberMatch = formulaId.match(/(\d+)/);
            const gramos = numberMatch ? numberMatch[1] : '';
            const nombreProducto = gramos
              ? `${formData.name} ${gramos}GR`
              : formData.name;

            const productoNuevo = {
              id: idProducto,
              name: nombreProducto,
              category: formData.category,
              price: precioComun,
              idFormula: formulaId,
              idEsencia: formData.idEsencia
            };

            await setDoc(doc(db, 'PRODUCTOS', idProducto), productoNuevo);
            agregarProductoAlCache({ documentId: idProducto, ...productoNuevo });
            productosCreados++;
          }

          toast.success(`${productosCreados} producto(s) agregado(s) correctamente`, { containerId: 'local', position: 'top-right' });
        } else {
          const idProducto = formData.id || generarIdIncremental();
          const productoNuevo = {
            id: idProducto,
            name: formData.name,
            category: formData.category
          };

          if (categoriaUpper === 'ADICIONALES') {
            productoNuevo.price = parseFloat(formData.price);
            productoNuevo.idEsencia = formData.idEsencia;
            productoNuevo.esenciaGramos = Number(formData.esenciaGramos);
          } else {
            productoNuevo.stock = parseInt(formData.stock);
            productoNuevo.price = parseFloat(formData.price);
          }

          await setDoc(doc(db, 'PRODUCTOS', idProducto), productoNuevo);
          agregarProductoAlCache({ documentId: idProducto, ...productoNuevo });
          
          const tipoMsg = categoriaUpper === 'ADICIONALES' ? 'Adicional' : 'Producto';
          toast.success(`${tipoMsg} agregado correctamente`, { containerId: 'local', position: 'top-right' });
        }
      }
      
      setShowModal(false);
      setFormData({ id: '', name: '', category: '', stock: '', price: '', idFormulas: [], idEsencia: '', formulasPrices: {}, esenciaGramos: '' });
      setEditingId(null);
      // NO llamar a cargarProductos() - el listener ya actualiza automáticamente
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al guardar el producto', { containerId: 'local', position: 'top-right' });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
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
      formulasPrices: {},
      esenciaGramos: producto.esenciaGramos || ''
    });
    setEditingId(producto.documentId);
    setShowModal(true);
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este producto?')) return;
    
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'PRODUCTOS', documentId));
      
      // Actualizar caché y estado inmediatamente
      eliminarProductoDelCache(documentId);
      setProductos(prev => prev.filter(p => p.documentId !== documentId));
      
      toast.success('Producto eliminado correctamente', { containerId: 'local', position: 'top-right' });
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al eliminar el producto', { containerId: 'local', position: 'top-right' });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const descargarExcel = () => {
    try {
      const datos = productos.map(p => ({
        ID: p.id,
        Nombre: p.name,
        Categoría: p.category,
        Stock: p.idFormula ? '' : p.stock,
        Precio: p.price,
        'ID Fórmula': p.idFormula || '',
        'ID Esencia': p.idEsencia || '',
        'Esencia Gramos': p.esenciaGramos || ''
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
        { wch: 15 },
        { wch: 15 },
        { wch: 12 }
      ];
      XLSX.writeFile(wb, 'productos.xlsx');
      toast.success('Archivo descargado correctamente', { containerId: 'local', position: 'top-right' });
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al descargar el archivo', { containerId: 'local', position: 'top-right' });
    }
  };

  const descargarFormatoExcel = () => {
    try {
      const datosFormato = [
        {
          ID: '000000000001',
          Nombre: 'EJEMPLO PERFUME',
          Categoría: 'PERFUME',
          Stock: '',
          Precio: 120000,
          'ID Fórmula': 'FORMULA001',
          'ID Esencia': 'ESENCIA001',
          'Esencia Gramos': ''
        },
        {
          ID: '000000000002',
          Nombre: 'EJEMPLO COLONIA',
          Categoría: 'COLONIA',
          Stock: 30,
          Precio: 85000,
          'ID Fórmula': '',
          'ID Esencia': '',
          'Esencia Gramos': ''
        },
        {
          ID: '000000000003',
          Nombre: 'ADICIONAL EJEMPLO',
          Categoría: 'ADICIONALES',
          Stock: '',
          Precio: 5000,
          'ID Fórmula': '',
          'ID Esencia': 'ESENCIA002',
          'Esencia Gramos': 5
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
        { wch: 15 },
        { wch: 15 },
        { wch: 12 }
      ];
      XLSX.writeFile(wb, 'plantilla_productos.xlsx');
      toast.success('Plantilla descargada correctamente', { containerId: 'local', position: 'top-right' });
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al descargar la plantilla', { containerId: 'local', position: 'top-right' });
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
        let saltados = 0;
        const productosImportados = [];
        
        for (const row of jsonData) {
          if (!row.Nombre || !row.Categoría) {
            saltados++;
            continue;
          }

          const categoriaUpper = (row.Categoría || '').toString().trim().toUpperCase();
          const tieneFormula = row['ID Fórmula'] && row['ID Fórmula'].toString().trim() !== '';
          const precioRaw = row['Precio'] !== undefined ? row['Precio'] : '';
          const stockRaw = row['Stock'] !== undefined ? row['Stock'] : '';
          const idEsenciaRaw = row['ID Esencia'] !== undefined ? row['ID Esencia'] : '';
          const gramosRaw = row['Esencia Gramos'] !== undefined ? row['Esencia Gramos'] : '';

          const idProducto = row.ID ? row.ID.toString().padStart(12, '0') : generarIdIncremental();

          if (tieneFormula) {
            if (precioRaw === '' || precioRaw === undefined) {
              saltados++;
              continue;
            }
            const docRef = doc(db, 'PRODUCTOS', idProducto);
            const productoNuevo = {
              id: idProducto,
              name: row.Nombre,
              category: row.Categoría,
              price: parseFloat(precioRaw),
              idFormula: row['ID Fórmula'],
              idEsencia: idEsenciaRaw || deleteField()
            };
            await setDoc(docRef, productoNuevo);
            productosImportados.push({ documentId: idProducto, ...productoNuevo });
            importados++;
          } else if (categoriaUpper === 'ADICIONALES') {
            if (!idEsenciaRaw || gramosRaw === undefined || gramosRaw === '' || precioRaw === '' || precioRaw === undefined) {
              saltados++;
              continue;
            }
            const docRef = doc(db, 'PRODUCTOS', idProducto);
            const productoNuevo = {
              id: idProducto,
              name: row.Nombre,
              category: row.Categoría,
              price: parseFloat(precioRaw),
              idEsencia: idEsenciaRaw,
              esenciaGramos: Number(gramosRaw)
            };
            await setDoc(docRef, productoNuevo);
            productosImportados.push({ documentId: idProducto, ...productoNuevo });
            importados++;
          } else {
            if (precioRaw === '' || precioRaw === undefined || stockRaw === undefined || stockRaw === '') {
              saltados++;
              continue;
            }
            const docRef = doc(db, 'PRODUCTOS', idProducto);
            const productoNuevo = {
              id: idProducto,
              name: row.Nombre,
              category: row.Categoría,
              stock: parseInt(stockRaw),
              price: parseFloat(precioRaw)
            };
            await setDoc(docRef, productoNuevo);
            productosImportados.push({ documentId: idProducto, ...productoNuevo });
            importados++;
          }
        }

        // Actualizar caché con los nuevos productos
        productosImportados.forEach(p => agregarProductoAlCache(p));

        toast.success(`${importados} productos importados correctamente${saltados ? `, ${saltados} fila(s) omitida(s)` : ''}`, { containerId: 'local', position: 'top-right' });
        setShowImportModal(false);
        // NO llamar a cargarProductos() - el listener ya actualiza automáticamente
      } catch (err) {
        console.error('Error al importar:', err);
        toast.error('Error al importar el archivo', { containerId: 'local', position: 'top-right' });
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData({ id: '', name: '', category: '', stock: '', price: '', idFormulas: [], idEsencia: '', formulasPrices: {}, esenciaGramos: '' });
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
                  placeholder="Ej: Perfume, Colonia, ADICIONALES"
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

                  {formData.idFormulas.length > 0 && (
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
                          <option key={esencia.documentId} value={esencia.id}>
                            {`${esencia.name || esencia.nombre || esencia.id} ${esencia.tipo === 'INSUMOS' ? '(INSUMO)' : '(ESENCIA)'} (stock: ${esencia.stock || 0}g)`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}

              {!tieneFormulas && ((formData.category || '').toString().trim().toUpperCase() === 'ADICIONALES') ? (
                <>
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
                        <option value="">-- Selecciona una esencia/insumo --</option>
                        {esencias.map(esencia => (
                          <option key={esencia.documentId} value={esencia.id}>
                            {`${esencia.name || esencia.nombre || esencia.id} ${esencia.tipo === 'INSUMOS' ? '(INSUMO)' : '(ESENCIA)'} (stock: ${esencia.stock || 0}g)`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Gramos por unidad *</label>
                    <input 
                      type="number" 
                      name="esenciaGramos" 
                      value={formData.esenciaGramos}
                      onChange={handleInputChange}
                      placeholder="Ej: 5"
                      min="1"
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
              ) : (
                !tieneFormulas && (
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
                )
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
                        <th>Columna G</th>
                        <th>Columna H</th>
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
                        <td className="header-cell">ID Esencia</td>
                        <td className="header-cell">Esencia Gramos</td>
                      </tr>
                      <tr>
                        <td className="type-cell">String (12 dígitos)</td>
                        <td className="type-cell">String (MAYÚSCULAS)</td>
                        <td className="type-cell">String</td>
                        <td className="type-cell">Número</td>
                        <td className="type-cell">Número</td>
                        <td className="type-cell">String (opcional)</td>
                        <td className="type-cell">String (opcional)</td>
                        <td className="type-cell">Número (opcional)</td>
                      </tr>
                      <tr>
                        <td className="example-cell">000000000001</td>
                        <td className="example-cell">PERFUME ROSA</td>
                        <td className="example-cell">PERFUME</td>
                        <td className="example-cell"></td>
                        <td className="example-cell">120000</td>
                        <td className="example-cell">FORMULA001</td>
                        <td className="example-cell">ESENCIA001</td>
                        <td className="example-cell"></td>
                      </tr>
                      <tr>
                        <td className="example-cell">000000000002</td>
                        <td className="example-cell">COLONIA LAVANDA</td>
                        <td className="example-cell">COLONIA</td>
                        <td className="example-cell">30</td>
                        <td className="example-cell">85000</td>
                        <td className="example-cell"></td>
                        <td className="example-cell"></td>
                        <td className="example-cell"></td>
                      </tr>
                      <tr>
                        <td className="example-cell">000000000003</td>
                        <td className="example-cell">ADICIONAL EJEMPLO</td>
                        <td className="example-cell">ADICIONALES</td>
                        <td className="example-cell"></td>
                        <td className="example-cell">5000</td>
                        <td className="example-cell"></td>
                        <td className="example-cell">ESENCIA002</td>
                        <td className="example-cell">5</td>
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
                    <li><strong>Stock:</strong> Para productos SIN fórmula: campo obligatorio. Para productos CON fórmula: no es necesario (dejar en blanco).</li>
                    <li><strong>Precio:</strong> Para productos CON fórmula: indique el precio en esta columna. Para productos SIN fórmula: número decimal obligatorio.</li>
                    <li><strong>ID Fórmula:</strong> Campo opcional. Déjalo en blanco si no aplica.</li>
                    <li><strong>ID Esencia / Esencia Gramos:</strong> Para ADICIONALES, deben proveerse. Para productos con fórmula, puedes indicar ID Esencia si aplica.</li>
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
