import { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, doc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { toast } from 'react-toastify';
import { FaPlus, FaTrash } from 'react-icons/fa';
// import jsPDF using default export; restart dev server after installing
import jsPDF from 'jspdf';
import './pedidosreabastecer.css';

export default function PedidosReabastecer() {
  const [esencias, setEsencias] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [envases, setEnvases] = useState([]);
  // second select choice
  const [selectedProductId, setSelectedProductId] = useState('');
  const [category, setCategory] = useState('ESENCIA');
  const [orderItems, setOrderItems] = useState([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newItemData, setNewItemData] = useState({ category: 'ESENCIA', id: '', name: '', genero: '' });
  const [loading, setLoading] = useState(false);
  // mode: crear o recibir pedidos
  const [mode, setMode] = useState('crear');
  const [orders, setOrders] = useState([]);
  const [variantPrompt, setVariantPrompt] = useState({ visible: false, esencias: [] });
  const [selectedArrived, setSelectedArrived] = useState({});
  const [receivedPage, setReceivedPage] = useState(1);
  const ordersPerPage = 5;

  useEffect(() => {
    // load data depending on mode
    if (mode === 'crear') {
      loadAllProducts();
      setOrderItems([]);
      setSelectedProductId('');
    } else {
      loadOrders();
    }
  }, [mode]);

  const loadAllProducts = async () => {
    try {
      setLoading(true);
      const essRef = collection(db, 'ESENCIA');
      const insRef = collection(db, 'INSUMOS');
      const prodRef = collection(db, 'PRODUCTOS');
      const [essSnap, insSnap, prodSnap] = await Promise.all([
        getDocs(essRef),
        getDocs(insRef),
        getDocs(prodRef)
      ]);

      setEsencias(essSnap.docs.map(d => ({ documentId: d.id, tipo: 'ESENCIA', ...d.data() })));
      setInsumos(insSnap.docs.map(d => ({ documentId: d.id, tipo: 'INSUMOS', ...d.data() })));
      const env = prodSnap.docs
        .map(d => ({ documentId: d.id, ...d.data() }))
        .filter(p => (p.category || '').toUpperCase() === 'ENVASE');
      setEnvases(env);
    } catch (err) {
      console.error('Error cargando productos:', err);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  // return items available for the selected category
  const categoryItems = () => {
    return category === 'ESENCIA' ? esencias : category === 'INSUMOS' ? insumos : envases;
  };

  const handleAddToOrder = (item) => {
    const exists = orderItems.find(i => i.key === (item.documentId || item.id));
    if (exists) {
      setOrderItems(prev => prev.map(i => i.key === exists.key ? { ...i, quantity: String(parseInt(exists.quantity || 0) + 1) } : i));
    } else {
      setOrderItems(prev => [...prev, { key: item.documentId || item.id, category, id: item.id || '', name: item.name || '', quantity: '1', documentId: item.documentId, genero: item.genero || '' }]);
    }
  };

  const handleQuantityChange = (key, delta) => {
    setOrderItems(prev => prev
      .map(i => i.key === key ? { ...i, quantity: String(Math.max(0, parseInt(i.quantity || 0) + delta)) } : i)
      .filter(i => parseInt(i.quantity || 0) > 0));
  };

  const handleQuantityInput = (key, value) => {
    setOrderItems(prev => prev.map(i => i.key === key ? { ...i, quantity: value } : i));
  };

  const toggleArrival = (orderId, idx) => {
    setSelectedArrived(prev => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || {}), [idx]: !prev[orderId]?.[idx] }
    }));
  };

  const formatOrderDate = (orderId) => {
    const parts = orderId.split('-');
    const day = parts[0], month = parts[1], year = parts[2];
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const downloadOrderPdf = (order) => {
    const docPdf = new jsPDF();
    docPdf.setFontSize(16);
    docPdf.text(`Pedido ${formatOrderDate(order.documentId)}`, 10, 20);
    docPdf.setFontSize(12);
    let y = 30;
    docPdf.text('Categoria', 10, y);
    docPdf.text('Nombre', 50, y);
    docPdf.text('Género', 120, y);
    docPdf.text('Cantidad', 160, y);
    y += 8;
    docPdf.setLineWidth(0.5);
    docPdf.line(10, y, 200, y);
    y += 5;
    (order.items || []).forEach(it => {
      docPdf.text(it.category, 10, y);
      docPdf.text(it.name, 50, y);
      docPdf.text(it.genero || '', 120, y);
      docPdf.text(String(it.quantity), 160, y);
      y += 8;
    });
    docPdf.save(`pedido_${order.documentId}.pdf`);
  };

  const handleRemoveOrderItem = (key) => {
    setOrderItems(prev => prev.filter(i => i.key !== key));
  };

  const getNextEsenciaId = async () => {
    const snap = await getDocs(collection(db, 'ESENCIA'));
    const ids = snap.docs
      .map(d => parseInt(d.data().id))
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a);
    const next = ids.length > 0 ? ids[0] + 1 : 1;
    return String(next).padStart(12, '0');
  };

  // generar lista de 8 variantes a partir de una esencia
  const generarVariantesEsencia = (esencia) => {
    const formulas = [
      { categoria: 'FRAGANCIA', idFormula: 'F30', precio: 21000 },
      { categoria: 'FRAGANCIA', idFormula: 'F50', precio: 42000 },
      { categoria: 'FRAGANCIA', idFormula: 'F60', precio: 47000 },
      { categoria: 'FRAGANCIA', idFormula: 'F100', precio: 57000 },
      { categoria: 'CREMA', idFormula: 'C30', precio: 6000 },
      { categoria: 'CREMA', idFormula: 'C60', precio: 10000 },
      { categoria: 'CREMA', idFormula: 'C100', precio: 16000 },
      { categoria: 'CREMA', idFormula: 'C120', precio: 18000 }
    ];
    const isArab = (esencia.genero || '').toUpperCase().includes('ARABE');
    return formulas.map(f => ({
      nombre: esencia.name,
      categoria: f.categoria,
      precio: f.precio + (isArab && f.categoria === 'FRAGANCIA' ? 5000 : 0),
      // reference formula code stored as idFormula in PRODUCTOS
      idFormula: f.idFormula,
      idEsencia: esencia.id
    }));
  };

  // persiste variantes como productos nuevos en la colección PRODUCTOS
  const crearVariantesEnDB = async (esencia) => {
    const variantes = generarVariantesEsencia(esencia);
    const prodSnap = await getDocs(collection(db, 'PRODUCTOS'));
    const existingIds = prodSnap.docs
      .map(d => parseInt(d.data().id))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
    let nextId = existingIds.length > 0 ? existingIds[existingIds.length - 1] + 1 : 1;
    const batch = [];
    variantes.forEach(v => {
      const prodIdStr = String(nextId).padStart(12, '0');
      batch.push(setDoc(doc(db, 'PRODUCTOS', prodIdStr), {
        id: prodIdStr,
        name: v.nombre,
        category: v.categoria,
        price: v.precio,
        // store the formula reference under the correct field name
        idFormula: v.idFormula,
        idEsencia: v.idEsencia
      }));
      nextId++;
    });
    await Promise.all(batch);
    return variantes; // useful for debugging or UI
  };

  const openNewModal = async () => {
    let idVal = '';
    if (category === 'ESENCIA') {
      idVal = await getNextEsenciaId();
    }
    setNewItemData({ category: 'ESENCIA', id: idVal, name: '', genero: '' });
    setShowNewModal(true);
  };

  const handleNewInputChange = (e) => {
    const { name, value } = e.target;
    setNewItemData(prev => ({ ...prev, [name]: value }));
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'PEDIDOS'));
      const list = snap.docs.map(d => ({ documentId: d.id, ...d.data() }));
      // sort by createdAt descending
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setOrders(list);
      setSelectedArrived({}); // clear any previous checkbox state
      setReceivedPage(1); // reset to first page
    } catch (err) {
      console.error('Error cargando pedidos:', err);
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  };

  const confirmOrder = async (orderId) => {
    try {
      setLoading(true);
      const orderRef = doc(db, 'PEDIDOS', orderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) {
        toast.error('Pedido no encontrado');
        return;
      }
      const orderData = orderSnap.data();
      const items = orderData.items || [];

      // figure out which items were marked as arrived
      const selected = selectedArrived[orderId] || {};
      const arrivedItems = items.filter((it, idx) => selected[idx]);
      if (arrivedItems.length === 0) {
        toast.error('Selecciona al menos un ítem recibido');
        return;
      }

      // increment stock only for arrived items
      const stockPromises = arrivedItems.map(async it => {
        const col = it.category === 'ESENCIA'
          ? 'ESENCIA'
          : it.category === 'INSUMOS'
          ? 'INSUMOS'
          : 'PRODUCTOS';
        const itemRef = doc(db, col, it.id);
        const itemSnap = await getDoc(itemRef);
        const currentStock = itemSnap.exists() ? (itemSnap.data().stock || 0) : 0;
        return setDoc(itemRef, { stock: currentStock + it.quantity }, { merge: true });
      });

      await Promise.all(stockPromises);

      // mark order as received and record arrived items
      await setDoc(orderRef, { received: true, arrived: arrivedItems }, { merge: true });
      toast.success('Pedido confirmado y stocks actualizados');
      loadOrders();
    } catch (err) {
      console.error('Error confirmando pedido:', err);
      toast.error('Error al confirmar pedido');
    } finally {
      setLoading(false);
    }
  };

  const deleteOrder = async (orderId) => {
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'PEDIDOS', orderId));
      toast.success('Pedido eliminado correctamente');
      loadOrders();
    } catch (err) {
      console.error('Error eliminando pedido:', err);
      toast.error('Error al eliminar pedido');
    } finally {
      setLoading(false);
    }
  };

  const addNewToOrder = async () => {
    const { category: cat, id, name, genero } = newItemData;
    if (!name || !id) {
      toast.error('Por favor ingresa nombre e ID del producto');
      return;
    }
    if (cat === 'ESENCIA' && !genero) {
      toast.error('Por favor ingresa género de la esencia');
      return;
    }
    const key = `${cat}-${id}`;
    const exists = orderItems.find(i => i.key === key);
    if (exists) {
      setOrderItems(prev => prev.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setOrderItems(prev => [...prev, { key, category: cat, id, name, quantity: '1', isNew: true, genero: cat === 'ESENCIA' ? genero : undefined }]);
      // no generamos variantes hasta que la esencia se cree en la base de datos (al guardar pedido)
    }
    setShowNewModal(false);
  };

  const saveOrder = async () => {
    if (orderItems.length === 0) {
      toast.error('Agrega al menos un item al pedido');
      return;
    }
    try {
      setLoading(true);
      // si hay items nuevos, también crearlos en la colección correspondiente
      const batchPromises = [];
      orderItems.forEach(item => {
        if (item.isNew) {
          if (item.category === 'ESENCIA') {
            const docRef = doc(db, 'ESENCIA', item.id);
            batchPromises.push(setDoc(docRef, { id: item.id, name: item.name, genero: item.genero || '', stock: 0 }));
          }
          if (item.category === 'INSUMOS') {
            const docRef = doc(db, 'INSUMOS', item.id);
            batchPromises.push(setDoc(docRef, { id: item.id, name: item.name, genero: '', stock: 0 }));
          }
          if (item.category === 'ENVASE') {
            const docRef = doc(db, 'PRODUCTOS', item.id);
            batchPromises.push(setDoc(docRef, { id: item.id, name: item.name, category: 'ENVASE', stock: 0, price: 0 }));
          }
        }
      });

      await Promise.all(batchPromises);

      // después de crear nuevas esencias genéricos, generar variantes de producto
      const newEsencias = orderItems.filter(i => i.isNew && i.category === 'ESENCIA');
      if (newEsencias.length > 0) {
        // show toast and ask user if they want to generate variantes
        toast.info('Se crearon nuevas esencias');
        const payload = newEsencias.map(es => ({
          ...es,
          variants: generarVariantesEsencia(es)
        }));
        setVariantPrompt({ visible: true, esencias: payload });
      }

      // generar id formato dd-mm-yyyy-hh-mm-ss
      const date = new Date();
      const orderId = `${String(date.getDate()).padStart(2, '0')}-${String(
        date.getMonth() + 1
      ).padStart(2, '0')}-${date.getFullYear()}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;

      // guardar pedido usando setDoc para controlar el id
      await setDoc(doc(db, 'PEDIDOS', orderId), {
        items: orderItems.map(i => ({ category: i.category, id: i.id, name: i.name, quantity: parseInt(i.quantity || 0), genero: i.genero || '' })),
        createdAt: serverTimestamp()
      });

      toast.success('Pedido guardado correctamente');
      setOrderItems([]);
    } catch (err) {
      console.error('Error guardando pedido:', err);
      toast.error('Error al guardar pedido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="prc-header-switch">
        <h2>📝 Pedido de Reabastecimiento</h2>
        <div className="prc-mode-buttons">
          <button
            className={mode === 'crear' ? 'active' : ''}
            onClick={() => setMode('crear')}
          >
            Crear pedido
          </button>
          <button
            className={mode === 'recibir' ? 'active' : ''}
            onClick={() => setMode('recibir')}
          >
            Recibir pedido
          </button>
        </div>
      </div>
      <div className="prc-pedidos-container">

      {mode === 'crear' && (
        <>
          <div className="prc-pedidos-controls">
            <select value={category} onChange={e => { setCategory(e.target.value); setSelectedProductId(''); }}>
              <option value="ESENCIA">Esencias</option>
              <option value="INSUMOS">Insumos</option>
              <option value="ENVASE">Envases</option>
            </select>

            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
            >
              <option value="">Selecciona producto...</option>
              {categoryItems().map(item => (
                <option key={item.documentId || item.id} value={item.documentId || item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>

            <button
              className="prc-btn prc-btn-primary"
              onClick={() => {
                if (selectedProductId) {
                  const item = categoryItems().find(
                    i => (i.documentId || i.id) === selectedProductId
                  );
                  if (item) handleAddToOrder(item);
                  setSelectedProductId('');
                }
              }}
            >
              + Agregar
            </button>

            <button className="prc-btn prc-btn-secondary" onClick={openNewModal}>
              <FaPlus /> Producto nuevo
            </button>
          </div>
        </>
      )}

      {mode === 'recibir' && (
        <>
          {loading && <p>Cargando...</p>}
          {!loading && orders.filter(o => !o.received).length === 0 && <p>No hay pedidos pendientes</p>}

          {/* pendientes */}
          {!loading && orders.filter(o => !o.received).length > 0 && (
            <>
              <h3>Pedidos pendientes</h3>
              <div className="prc-orders-list">
                {orders.filter(o => !o.received).map(o => (
                  <div key={o.documentId} className="prc-order-entry">
                    <strong>{formatOrderDate(o.documentId)}</strong>
                    <ul>
                      {o.items && o.items.map((it, idx) => (
                        <li key={idx}>
                          <input
                            type="checkbox"
                            className="prc-arrival-checkbox"
                            checked={selectedArrived[o.documentId]?.[idx] || false}
                            onChange={() => toggleArrival(o.documentId, idx)}
                          />
{it.category} - {it.name} {it.genero ? `-${it.genero}-` : ''} &nbsp;&nbsp;&nbsp;
<strong>Cantidad {it.quantity}</strong>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="prc-btn prc-btn-success"
                      onClick={() => confirmOrder(o.documentId)}
                    >
                      Confirmar
                    </button>
                    <button
                      className="prc-btn-delete-receive"
                      onClick={() => deleteOrder(o.documentId)}
                    >
                      Eliminar
                    </button>
                    <button
                      className="prc-btn prc-btn-secondary prc-pdf-btn"
                      onClick={() => downloadOrderPdf(o)}
                    >
                      PDF
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* recibidos */}
          {!loading && orders.filter(o => o.received).length > 0 && (
            <>
              <h3>Pedidos recibidos</h3>
              <div className="prc-orders-list prc-orders-received">
                {(() => {
                  const receivedOrders = orders.filter(o => o.received);
                  const totalPages = Math.ceil(receivedOrders.length / ordersPerPage);
                  const displayedReceived = receivedOrders.slice((receivedPage - 1) * ordersPerPage, receivedPage * ordersPerPage);
                  return (
                    <>
                      {displayedReceived.map(o => (
                        <div key={o.documentId} className="prc-order-entry received">
                          <strong>{formatOrderDate(o.documentId)}</strong>
                          <ul>
                            {o.arrived && o.arrived.map((it, idx) => (
                              <li key={idx}>
                                {it.category} - {it.name} {it.genero ? `(${it.genero})` : ''} <strong>cantidad {it.quantity}</strong>
                              </li>
                            ))}
                          </ul>
                          <button
                            className="prc-btn prc-btn-secondary prc-pdf-btn"
                            onClick={() => downloadOrderPdf(o)}
                          >
                            PDF
                          </button>
                        </div>
                      ))}
                      {totalPages > 1 && (
                        <div className="prc-pagination">
                          <button
                            className="prc-btn prc-btn-secondary"
                            disabled={receivedPage === 1}
                            onClick={() => setReceivedPage(receivedPage - 1)}
                          >
                            Anterior
                          </button>
                          <span>Página {receivedPage} de {totalPages}</span>
                          <button
                            className="prc-btn prc-btn-secondary"
                            disabled={receivedPage === totalPages}
                            onClick={() => setReceivedPage(receivedPage + 1)}
                          >
                            Siguiente
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </>
      )}

      {/* la lista de búsqueda ya no se muestra en modo crear, usamos selects */}

      {mode === 'crear' && (
        <div className="prc-order-summary">
          <h3>Items del pedido</h3>
          {orderItems.length === 0 ? (
            <p>No hay items agregados</p>
          ) : (
            <div className="prc-table-wrapper">
              <table className="prc-table-fixed">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>ID / Nombre</th>
                    <th>Género</th>
                    <th>Cantidad</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map(i => (
                    <tr key={i.key}>
                      <td>{i.category}</td>
                      <td>{i.name || i.id}</td>
                      <td>{i.category === 'ESENCIA' ? i.genero : ''}</td>
                      <td>
                        <div className="prc-qty-cell">
                          <button className="prc-btn prc-btn-secondary prc-qty-btn" onClick={() => handleQuantityChange(i.key, -1)}>-</button>
                          <input
                            className="prc-qty-input"
                            type="number"
                            value={i.quantity}
                            onChange={e => handleQuantityInput(i.key, e.target.value)}
                          />
                          <span className="prc-qty-unit">{(i.category === 'ESENCIA' || i.category === 'INSUMOS') ? 'gr' : ''}</span>
                          <button className="prc-btn prc-btn-secondary prc-qty-btn" onClick={() => handleQuantityChange(i.key, 1)}>+</button>
                        </div>
                      </td>
                      <td>
                        <button onClick={() => handleRemoveOrderItem(i.key)} className="prc-btn-delete-create">
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          )}
          {orderItems.length > 0 && (
            <button onClick={saveOrder} className="prc-btn prc-btn-success" disabled={loading}>
              Guardar pedido
            </button>
          )}
        </div>
      )}

      {showNewModal && (
        <div className="prc-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="prc-modal" onClick={e => e.stopPropagation()}>
            <h3>Agregar producto nuevo</h3>
            <div className="prc-form-group">
              <label>Categoría</label>
              <select name="category" value={newItemData.category} onChange={async e => {
                  const val = e.target.value;
                  let idVal = newItemData.id;
                  if (val === 'ESENCIA') {
                    idVal = await getNextEsenciaId();
                  } else {
                    idVal = '';
                  }
                  setNewItemData(prev => ({ ...prev, category: val, id: idVal, genero: '' }));
              }}>
                <option value="ESENCIA">Esencia</option>
                <option value="INSUMOS">Insumo</option>
                <option value="ENVASE">Envase</option>
              </select>
            </div>
            <div className="prc-form-group">
              <label>ID</label>
              <input name="id" value={newItemData.id} onChange={handleNewInputChange} />
            </div>
            <div className="prc-form-group">
              <label>Nombre</label>
              <input name="name" value={newItemData.name} onChange={handleNewInputChange} />
            </div>
            {newItemData.category === 'ESENCIA' && (
              <div className="prc-form-group">
                <label>Género</label>
                <input name="genero" value={newItemData.genero} onChange={handleNewInputChange} />
              </div>
            )}
            <div className="prc-modal-actions">
              <button onClick={() => setShowNewModal(false)} className="prc-btn prc-btn-secondary">Cancelar</button>
              <button onClick={addNewToOrder} className="prc-btn prc-btn-primary">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {variantPrompt.visible && (
        <div className="prc-modal-overlay" onClick={() => setVariantPrompt({ visible: false, esencias: [] })}>
          <div className="prc-modal" onClick={e => e.stopPropagation()}>
            <h3>¿Generar variantes para las esencias?</h3>
            <p>Se crearán los siguientes productos:</p>
            <ul>
              {variantPrompt.esencias.map(es => (
                <li key={es.id}>
                  {es.name}: {es.variants.map(v => v.idFormula).join(', ')}
                </li>
              ))}
            </ul>
            <div className="prc-modal-actions">
              <button
                className="prc-btn prc-btn-secondary"
                onClick={() => setVariantPrompt({ visible: false, esencias: [] })}
              >
                No
              </button>
              <button
                className="prc-btn prc-btn-primary"
                onClick={async () => {
                  for (const es of variantPrompt.esencias) {
                    try {
                      await crearVariantesEnDB(es);
                    } catch (e) {
                      console.error('error generando variante', e);
                    }
                  }
                  toast.success('Variantes generadas');
                  setVariantPrompt({ visible: false, esencias: [] });
                }}
              >
                Sí
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  </>
  );
}
