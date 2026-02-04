import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore';
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
	const [showEnvasesModal, setShowEnvasesModal] = useState(false);
	const [envases, setEnvases] = useState([]);
	const [loadingEnvases, setLoadingEnvases] = useState(false);
	const [productoSeleccionado, setProductoSeleccionado] = useState(null);
	const [selectedEnvase, setSelectedEnvase] = useState(null);

	// Nueva lógica para ADICIONALES
	const [showAdicionalModal, setShowAdicionalModal] = useState(false);
	const [esenciasAdicionales, setEsenciasAdicionales] = useState([]);
	const [loadingEsenciasAdicionales, setLoadingEsenciasAdicionales] = useState(false);
	const [selectedEsenciaAdicional, setSelectedEsenciaAdicional] = useState(null);
	// Reemplazamos gramosAdicional + cantidadAdicional por una sola cantidad total en gramos
	const [cantidadAdicionar, setCantidadAdicionar] = useState('');

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
				const cat = doc.data().category;
				if (cat && String(cat).toUpperCase() !== 'ENVASE') {
					categoriasSet.add(cat);
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
				tieneFormula: !!doc.data().idFormula,
				medida: doc.data().idFormula ? extraerMedida(doc.data().idFormula) : ''
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

	const extraerMedida = (idFormula) => {
		if (!idFormula) return '';
		// Extraer números de cadenas como "C30", "F30", etc.
		const numeros = idFormula.match(/\d+/);
		return numeros ? `${numeros[0]}ml` : '';
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

	const cargarEnvasesParaFormula = async (formulaId) => {
		try {
			setLoadingEnvases(true);
			setEnvases([]);
			// Obtener fórmula
			const formulaDoc = await getDoc(doc(db, 'FORMULAS', formulaId));
			const envaseIds = (formulaDoc.exists() && formulaDoc.data().envase) ? formulaDoc.data().envase : [];

			if (!envaseIds || envaseIds.length === 0) {
				setEnvases([]);
				return;
			}

			// Firestore where 'in' soporta hasta 10 elementos; hacemos chunk si es necesario
			const chunkArray = (arr, size) => {
				const res = [];
				for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
				return res;
			};

			const envasesEncontrados = [];
			const productosRef = collection(db, 'PRODUCTOS');

			const chunks = chunkArray(envaseIds, 10);
			for (const chunk of chunks) {
				const q = query(productosRef, where('id', 'in', chunk));
				const snap = await getDocs(q);
				snap.docs.forEach(d => {
					const data = d.data();
					// Sólo incluir envases activos y categoría ENVASE
					if ((data.category || '').toUpperCase() === 'ENVASE') {
						envasesEncontrados.push({
							documentId: d.id,
							id: data.id,
							name: data.name,
							category: data.category,
							stock: data.stock,
							price: Number(data.price) || 0
						});
					}
				});
			}

			// Mantener orden según envaseIds
			const envasesOrdenados = envaseIds
				.map(id => envasesEncontrados.find(e => e.id === id))
				.filter(Boolean);

			setEnvases(envasesOrdenados);
		} catch (err) {
			console.error('Error al cargar envases para fórmula:', err);
			setEnvases([]);
		} finally {
			setLoadingEnvases(false);
		}
	};

	const cargarEsenciasAdicionales = async () => {
		try {
			setLoadingEsenciasAdicionales(true);
			const esenciasRef = collection(db, 'ESENCIA');
			const snapshot = await getDocs(esenciasRef);
			const esen = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
			// Excluir las destinadas a PRODUCCION (misma lógica que AdminEsencias)
			const filtradas = esen.filter(e => (e.genero || '').toString().trim().toUpperCase() !== 'PRODUCCION');
			setEsenciasAdicionales(filtradas);
		} catch (err) {
			console.error('Error cargando esencias adicionales:', err);
			setEsenciasAdicionales([]);
		} finally {
			setLoadingEsenciasAdicionales(false);
		}
	};

	const handleProductoClick = (producto) => {
		if (producto.tieneFormula && producto.idFormula) {
			// Abrir modal de envases en vez de agregar directo
			setProductoSeleccionado(producto);
			setShowEnvasesModal(true);
			cargarEnvasesParaFormula(producto.idFormula);
		} else {
			// NUEVO: producto de categoría ADICIONALES -> abrir modal de selección de esencia y gramos
			if ((producto.category || '').toString().trim().toUpperCase() === 'ADICIONALES') {
				setProductoSeleccionado(producto);
				setShowAdicionalModal(true);
				setSelectedEsenciaAdicional(null);
				setCantidadAdicionar('1'); // default 1g (no se muestra input)
				cargarEsenciasAdicionales();
				return;
			}

			// Producto sin fórmula: agregar directo
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
		}
	};

	// Manejar confirmación del adicional (elige esencia + cantidad total en gramos)
	const handleConfirmarAdicional = () => {
		if (!selectedEsenciaAdicional) return;
		const gramosTotales = Number(cantidadAdicionar) || 0;
		if (gramosTotales <= 0) {
			alert('Ingrese una cantidad válida en gramos');
			return;
		}

		// validar stock disponible en ESENCIA
		const stockDisponible = Number(selectedEsenciaAdicional.stock || 0);
		if (gramosTotales > stockDisponible) {
			alert(`Stock insuficiente de ${selectedEsenciaAdicional.name || selectedEsenciaAdicional.id}. Disponible: ${stockDisponible}g`);
			return;
		}

		const nombre = `${productoSeleccionado.name} - ${selectedEsenciaAdicional.name || selectedEsenciaAdicional.nombre || selectedEsenciaAdicional.id} ${gramosTotales}g`;
		const item = {
			documentId: productoSeleccionado.documentId,
			id: productoSeleccionado.id,
			name: nombre,
			category: productoSeleccionado.category,
			price: productoSeleccionado.price,
			idEsencia: selectedEsenciaAdicional.id,
			// Guardamos el total de gramos como esenciaGramos y la contamos como 1 unidad
			esenciaGramos: gramosTotales,
			cantidad: 1,
			isAdicional: true
		};
		onAgregarAlCarrito && onAgregarAlCarrito(item);
		setShowAdicionalModal(false);
		setProductoSeleccionado(null);
		setSelectedEsenciaAdicional(null);
		setCantidadAdicionar('');
	};

	// Add product and envase; if isRefill true, subtract 230 from envase price and change name
	const handleSeleccionarEnvase = (envase, isRefill = false) => {
		if (!onAgregarAlCarrito || !productoSeleccionado || !envase) return;

		// Agregar producto principal primero
		const productoItem = {
			documentId: productoSeleccionado.documentId,
			id: productoSeleccionado.id,
			name: productoSeleccionado.name,
			category: productoSeleccionado.category,
			price: productoSeleccionado.price,
			idFormula: productoSeleccionado.idFormula,
			idEsencia: productoSeleccionado.idEsencia,
			cantidad: 1
		};
		onAgregarAlCarrito(productoItem);

		// Preparar envase (aplicar descuento si es refill)
		const descuento = isRefill ? 3000 : 0;
		const precioEnvase = Math.max((Number(envase.price) || 0) - descuento, 0);
		const nombreEnvase = isRefill
			? `REFILL DE LA FRAGANCIA ${productoSeleccionado.name}`
			: envase.name;

		const envaseItem = {
			documentId: envase.documentId,
			id: envase.id,
			name: nombreEnvase,
			category: envase.category,
			price: precioEnvase,
			cantidad: 1,
			isRefill: !!isRefill,
			refillFrom: isRefill ? productoSeleccionado.name : null
		};

		// Agregar envase con pequeño retardo para evitar conflictos
		setTimeout(() => {
			onAgregarAlCarrito(envaseItem);
			setShowEnvasesModal(false);
			setProductoSeleccionado(null);
			setSelectedEnvase(null);
		}, 100);
	};

	return (
		<div className="right-panel">
			<div className="categorias-container">
				<h3><FaBoxes /> Inventario</h3>
				
				<div className="categorias-select-container">
					<select
						value={categoriaActiva}
						onChange={(e) => handleCambiarCategoria(e.target.value)}
						className="categorias-select"
					>
						{categorias.map((cat) => (
							<option key={cat} value={cat}>
								{cat}
							</option>
						))}
					</select>
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
										{prod.medida && (
											<span className="producto-medida">{prod.medida}</span>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{showEnvasesModal && (
				<div className="envases-overlay" onClick={() => { setShowEnvasesModal(false); setProductoSeleccionado(null); }}>
					<div className="envases-modal" onClick={(e) => e.stopPropagation()}>
						<h3 style={{ marginTop: 0 }}>
							Selecciona envase para: {productoSeleccionado ? productoSeleccionado.name : ''}
						</h3>

						{loadingEnvases ? (
							<p>Cargando envases...</p>
						) : envases.length === 0 ? (
							<>
								<p>No hay envases disponibles para esta fórmula.</p>
								<div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
									<button className="btn btn-primary" disabled title="No hay envases para seleccionar">Refill</button>
									<button onClick={() => { setShowEnvasesModal(false); setProductoSeleccionado(null); setSelectedEnvase(null); }} className="btn btn-secondary">Cancelar</button>
								</div>
							</>
						) : (
							<>
								<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '12px' }}>
									{envases.map(env => (
										<div
											key={env.documentId}
											className={`envase-card ${selectedEnvase && selectedEnvase.documentId === env.documentId ? 'selected' : ''}`}
											onClick={() => setSelectedEnvase(env)}
											style={{ cursor: 'pointer', border: selectedEnvase && selectedEnvase.documentId === env.documentId ? '2px solid #2b7cff' : undefined }}
										>
											<div className="envase-card-name">{env.name}</div>
											<div className="envase-card-price">${new Intl.NumberFormat('es-CO').format(env.price)}</div>
										</div>
									))}

									{selectedEnvase && (
										<div style={{ marginTop: '8px' }}>
											<strong>Envase seleccionado:</strong> {selectedEnvase.name} - Precio: ${new Intl.NumberFormat('es-CO').format(selectedEnvase.price)}
											<div style={{ marginTop: '6px', fontSize: '0.95em', color: '#333' }}>
												Precio refill: ${new Intl.NumberFormat('es-CO').format(Math.max(Number(selectedEnvase.price || 0) - 3000, 0))} (descuento 3000)
											</div>
										</div>
									)}
								</div>

								<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
									<button
										className="btn btn-primary"
										disabled={!selectedEnvase}
										onClick={() => selectedEnvase && handleSeleccionarEnvase(selectedEnvase, false)}
									>
										Agregar envase
									</button>
									<button
										className="btn btn-primary"
										disabled={!selectedEnvase}
										onClick={() => selectedEnvase && handleSeleccionarEnvase(selectedEnvase, true)}
									>
										Refill
									</button>
									<button onClick={() => { setShowEnvasesModal(false); setProductoSeleccionado(null); setSelectedEnvase(null); }} className="btn btn-secondary">Cancelar</button>
								</div>
							</>
						)}
					</div>
				</div>
			)}

			{showAdicionalModal && (
				<div className="envases-overlay" onClick={() => { setShowAdicionalModal(false); setProductoSeleccionado(null); }}>
					<div className="envases-modal adicional-modal" onClick={(e) => e.stopPropagation()}>
						<h3 style={{ marginTop: 0 }}>
							Selecciona esencia y cantidad (g) para: {productoSeleccionado ? productoSeleccionado.name : ''}
						</h3>

						{loadingEsenciasAdicionales ? (
							<p>Cargando esencias...</p>
						) : esenciasAdicionales.length === 0 ? (
							<>
								<p>No hay esencias disponibles.</p>
								<div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
									<button onClick={() => { setShowAdicionalModal(false); setProductoSeleccionado(null); }} className="btn btn-secondary">Cerrar</button>
								</div>
							</>
						) : (
							<>
								<div className="adicional-fields">
									<label>Esencia:</label>
									<select
										value={selectedEsenciaAdicional?.id || ''}
										onChange={(e) => {
											const sel = esenciasAdicionales.find(s => s.id === e.target.value) || null;
											setSelectedEsenciaAdicional(sel);
											// fijar cantidad por defecto (1 g) al seleccionar esencia
											if (sel) setCantidadAdicionar('1'); else setCantidadAdicionar('');
										}}
									>
										<option value="">-- Seleccionar esencia --</option>
										{esenciasAdicionales.map(es => (
											<option key={es.id} value={es.id}>
												{es.name || es.nombre || es.id} (Stock: {es.stock || 0}g)
											</option>
										))}
									</select>
								</div>

								<div className="adicional-actions">
									<button className="btn btn-secondary" onClick={() => { setShowAdicionalModal(false); setProductoSeleccionado(null); }}>Cancelar</button>
									{/* Botón habilitado sólo si hay esencia seleccionada; la cantidad usada será 1g por defecto */}
									<button className="btn btn-primary" disabled={!selectedEsenciaAdicional} onClick={handleConfirmarAdicional}>Agregar Adicional</button>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
 	);
 }
