import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { FaPlus, FaEdit, FaTrash, FaDownload, FaUpload, FaSearch, FaTimes } from 'react-icons/fa';
import './AdminEsencias.css';

export default function AdminEsencias() {
  const [esencias, setEsencias] = useState([]);
  const [esenciasFiltradas, setEsenciasFiltradas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [cambiosImportacion, setCambiosImportacion] = useState([]);
  const [resumenImportacion, setResumenImportacion] = useState(null);
  const [filtroTipoImportacion, setFiltroTipoImportacion] = useState('');
  const [filtroAccionImportacion, setFiltroAccionImportacion] = useState('');
  const [filtroCampoImportacion, setFiltroCampoImportacion] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    genero: '',
    stock: '',
    tipo: 'ESENCIA'
  });

  useEffect(() => {
    cargarEsencias();
  }, []);

  const cargarEsencias = async () => {
    try {
      setLoading(true);
      
      // Cargar ESENCIA
      const esenciaRef = collection(db, 'ESENCIA');
      const esenciaSnap = await getDocs(esenciaRef);
      const esenciasData = esenciaSnap.docs.map(doc => ({
        documentId: doc.id,
        tipo: 'ESENCIA',
        ...doc.data()
      }));

      // Cargar INSUMOS
      const insumosRef = collection(db, 'INSUMOS');
      const insumosSnap = await getDocs(insumosRef);
      const insumosData = insumosSnap.docs.map(doc => ({
        documentId: doc.id,
        tipo: 'INSUMOS',
        ...doc.data()
      }));

      const todosDatos = [...esenciasData, ...insumosData];
      setEsencias(todosDatos);
      setEsenciasFiltradas(todosDatos);
    } catch (err) {
      console.error('Error al cargar esencias:', err);
      toast.error('Error al cargar esencias');
    } finally {
      setLoading(false);
    }
  };

  const filtrarEsencias = () => {
    if (!busqueda.trim()) {
      const filtrados = tipoFiltro === 'todos' 
        ? esencias 
        : esencias.filter(e => e.tipo === tipoFiltro);
      setEsenciasFiltradas(filtrados);
      return;
    }

    const busquedaLower = busqueda.toLowerCase().trim();
    let filtrados = esencias.filter(esc => {
      const coincideNombre = esc.name && esc.name.toLowerCase().includes(busquedaLower);
      const coincideId = esc.id && esc.id.toLowerCase().includes(busquedaLower);
      return coincideNombre || coincideId;
    });

    if (tipoFiltro !== 'todos') {
      filtrados = filtrados.filter(e => e.tipo === tipoFiltro);
    }

    setEsenciasFiltradas(filtrados);
  };

  useEffect(() => {
    filtrarEsencias();
  }, [busqueda, esencias, tipoFiltro]);

  const generarIdIncremental = () => {
    const idsNumericos = esencias
      .map(e => parseInt(e.id))
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
    
    if (!formData.name || !formData.stock) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    if (editingId && !formData.genero) {
      toast.error('Por favor completa el género');
      return;
    }

    try {
      setLoading(true);
      const idEsencia = formData.id || generarIdIncremental();
      
      if (editingId) {
        const esenciaActual = esencias.find(e => e.documentId === editingId);
        const coleccion = esenciaActual.tipo === 'INSUMOS' ? 'INSUMOS' : 'ESENCIA';
        const docRef = doc(db, coleccion, editingId);
        
        await updateDoc(docRef, {
          id: idEsencia,
          name: formData.name,
          genero: formData.genero,
          stock: parseFloat(formData.stock)
        });
        toast.success('Elemento actualizado correctamente');
      } else {
        const coleccion = formData.tipo === 'INSUMOS' ? 'INSUMOS' : 'ESENCIA';
        const docRef = doc(db, coleccion, idEsencia);
        await setDoc(docRef, {
          id: idEsencia,
          name: formData.name,
          genero: formData.genero,
          stock: parseFloat(formData.stock)
        });
        toast.success('Elemento agregado correctamente');
      }
      
      setShowModal(false);
      setFormData({ id: '', name: '', genero: '', stock: '', tipo: 'ESENCIA' });
      setEditingId(null);
      cargarEsencias();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (documentId, tipo) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este elemento?')) return;
    
    try {
      setLoading(true);
      const coleccion = tipo === 'INSUMOS' ? 'INSUMOS' : 'ESENCIA';
      await deleteDoc(doc(db, coleccion, documentId));
      toast.success('Elemento eliminado correctamente');
      cargarEsencias();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al eliminar');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (esencia) => {
    setFormData({
      id: esencia.id,
      name: esencia.name,
      genero: esencia.genero || '',
      stock: esencia.stock,
      tipo: esencia.tipo
    });
    setEditingId(esencia.documentId);
    setShowModal(true);
  };

  const descargarExcel = () => {
    try {
      const datos = esencias.map(e => ({
        Tipo: e.tipo,
        ID: e.id,
        Nombre: e.name,
        Género: e.genero,
        'Stock (gr)': e.stock
      }));

      const ws = XLSX.utils.json_to_sheet(datos);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Esencias');
      
      ws['!cols'] = [
        { wch: 12 },
        { wch: 25 },
        { wch: 15 },
        { wch: 14 }
      ];

      XLSX.writeFile(wb, 'esencias.xlsx');
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
          Tipo: 'ESENCIA',
          ID: '000000000001',
          Nombre: 'ROSA ROJA',
          Género: 'Floral',
          'Stock (gr)': 500
        },
        {
          Tipo: 'ESENCIA',
          ID: '000000000002',
          Nombre: 'LAVANDA',
          Género: 'Herbáceo',
          'Stock (gr)': 750
        },
        {
          Tipo: 'INSUMOS',
          ID: 'ALCOHOL',
          Nombre: 'ALCOHOL',
          Género: 'Insumo',
          'Stock (gr)': 1000
        },
        {
          Tipo: 'INSUMOS',
          ID: 'FIJADOR',
          Nombre: 'FIJADOR',
          Género: 'Insumo',
          'Stock (gr)': 500
        }
      ];

      const ws = XLSX.utils.json_to_sheet(datosFormato);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Esencias e Insumos');
      
      ws['!cols'] = [
        { wch: 12 },
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 14 }
      ];

      XLSX.writeFile(wb, 'plantilla_esencias_insumos.xlsx');
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
        let importadas = 0;
        let errores = 0;
        
        for (const row of jsonData) {
          if (!row.Nombre || !row['Stock (gr)'] === undefined) {
            errores++;
            continue;
          }

          // Usar el género para determinar si es INSUMO o ESENCIA
          const esInsumo = (row.Género || '').toUpperCase() === 'INSUMO';
          const coleccion = esInsumo ? 'INSUMOS' : 'ESENCIA';
          
          // Para INSUMOS, usar el ID como documentId; para ESENCIA, generar ID de 12 dígitos
          let idEsencia;
          if (esInsumo) {
            idEsencia = row.ID ? row.ID.toString().toUpperCase() : 'INSUMO_' + Date.now();
          } else {
            idEsencia = row.ID ? row.ID.toString().padStart(12, '0') : generarIdIncremental();
          }

          const docRef = doc(db, coleccion, idEsencia);
          await setDoc(docRef, {
            id: idEsencia,
            name: row.Nombre.toUpperCase(),
            genero: row.Género || 'Sin género',
            stock: parseFloat(row['Stock (gr)']) || 0
          });
          importadas++;
        }

        const mensaje = errores > 0 
          ? `${importadas} elementos importados correctamente. ${errores} filas omitidas.`
          : `${importadas} elementos importados correctamente`;
        
        toast.success(mensaje);
        setShowImportModal(false);
        cargarEsencias();
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

  const prepararActualizacionExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
        if (!workbook.SheetNames.length) throw new Error('El archivo no contiene hojas');

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        const [esenciasSnap, insumosSnap] = await Promise.all([
          getDocs(collection(db, 'ESENCIA')),
          getDocs(collection(db, 'INSUMOS'))
        ]);
        const porColeccion = {
          ESENCIA: new Map(),
          INSUMOS: new Map()
        };
        let ultimoIdEsencia = 0;
        esenciasSnap.docs.forEach(esenciaDoc => {
          const esencia = { documentId: esenciaDoc.id, ...esenciaDoc.data() };
          porColeccion.ESENCIA.set(String(esencia.id || esencia.documentId), esencia);
          porColeccion.ESENCIA.set(String(esencia.documentId), esencia);
          const idNumerico = parseInt(esencia.id || esencia.documentId, 10);
          if (Number.isFinite(idNumerico)) ultimoIdEsencia = Math.max(ultimoIdEsencia, idNumerico);
        });
        insumosSnap.docs.forEach(insumoDoc => {
          const insumo = { documentId: insumoDoc.id, ...insumoDoc.data() };
          porColeccion.INSUMOS.set(String(insumo.id || insumo.documentId).toUpperCase(), insumo);
          porColeccion.INSUMOS.set(String(insumo.documentId).toUpperCase(), insumo);
        });

        const columnas = [
          { columna: 'Nombre', campo: 'name', etiqueta: 'Nombre', tipo: 'texto' },
          { columna: 'Género', campo: 'genero', etiqueta: 'Género', tipo: 'texto' },
          { columna: 'Stock (gr)', campo: 'stock', etiqueta: 'Stock (gr)', tipo: 'numero' }
        ];
        const cambios = [];
        const idsProcesados = new Set();
        let filasInvalidas = 0;
        let elementosNuevos = 0;

        filas.forEach((fila, indice) => {
          const idOriginal = String(fila.ID ?? '').trim();
          const genero = String(fila.Género ?? '').trim();
          const tipoDeclarado = String(fila.Tipo ?? '').trim().toUpperCase();
          const tipoTentativo = tipoDeclarado === 'INSUMO' || tipoDeclarado === 'INSUMOS'
            ? 'INSUMOS'
            : tipoDeclarado === 'ESENCIA'
              ? 'ESENCIA'
              : genero.toUpperCase() === 'INSUMO' || genero.toUpperCase() === 'INSUMOS'
                ? 'INSUMOS'
                : 'ESENCIA';

          let id = idOriginal
            ? tipoTentativo === 'INSUMOS' ? idOriginal.toUpperCase() : idOriginal.padStart(12, '0')
            : '';
          let existente = id
            ? porColeccion[tipoTentativo].get(id)
            : null;
          let tipo = existente ? tipoTentativo : tipoTentativo;

          if (!existente && idOriginal && !tipoDeclarado) {
            const idEsencia = idOriginal.padStart(12, '0');
            const posibleEsencia = porColeccion.ESENCIA.get(idEsencia) || porColeccion.ESENCIA.get(idOriginal);
            const posibleInsumo = porColeccion.INSUMOS.get(idOriginal.toUpperCase());
            if (posibleEsencia || posibleInsumo) {
              tipo = posibleInsumo ? 'INSUMOS' : 'ESENCIA';
              existente = posibleInsumo || posibleEsencia;
              id = tipo === 'INSUMOS' ? idOriginal.toUpperCase() : idEsencia;
            }
          }

          if (!id) {
            if (tipo === 'INSUMOS') {
              id = `INSUMO_${Date.now()}_${indice}`.toUpperCase();
            } else {
              do {
                ultimoIdEsencia++;
                id = ultimoIdEsencia.toString().padStart(12, '0');
              } while (porColeccion.ESENCIA.has(id) || idsProcesados.has(`ESENCIA:${id}`));
            }
          }

          const llave = `${tipo}:${id}`;
          if (idsProcesados.has(llave)) {
            filasInvalidas++;
            return;
          }
          idsProcesados.add(llave);
          existente = existente || porColeccion[tipo].get(id);

          const nuevosValores = {};
          let filaInvalida = false;
          columnas.forEach(({ columna, campo, tipo: tipoDato }) => {
            const valor = fila[columna];
            if (valor === null || valor === undefined || String(valor).trim() === '') return;
            if (tipoDato === 'texto') {
              nuevosValores[campo] = String(valor).trim();
            } else {
              const numero = Number(valor);
              if (!Number.isFinite(numero) || numero < 0) {
                filaInvalida = true;
              } else {
                nuevosValores[campo] = numero;
              }
            }
          });

          if (filaInvalida || (!existente && (!fila.Nombre || !genero || nuevosValores.stock === undefined))) {
            filasInvalidas++;
            return;
          }

          if (!existente) {
            const datos = {
              id,
              name: String(fila.Nombre).trim().toUpperCase(),
              genero,
              stock: nuevosValores.stock
            };
            cambios.push({
              tipoCambio: 'nuevo',
              tipo,
              documentId: id,
              id,
              nombre: datos.name,
              genero: datos.genero,
              datos,
              campos: [
                { campo: 'name', etiqueta: 'Nombre', anterior: '', nuevo: datos.name },
                { campo: 'genero', etiqueta: 'Género', anterior: '', nuevo: datos.genero },
                { campo: 'stock', etiqueta: 'Stock (gr)', anterior: '', nuevo: datos.stock }
              ]
            });
            elementosNuevos++;
            return;
          }

          const actualizaciones = {};
          const camposCambiados = [];
          columnas.forEach(({ campo, etiqueta, tipo: tipoDato }) => {
            const valorNuevo = nuevosValores[campo];
            if (valorNuevo === undefined) return;
            const valorActual = existente[campo];
            const sonIguales = tipoDato === 'texto'
              ? String(valorActual ?? '').trim() === valorNuevo
              : Number.isFinite(Number(valorActual)) && Number(valorActual) === valorNuevo;
            if (!sonIguales) {
              actualizaciones[campo] = valorNuevo;
              camposCambiados.push({
                campo,
                etiqueta,
                anterior: valorActual ?? '',
                nuevo: valorNuevo
              });
            }
          });

          if (camposCambiados.length) {
            cambios.push({
              tipoCambio: 'actualizar',
              tipo,
              documentId: existente.documentId,
              id: existente.id || id,
              nombre: existente.name || fila.Nombre,
              genero: nuevosValores.genero || existente.genero || '',
              actualizaciones,
              campos: camposCambiados
            });
          }
        });

        setCambiosImportacion(cambios);
        setResumenImportacion({ elementosNuevos, filasInvalidas });
        if (!cambios.length) {
          toast.info('No hay elementos nuevos ni cambios válidos para aplicar');
        }
      } catch (err) {
        console.error('Error al comparar esencias e insumos:', err);
        toast.error('No se pudo comparar el archivo con esencias e insumos');
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      console.error('Error al leer el Excel de esencias e insumos');
      toast.error('No se pudo leer el archivo seleccionado');
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmarActualizacionExcel = async () => {
    if (!cambiosImportacion.length) return;
    setLoading(true);
    let elementosProcesados = 0;
    try {
      for (let inicio = 0; inicio < cambiosImportacion.length; inicio += 500) {
        const lote = cambiosImportacion.slice(inicio, inicio + 500);
        const batch = writeBatch(db);
        lote.forEach(elemento => {
          const coleccion = elemento.tipo === 'INSUMOS' ? 'INSUMOS' : 'ESENCIA';
          const referencia = doc(db, coleccion, elemento.documentId);
          if (elemento.tipoCambio === 'nuevo') {
            batch.set(referencia, elemento.datos);
          } else {
            batch.update(referencia, elemento.actualizaciones);
          }
        });
        await batch.commit();
        elementosProcesados += lote.length;
      }

      const nuevos = cambiosImportacion.filter(elemento => elemento.tipoCambio === 'nuevo').length;
      toast.success(`Actualización completa: ${nuevos} elemento(s) agregado(s) y ${cambiosImportacion.length - nuevos} actualizado(s)`);
      setCambiosImportacion([]);
      setResumenImportacion(null);
      setShowImportModal(false);
      await cargarEsencias();
    } catch (err) {
      console.error('Error al actualizar esencias e insumos:', err);
      toast.error(`No se completó la actualización. Se procesaron ${elementosProcesados} elemento(s); revisa los datos antes de reintentar.`);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData({ id: '', name: '', genero: '', stock: '', tipo: 'ESENCIA' });
    setEditingId(null);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setCambiosImportacion([]);
    setResumenImportacion(null);
    setFiltroTipoImportacion('');
    setFiltroAccionImportacion('');
    setFiltroCampoImportacion('');
  };

  const handleLimpiarBusqueda = () => {
    setBusqueda('');
  };

  const tiposImportacion = [...new Set(cambiosImportacion.map(elemento => elemento.tipo))];
  const camposImportacion = [...new Set(cambiosImportacion.flatMap(elemento => elemento.campos.map(campo => campo.etiqueta)))];
  const cambiosImportacionFiltrados = cambiosImportacion.flatMap(elemento => {
    if (filtroTipoImportacion && elemento.tipo !== filtroTipoImportacion) return [];
    if (filtroAccionImportacion && elemento.tipoCambio !== filtroAccionImportacion) return [];
    return elemento.campos
      .filter(campo => !filtroCampoImportacion || campo.etiqueta === filtroCampoImportacion)
      .map(campo => ({ elemento, campo }));
  });

  return (
    <div className="esencias-container">
      <div className="esencias-header">
        <h2>🌿 Gestión de Esencias e Insumos</h2>
        <div className="esencias-actions">
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <FaPlus /> Agregar
          </button>
          <button onClick={descargarExcel} className="btn btn-secondary" disabled={loading}>
            <FaDownload /> Descargar Datos
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary" disabled={loading}>
            <FaUpload /> Importar Excel
          </button>
        </div>
      </div>

      <div className="esencias-search">
        <div className="filter-buttons">
          <button 
            className={`filter-btn ${tipoFiltro === 'todos' ? 'active' : ''}`}
            onClick={() => setTipoFiltro('todos')}
          >
            Todos
          </button>
          <button 
            className={`filter-btn ${tipoFiltro === 'ESENCIA' ? 'active' : ''}`}
            onClick={() => setTipoFiltro('ESENCIA')}
          >
            Esencias
          </button>
          <button 
            className={`filter-btn ${tipoFiltro === 'INSUMOS' ? 'active' : ''}`}
            onClick={() => setTipoFiltro('INSUMOS')}
          >
            Insumos
          </button>
        </div>
        <div className="search-container">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por nombre o ID..."
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
      </div>

      {loading && <p className="loading">Cargando...</p>}

      <div className="esencias-tabla">
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>ID</th>
              <th>Nombre</th>
              <th>Género</th>
              <th>Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {esenciasFiltradas.map(esc => (
              <tr key={esc.documentId}>
                <td><span className={`tipo-badge ${esc.tipo}`}>{esc.tipo}</span></td>
                <td>{esc.id}</td>
                <td>{esc.name}</td>
                <td>{esc.genero || '-'}</td>
                <td>{esc.stock}</td>
                <td className="acciones">
                  <button onClick={() => handleEdit(esc)} className="btn-icon btn-edit" title="Editar">
                    <FaEdit />
                  </button>
                  <button onClick={() => handleDelete(esc.documentId, esc.tipo)} className="btn-icon btn-delete" title="Eliminar">
                    <FaTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {esenciasFiltradas.length === 0 && (
          <p className="sin-datos">
            {busqueda ? 'No se encontraron resultados con esa búsqueda' : 'No hay datos en la base de datos'}
          </p>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Editar Esencia' : 'Agregar Esencia'}</h3>
              <button onClick={closeModal} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>Tipo *</label>
                <select 
                  name="tipo" 
                  value={formData.tipo}
                  onChange={handleInputChange}
                  required
                >
                  <option value="ESENCIA">Esencia</option>
                  <option value="INSUMOS">Insumo</option>
                </select>
              </div>
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
                <label>Nombre de la Esencia *</label>
                <input 
                  type="text" 
                  name="name" 
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Ej: ROSA ROJA, LAVANDA"
                  required
                />
              </div>
              <div className="form-group">
                <label>Género *</label>
                <input 
                  type="text" 
                  name="genero" 
                  value={formData.genero}
                  onChange={handleInputChange}
                  placeholder="Ej: Floral, Herbáceo, Frutal"
                  required
                />
              </div>
              <div className="form-group">
                <label>Stock (gramos) *</label>
                <input 
                  type="number" 
                  name="stock" 
                  value={formData.stock}
                  onChange={handleInputChange}
                  placeholder="Cantidad en gramos"
                  step="0.1"
                  min="0"
                  required
                />
              </div>
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
              <h3>📥 Importar Esencias e Insumos desde Excel</h3>
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
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="header-cell">Tipo</td>
                        <td className="header-cell">ID</td>
                        <td className="header-cell">Nombre</td>
                        <td className="header-cell">Género</td>
                        <td className="header-cell">Stock (gr)</td>
                      </tr>
                      <tr>
                        <td className="type-cell">String (ESENCIA/INSUMOS)</td>
                        <td className="type-cell">String (12 dígitos o texto)</td>
                        <td className="type-cell">String (MAYÚSCULAS)</td>
                        <td className="type-cell">String</td>
                        <td className="type-cell">Número decimal</td>
                      </tr>
                      <tr>
                        <td className="example-cell">ESENCIA</td>
                        <td className="example-cell">000000000001</td>
                        <td className="example-cell">ROSA ROJA</td>
                        <td className="example-cell">Floral</td>
                        <td className="example-cell">500</td>
                      </tr>
                      <tr>
                        <td className="example-cell">INSUMOS</td>
                        <td className="example-cell">ALCOHOL</td>
                        <td className="example-cell">ALCOHOL</td>
                        <td className="example-cell">Insumo</td>
                        <td className="example-cell">1000</td>
                      </tr>
                      <tr>
                        <td className="example-cell">INSUMOS</td>
                        <td className="example-cell">FIJADOR</td>
                        <td className="example-cell">FIJADOR</td>
                        <td className="example-cell">Insumo</td>
                        <td className="example-cell">500.5</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="import-notes">
                  <h5>📝 Notas importantes:</h5>
                  <ul>
                    <li><strong>Tipo:</strong> ESENCIA o INSUMO (obligatorio)</li>
                    <li><strong>ID:</strong> Para ESENCIA: 12 dígitos con ceros a la izquierda. Para INSUMOS: nombre del insumo (ALCOHOL, FIJADOR, FEROMONAS). Se genera automáticamente si está vacío.</li>
                    <li><strong>Nombre:</strong> Será convertido automáticamente a MAYÚSCULAS.</li>
                    <li><strong>Género:</strong> Campo obligatorio. Ej: Floral, Herbáceo, Frutal, Cítrico, Insumo, etc.</li>
                    <li><strong>Stock:</strong> Número decimal en gramos obligatorio. Usa punto (.) como separador decimal.</li>
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
                <label className="btn btn-secondary">
                  <FaUpload /> Actualizar inventario
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={prepararActualizacionExcel}
                    style={{ display: 'none' }}
                    disabled={loading}
                  />
                </label>
              </div>

              {resumenImportacion && (
                <div className="essence-import-review">
                  <h4>
                    {cambiosImportacion.length
                      ? `Vista previa: ${resumenImportacion.elementosNuevos} elemento(s) nuevo(s) y ${cambiosImportacion.length - resumenImportacion.elementosNuevos} por actualizar`
                      : 'No hay elementos nuevos ni cambios'}
                  </h4>
                  {resumenImportacion.filasInvalidas > 0 && (
                    <p className="essence-import-summary">
                      Se omitieron {resumenImportacion.filasInvalidas} fila(s) incompletas, duplicadas o con stock inválido.
                    </p>
                  )}
                  {cambiosImportacion.length > 0 && (
                    <>
                      <div className="essence-import-filters">
                        <label>
                          Tipo
                          <select value={filtroTipoImportacion} onChange={e => setFiltroTipoImportacion(e.target.value)}>
                            <option value="">Todos</option>
                            {tiposImportacion.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                          </select>
                        </label>
                        <label>
                          Acción
                          <select value={filtroAccionImportacion} onChange={e => setFiltroAccionImportacion(e.target.value)}>
                            <option value="">Todas</option>
                            <option value="nuevo">Agregar</option>
                            <option value="actualizar">Actualizar</option>
                          </select>
                        </label>
                        <label>
                          Columna modificada
                          <select value={filtroCampoImportacion} onChange={e => setFiltroCampoImportacion(e.target.value)}>
                            <option value="">Todas</option>
                            {camposImportacion.map(campo => <option key={campo} value={campo}>{campo}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="essence-changes-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Elemento</th>
                              <th>Tipo</th>
                              <th>Acción</th>
                              <th>Campo</th>
                              <th>Valor actual</th>
                              <th>Nuevo valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cambiosImportacionFiltrados.map(({ elemento, campo }) => (
                              <tr key={`${elemento.tipo}-${elemento.documentId}-${campo.campo}`}>
                                <td>
                                  <strong>{elemento.nombre}</strong>
                                  <small>{elemento.id}</small>
                                </td>
                                <td>{elemento.tipo}</td>
                                <td>{elemento.tipoCambio === 'nuevo' ? 'Agregar' : 'Actualizar'}</td>
                                <td>{campo.etiqueta}</td>
                                <td>{String(campo.anterior)}</td>
                                <td className="essence-new-value">{String(campo.nuevo)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {cambiosImportacionFiltrados.length === 0 && (
                          <p className="sin-datos">No hay cambios que coincidan con los filtros.</p>
                        )}
                      </div>
                    </>
                  )}
                  <div className="form-actions essence-import-review-actions">
                    <button type="button" onClick={closeImportModal} className="btn btn-secondary" disabled={loading}>
                      Cancelar actualización
                    </button>
                    {cambiosImportacion.length > 0 && (
                      <button type="button" onClick={confirmarActualizacionExcel} className="btn btn-primary" disabled={loading}>
                        {loading ? 'Actualizando...' : 'Aceptar actualización'}
                      </button>
                    )}
                  </div>
                </div>
              )}

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
