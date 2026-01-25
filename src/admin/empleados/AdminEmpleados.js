import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { toast } from 'react-toastify';
import './AdminEmpleados.css';
import { FaEdit, FaSave, FaTimes } from 'react-icons/fa';

export default function AdminEmpleados() {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    fetchEmpleados();
  }, []);

  const fetchEmpleados = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'EMPLEADOS'));
      const empleadosList = [];
      querySnapshot.forEach((doc) => {
        empleadosList.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      setEmpleados(empleadosList);
    } catch (err) {
      console.error('Error al cargar empleados:', err);
      toast.error('Error al cargar empleados');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (empleado) => {
    setEditingId(empleado.id);
    setEditData({ ...empleado });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, 'EMPLEADOS', editingId), {
        nombre: editData.nombre,
        email: editData.email,
        rol: editData.rol,
      });
      toast.success('Empleado actualizado correctamente');
      setEditingId(null);
      setEditData({});
      fetchEmpleados();
    } catch (err) {
      console.error('Error al actualizar empleado:', err);
      toast.error('Error al actualizar empleado');
    }
  };

  if (loading) {
    return <div className="empleados-container"><p>Cargando empleados...</p></div>;
  }

  return (
    <div className="empleados-container">
      <h2>Gestión de Empleados</h2>
      <div className="empleados-table">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {empleados.map((empleado) => (
              <tr key={empleado.id}>
                <td>
                  {editingId === empleado.id ? (
                    <input
                      type="text"
                      value={editData.nombre}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          nombre: e.target.value.toLowerCase(),
                        })
                      }
                    />
                  ) : (
                    empleado.nombre
                  )}
                </td>
                <td>
                  {editingId === empleado.id ? (
                    <input
                      type="email"
                      value={editData.email}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          email: e.target.value.toLowerCase(),
                        })
                      }
                    />
                  ) : (
                    empleado.email
                  )}
                </td>
                <td>
                  {editingId === empleado.id ? (
                    <select
                      value={editData.rol}
                      onChange={(e) =>
                        setEditData({ ...editData, rol: e.target.value })
                      }
                    >
                      <option value="EMPLEADO">EMPLEADO</option>
                      <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                    </select>
                  ) : (
                    empleado.rol
                  )}
                </td>
                <td>
                  {editingId === empleado.id ? (
                    <div className="action-buttons">
                      <button
                        className="save-btn"
                        onClick={handleSave}
                        title="Guardar"
                      >
                        <FaSave />
                      </button>
                      <button
                        className="cancel-btn"
                        onClick={handleCancel}
                        title="Cancelar"
                      >
                        <FaTimes />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="edit-btn"
                      onClick={() => handleEdit(empleado)}
                      title="Editar"
                    >
                      <FaEdit />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
