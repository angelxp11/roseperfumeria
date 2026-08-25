import { useEffect, useRef, useState } from 'react';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../server/firebase';
import { toast } from 'react-toastify';
import { FaTimes, FaSave } from 'react-icons/fa';
import './prices.css';

const agruparPorFormula = (productos, esencias) => {
	const grupos = new Map();

	productos
		.filter(producto => (
			producto.idFormula &&
			(producto.category || '').toString().trim().toUpperCase() === 'FRAGANCIA'
		))
		.forEach(producto => {
			const formulaId = String(producto.idFormula).trim();
			const esencia = esencias.find(item => item.id === producto.idEsencia);
			const tipo = (esencia?.genero || '').toString().trim().toUpperCase().includes('ARABE')
				? 'ARABE'
				: 'AMERICANA';
			const grupoId = `${formulaId}-${tipo}`;
			if (!grupos.has(grupoId)) {
				grupos.set(grupoId, { grupoId, formulaId, tipo, productos: [], frascos: [] });
			}
			grupos.get(grupoId).productos.push(producto);
		});

	return Array.from(grupos.values()).sort((a, b) => a.grupoId.localeCompare(b.grupoId));
};

export default function Prices({ productos, esencias, onClose, onProductsUpdated }) {
	const [grupos, setGrupos] = useState([]);
	const [precios, setPrecios] = useState({});
	const [preciosIniciales, setPreciosIniciales] = useState({});
	const [formulas, setFormulas] = useState([]);
	const [gruposAbiertos, setGruposAbiertos] = useState({});
	const [guardando, setGuardando] = useState(false);
	const guardadoEnCurso = useRef(false);

	useEffect(() => {
		const productosEnvase = productos.filter(producto => (
			(producto.category || '').toString().trim().toUpperCase() === 'ENVASE'
		));
		const gruposActualizados = agruparPorFormula(productos, esencias).map(grupo => {
			const formula = formulas.find(item => item.id === grupo.formulaId);
			const envaseIds = formula?.envase || [];
			return {
				...grupo,
				frascos: envaseIds
					.map(id => productosEnvase.find(producto => producto.id === id))
					.filter(Boolean)
			};
		});
		setGrupos(gruposActualizados);
		setPreciosIniciales(Object.fromEntries(
			gruposActualizados.map(grupo => [grupo.grupoId, grupo.productos[0]?.price ?? ''])
		));
		setPrecios(Object.fromEntries(gruposActualizados.map(grupo => [grupo.grupoId, ''])));
	}, [productos, esencias, formulas]);

	useEffect(() => {
		const cargarFormulas = async () => {
			try {
				const snapshot = await getDocs(collection(db, 'FORMULAS'));
				setFormulas(snapshot.docs.map(formula => ({ id: formula.id, ...formula.data() })));
			} catch (err) {
				console.error('Error al cargar fórmulas para los frascos:', err);
			}
		};
		cargarFormulas();
	}, []);

	const handlePriceChange = (formulaId, value) => {
		setPrecios(prev => ({ ...prev, [formulaId]: value }));
	};

	const toggleGrupo = (grupoId) => {
		setGruposAbiertos(prev => ({ ...prev, [grupoId]: !prev[grupoId] }));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (guardadoEnCurso.current) return;
		const cambios = grupos.flatMap(grupo => {
			const precioInput = precios[grupo.grupoId];
			if (precioInput === undefined || precioInput === null || String(precioInput).trim() === '') {
				return [];
			}
			const precio = Number(precioInput);
			const precioInicial = Number(preciosIniciales[grupo.grupoId]);
			return Number.isFinite(precio) && precio >= 0 && precio !== precioInicial
				? grupo.productos.map(producto => ({ producto, precio }))
				: [];
		});

		if (cambios.length === 0) {
			toast.error('Cambia al menos un precio para actualizar', { containerId: 'local', position: 'top-right' });
			return;
		}

		try {
			guardadoEnCurso.current = true;
			setGuardando(true);
			const batch = writeBatch(db);
			cambios.forEach(({ producto, precio }) => {
				batch.update(doc(db, 'PRODUCTOS', producto.documentId), { price: precio });
			});
			await batch.commit();

			const productosActualizados = productos.map(producto => {
				const cambio = cambios.find(item => item.producto.documentId === producto.documentId);
				return cambio ? { ...producto, price: cambio.precio } : producto;
			});
			onProductsUpdated(productosActualizados);
			toast.success(`${cambios.length} fragancia(s) actualizada(s)`, { containerId: 'local', position: 'top-right' });
			onClose();
		} catch (err) {
			console.error('Error al actualizar precios por fórmula:', err);
			toast.error('No se pudieron actualizar los precios', { containerId: 'local', position: 'top-right' });
		} finally {
			guardadoEnCurso.current = false;
			setGuardando(false);
		}
	};

	return (
		<div className="prices-overlay" onClick={onClose}>
			<div className="prices-modal" onClick={e => e.stopPropagation()}>
				<div className="prices-header">
					<div>
						<h3>Actualizar precios por fórmula</h3>
						<p>Las fragancias con la misma fórmula recibirán el mismo precio.</p>
					</div>
					<button type="button" onClick={onClose} className="prices-close" title="Cerrar">
						<FaTimes />
					</button>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="prices-list">
						{grupos.length === 0 ? (
							<p className="prices-empty">No hay fragancias con fórmula para actualizar.</p>
						) : grupos.map(grupo => (
							<section className="price-group" key={grupo.grupoId}>
								<div
									className="price-group-header"
									onClick={() => toggleGrupo(grupo.grupoId)}
									role="button"
									tabIndex="0"
									onKeyDown={e => e.key === 'Enter' && toggleGrupo(grupo.grupoId)}
								>
									<strong>Fórmula {grupo.formulaId} · {grupo.tipo}</strong>
									<span className="price-group-chevron">{gruposAbiertos[grupo.grupoId] ? '▲' : '▼'}</span>
									<label>
										Nuevo precio
										<input
											type="number"
											min="0"
											step="0.01"
											value={precios[grupo.grupoId]}
											onClick={e => e.stopPropagation()}
											onChange={e => handlePriceChange(grupo.grupoId, e.target.value)}
										/>
									</label>
								</div>
								{gruposAbiertos[grupo.grupoId] && (
									<div className="price-group-content">
										<ul>
											{grupo.productos.map(producto => (
												<li key={producto.documentId}>
													<span>{producto.name}</span>
													<span>${Number(producto.price || 0).toLocaleString('es-CO')}</span>
												</li>
											))}
										</ul>
										{grupo.frascos.length > 0 && (
											<div className="price-bottles">
												<strong>Frascos</strong>
												{grupo.frascos.map(frasco => (
													<div key={frasco.documentId}>
														<span>{frasco.name} ({frasco.id})</span>
														<span>${Number(frasco.price || 0).toLocaleString('es-CO')}</span>
													</div>
												))}
											</div>
										)}
									</div>
								)}
							</section>
						))}
					</div>

					<div className="prices-actions">
						<button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
						<button type="submit" className="btn btn-primary" disabled={guardando || grupos.length === 0}>
							<FaSave /> {guardando ? 'Actualizando...' : 'Actualizar precios'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
