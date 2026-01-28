import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { FaPlus, FaEdit, FaTrash, FaDownload, FaUpload, FaSearch, FaTimes } from 'react-icons/fa';
import './AdminFormulas.css';

export default function AdminFormulas() {
  const [formulas, setFormulas] = useState([]);
  const [formulasFiltradas, setFormulasFiltradas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [formData, setFormData] = useState({
    id: '',
    alcohol: '',
    esenciagr: '',
    feromonasgotas: '',
    fijadorgr: ''
  });

  useEffect(() => {
    cargarFormulas();
  }, []);

  useEffect(() => {
    filtrarFormulas();
  }, [busqueda, formulas]);

  const cargarFormulas = async () => {
    try {
      setLoading(true);
      const formulasRef = collection(db, 'FORMULAS');
      const snapshot = await getDocs(formulasRef);
      const frms = snapshot.docs.map(doc => ({
        documentId: doc.id,
        ...doc.data()
      }));
      setFormulas(frms);
      setFormulasFiltradas(frms);
    } catch (err) {
      console.error('Error al cargar fórmulas:', err);
      toast.error('Error al cargar fórmulas');
    } finally {
      setLoading(false);
    }
  };

  const filtrarFormulas = () => {
    if (!busqueda.trim()) {
      setFormulasFiltradas(formulas);
      return;
    }

    const busquedaLower = busqueda.toLowerCase().trim();
    const filtrados = formulas.filter(frm => {
      return frm.id.toLowerCase().includes(busquedaLower);
    });

    setFormulasFiltradas(filtrados);
  };

  const generarIdIncremental = () => {
    const idsNumericos = formulas
      .map(f => parseInt(f.id))
      .filter(id => !isNaN(id))
      .sort((a, b) => b - a);
    
    const nuevoId = idsNumericos.length > 0 ? idsNumericos[0] + 1 : 1;
    return nuevoId.toString().padStart(8, '0');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.alcohol || !formData.esenciagr || !formData.feromonasgotas || !formData.fijadorgr) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    try {
      setLoading(true);
      const idFormula = formData.id || generarIdIncremental();
      
      if (editingId) {
        const docRef = doc(db, 'FORMULAS', editingId);
        await updateDoc(docRef, {
          id: idFormula,
          alcohol: parseInt(formData.alcohol),
          esenciagr: parseInt(formData.esenciagr),
          feromonasgotas: parseInt(formData.feromonasgotas),
          fijadorgr: parseInt(formData.fijadorgr)
        });
        toast.success('Fórmula actualizada correctamente');
      } else {
        const docRef = doc(db, 'FORMULAS', idFormula);
        await setDoc(docRef, {
          id: idFormula,
          alcohol: parseInt(formData.alcohol),
          esenciagr: parseInt(formData.esenciagr),
          feromonasgotas: parseInt(formData.feromonasgotas),
          fijadorgr: parseInt(formData.fijadorgr)
        });
        toast.success('Fórmula agregada correctamente');
      }
      
      setShowModal(false);
      setFormData({ id: '', alcohol: '', esenciagr: '', feromonasgotas: '', fijadorgr: '' });
      setEditingId(null);
      cargarFormulas();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al guardar la fórmula');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (formula) => {
    setFormData({
      id: formula.id,
      alcohol: formula.alcohol,
      esenciagr: formula.esenciagr,
      feromonasgotas: formula.feromonasgotas,
      fijadorgr: formula.fijadorgr
    });
    setEditingId(formula.documentId);
    setShowModal(true);
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta fórmula?')) return;
    
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'FORMULAS', documentId));
      toast.success('Fórmula eliminada correctamente');
      cargarFormulas();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al eliminar la fórmula');
    } finally {
      setLoading(false);
    }
  };

  const descargarExcel = () => {
    try {
      const datos = formulas.map(f => ({
        ID: f.id,
        Alcohol: f.alcohol,
        Esencia: f.esenciagr,
        Feromonas: f.feromonasgotas,
        Fijador: f.fijadorgr
      }));

      const ws = XLSX.utils.json_to_sheet(datos);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Formulas');
      
      ws['!cols'] = [
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 }
      ];

      XLSX.writeFile(wb, 'formulas.xlsx');
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
          ID: '00000001',
          Alcohol: 8,
          Esencia: 15,
          Feromonas: 5,
          Fijador: 2
        },
        {
          ID: '00000002',
          Alcohol: 10,
          Esencia: 20,
          Feromonas: 6,
          Fijador: 3
        }
      ];

      const ws = XLSX.utils.json_to_sheet(datosFormato);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Formulas');
      
      ws['!cols'] = [
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 }
      ];

      XLSX.writeFile(wb, 'plantilla_formulas.xlsx');
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
          if (row.Alcohol !== undefined && row.Esencia !== undefined && row.Feromonas !== undefined && row.Fijador !== undefined) {
            const idFormula = row.ID ? row.ID.toString().padStart(8, '0') : generarIdIncremental();
            const docRef = doc(db, 'FORMULAS', idFormula);
            await setDoc(docRef, {
              id: idFormula,
              alcohol: parseInt(row.Alcohol),
              esenciagr: parseInt(row.Esencia),
              feromonasgotas: parseInt(row.Feromonas),
              fijadorgr: parseInt(row.Fijador)
            });
            importados++;
          }
        }

        toast.success(`${importados} fórmulas importadas correctamente`);
        setShowImportModal(false);
        cargarFormulas();
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
    setFormData({ id: '', alcohol: '', esenciagr: '', feromonasgotas: '', fijadorgr: '' });
    setEditingId(null);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
  };

  const handleLimpiarBusqueda = () => {
    setBusqueda('');
  };

  return (
    <div className="formulas-container">
      <div className="formulas-header">
        <h2>⚗️ Gestión de Fórmulas</h2>
        <div className="formulas-actions">
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <FaPlus /> Agregar Fórmula
          </button>
          <button onClick={descargarExcel} className="btn btn-secondary" disabled={loading}>
            <FaDownload /> Descargar Excel
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary" disabled={loading}>
            <FaUpload /> Importar Excel
          </button>
        </div>
      </div>

      <div className="formulas-search">
        <div className="search-container">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por ID de fórmula..."
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
            Se encontraron <strong>{formulasFiltradas.length}</strong> fórmula(s)
          </p>
        )}
      </div>

      {loading && <p className="loading">Cargando...</p>}

      <div className="formulas-tabla">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Alcohol (gr)</th>
              <th>Esencia (gr)</th>
              <th>Feromonas (gotas)</th>
              <th>Fijador (gr)</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {formulasFiltradas.map(frm => (
              <tr key={frm.documentId}>
                <td>{frm.id}</td>
                <td>{frm.alcohol}</td>
                <td>{frm.esenciagr}</td>
                <td>{frm.feromonasgotas}</td>
                <td>{frm.fijadorgr}</td>
                <td className="acciones">
                  <button onClick={() => handleEdit(frm)} className="btn-icon btn-edit" title="Editar">
                    <FaEdit />
                  </button>
                  <button onClick={() => handleDelete(frm.documentId)} className="btn-icon btn-delete" title="Eliminar">
                    <FaTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {formulasFiltradas.length === 0 && (
          <p className="sin-datos">
            {busqueda ? 'No se encontraron fórmulas con esa búsqueda' : 'No hay fórmulas en la base de datos'}
          </p>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Editar Fórmula' : 'Agregar Fórmula'}</h3>
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
                <label>Alcohol (gramos) *</label>
                <input 
                  type="number" 
                  name="alcohol" 
                  value={formData.alcohol}
                  onChange={handleInputChange}
                  placeholder="Ej: 8"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label>Esencia (gramos) *</label>
                <input 
                  type="number" 
                  name="esenciagr" 
                  value={formData.esenciagr}
                  onChange={handleInputChange}
                  placeholder="Ej: 15"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label>Feromonas (gotas) *</label>
                <input 
                  type="number" 
                  name="feromonasgotas" 
                  value={formData.feromonasgotas}
                  onChange={handleInputChange}
                  placeholder="Ej: 5"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label>Fijador (gramos) *</label>
                <input 
                  type="number" 
                  name="fijadorgr" 
                  value={formData.fijadorgr}
                  onChange={handleInputChange}
                  placeholder="Ej: 2"
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
              <h3>📥 Importar Fórmulas desde Excel</h3>
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
                        <td className="header-cell">ID</td>
                        <td className="header-cell">Alcohol</td>
                        <td className="header-cell">Esencia</td>
                        <td className="header-cell">Feromonas</td>
                        <td className="header-cell">Fijador</td>
                      </tr>
                      <tr>
                        <td className="type-cell">String (8 dígitos)</td>
                        <td className="type-cell">Número</td>
                        <td className="type-cell">Número</td>
                        <td className="type-cell">Número</td>
                        <td className="type-cell">Número</td>
                      </tr>
                      <tr>
                        <td className="example-cell">00000001</td>
                        <td className="example-cell">8</td>
                        <td className="example-cell">15</td>
                        <td className="example-cell">5</td>
                        <td className="example-cell">2</td>
                      </tr>
                      <tr>
                        <td className="example-cell">00000002</td>
                        <td className="example-cell">10</td>
                        <td className="example-cell">20</td>
                        <td className="example-cell">6</td>
                        <td className="example-cell">3</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="import-notes">
                  <h5>📝 Notas importantes:</h5>
                  <ul>
                    <li><strong>ID:</strong> Debe tener 8 dígitos con ceros a la izquierda. Se genera automáticamente si está vacío.</li>
                    <li><strong>Alcohol:</strong> Número entero positivo en gramos obligatorio.</li>
                    <li><strong>Esencia:</strong> Número entero positivo en gramos obligatorio.</li>
                    <li><strong>Feromonas:</strong> Número entero positivo en gotas obligatorio.</li>
                    <li><strong>Fijador:</strong> Número entero positivo en gramos obligatorio.</li>
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
