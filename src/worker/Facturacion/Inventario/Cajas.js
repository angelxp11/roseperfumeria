import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { doc, setDoc, serverTimestamp, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../server/firebase';
import { getAuth } from 'firebase/auth';
import './Cajas.css';

export default function Cajas({ onClose, onOpened, onClosed, mode = 'open' }) {
	const [efectivo, setEfectivo] = useState('');
	const [nequi, setNequi] = useState('');
	const [bancolombia, setBancolombia] = useState('');
	const [loading, setLoading] = useState(false);

	const denominaciones = [100,200,500,1000,2000,5000,10000,20000,50000,100000];
	const [denomCounts, setDenomCounts] = useState(() => ({}));
	const [metodosTotales, setMetodosTotales] = useState({ EFECTIVO: 0, NEQUI: 0, BANCOLOMBIA: 0, TRANSFERENCIA: 0 });
	const [foundMetodos, setFoundMetodos] = useState({ EFECTIVO: '', NEQUI: '', BANCOLOMBIA: '' });

	const fechaHoyId = () => {
		const d = new Date();
		const dd = String(d.getDate()).padStart(2, '0');
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const yyyy = d.getFullYear();
		return `${dd}_${mm}_${yyyy}`;
	};

	const formatNumber = val =>
		new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(val) || 0);

	// load existing CAJAS doc
	useEffect(() => {
		const cargarCaja = async () => {
			const id = fechaHoyId();
			const ref = doc(db, 'CAJAS', id);
			const snap = await getDoc(ref);
			if (snap.exists()) {
				const data = snap.data();
				// prefill open-mode inputs from APERTURA object
				if (mode === 'open' && data.APERTURA) {
					if (typeof data.APERTURA.EFECTIVO !== 'undefined') setEfectivo(String(data.APERTURA.EFECTIVO));
					if (typeof data.APERTURA.NEQUI !== 'undefined') setNequi(String(data.APERTURA.NEQUI));
					if (typeof data.APERTURA.BANCOLOMBIA !== 'undefined') setBancolombia(String(data.APERTURA.BANCOLOMBIA));
				}
				// set method totals for close mode display
				setMetodosTotales({
					EFECTIVO: Number(data.APERTURA?.EFECTIVO || data.EFECTIVO || 0),
					NEQUI: Number(data.APERTURA?.NEQUI || data.NEQUI || 0),
					BANCOLOMBIA: Number(data.APERTURA?.BANCOLOMBIA || data.BANCOLOMBIA || 0),
					TRANSFERENCIA: Number(data.TRANSFERENCIA || 0)
				});
			}
		};
		cargarCaja();
	}, [mode]);

	const obtenerNombreEmpleado = async () => {
		try {
			const auth = getAuth();
			const user = auth.currentUser;
			if (!user?.email) {
				console.warn('No hay usuario autenticado');
				return 'N/A';
			}

			const emailLower = user.email.toLowerCase();
			const q = query(collection(db, 'EMPLEADOS'), where('email', '==', emailLower));
			const snap = await getDocs(q);
			
			if (!snap.empty) {
				const nombre = snap.docs[0].data().nombre;
				console.log('Empleado encontrado:', nombre);
				return nombre || 'N/A';
			}
			
			console.warn('No se encontró empleado con email:', emailLower);
			return 'N/A';
		} catch (e) {
			console.error('Error obteniendo nombre empleado:', e);
			return 'N/A';
		}
	};

	const abrirCaja = async () => {
		try {
			setLoading(true);
			const id = fechaHoyId();
			const ref = doc(db, 'CAJAS', id);
			const movRef = doc(db, 'MOVIMIENTOS', id);

			// Obtener datos previos para detectar cambios
			const prevSnap = await getDoc(ref);
			const prevApertura = prevSnap.exists() && prevSnap.data().APERTURA ? prevSnap.data().APERTURA : {};

			const aperturaData = {
				EFECTIVO: Number(efectivo) || 0,
				NEQUI: Number(nequi) || 0,
				BANCOLOMBIA: Number(bancolombia) || 0,
				openedAt: serverTimestamp()
			};

			// Restar de PAYMENT
			const paymentSnap = await getDocs(collection(db, 'PAYMENT'));
			const metodosMap = {};
			paymentSnap.forEach(doc => {
				metodosMap[doc.data().name] = doc.id;
			});

			if (metodosMap['EFECTIVO']) {
				const efectivoRef = doc(db, 'PAYMENT', metodosMap['EFECTIVO']);
				const efectivoSnap = await getDoc(efectivoRef);
				const currentBalance = Number(efectivoSnap.data().balance || 0);
				await setDoc(efectivoRef, {
					balance: currentBalance - (Number(efectivo) || 0)
				}, { merge: true });
			}

			if (metodosMap['NEQUI']) {
				const nequiRef = doc(db, 'PAYMENT', metodosMap['NEQUI']);
				const nequiSnap = await getDoc(nequiRef);
				const currentBalance = Number(nequiSnap.data().balance || 0);
				await setDoc(nequiRef, {
					balance: currentBalance - (Number(nequi) || 0)
				}, { merge: true });
			}

			if (metodosMap['BANCOLOMBIA']) {
				const bancoRef = doc(db, 'PAYMENT', metodosMap['BANCOLOMBIA']);
				const bancoSnap = await getDoc(bancoRef);
				const currentBalance = Number(bancoSnap.data().balance || 0);
				await setDoc(bancoRef, {
					balance: currentBalance - (Number(bancolombia) || 0)
				}, { merge: true });
			}

			await setDoc(
				ref,
				{
					APERTURA: aperturaData,
					APERTURA_ACTIVE: 1,
					CIERRE_ACTIVE: 0,
					createdAt: serverTimestamp()
				},
				{ merge: true }
			);

			// --- MOVIMIENTOS ---
			const empleadoNombre = await obtenerNombreEmpleado();
			const movId = String(Date.now());
			let descripcion = '';
			if (!prevApertura.EFECTIVO && !prevApertura.NEQUI && !prevApertura.BANCOLOMBIA) {
				descripcion = `El empleado ${empleadoNombre} abrió la caja. Se retiraron de PAYMENT: EFECTIVO $${formatNumber(efectivo)}, NEQUI $${formatNumber(nequi)}, BANCOLOMBIA $${formatNumber(bancolombia)} para usar durante el día.`;
			} else {
				const cambios = [];
				if (prevApertura.EFECTIVO !== aperturaData.EFECTIVO)
					cambios.push(`EFECTIVO: de $${formatNumber(prevApertura.EFECTIVO || 0)} a $${formatNumber(aperturaData.EFECTIVO)}`);
				if (prevApertura.NEQUI !== aperturaData.NEQUI)
					cambios.push(`NEQUI: de $${formatNumber(prevApertura.NEQUI || 0)} a $${formatNumber(aperturaData.NEQUI)}`);
				if (prevApertura.BANCOLOMBIA !== aperturaData.BANCOLOMBIA)
					cambios.push(`BANCOLOMBIA: de $${formatNumber(prevApertura.BANCOLOMBIA || 0)} a $${formatNumber(aperturaData.BANCOLOMBIA)}`);
				descripcion = `El empleado ${empleadoNombre} modificó la apertura de caja. Cambios: ${cambios.join(', ')}.`;
			}
			const movObj = {
				momento: new Date().toISOString(),
				descripcion
			};
			await setDoc(movRef, { [movId]: movObj }, { merge: true });

			toast.success('✓ Caja abierta correctamente', { position: 'top-center', autoClose: 2000 });
			if (typeof onOpened === 'function') onOpened();
			setTimeout(() => {
				setLoading(false);
				onClose();
			}, 900);
		} catch (e) {
			toast.error('✗ Error abriendo la caja', { position: 'top-center', autoClose: 2000 });
			setLoading(false);
		}
	};

	const setDenomCount = (denom, value) => {
		const v = value.replace(/\D/g, '');
		setDenomCounts(prev => ({ ...prev, [denom]: v }));
	};

	const computeDenomTotals = () => {
		let total = 0;
		const details = {};
		for (const d of denominaciones) {
			const count = Number(denomCounts[d] || 0);
			const sub = count * d;
			details[d] = { count, total: sub };
			total += sub;
		}
		return { details, total };
	};

	const computeFoundTotal = () => {
			const efectivoTotal = computeDenomTotals().total;
			return efectivoTotal + Number(foundMetodos.NEQUI || 0) + Number(foundMetodos.BANCOLOMBIA || 0);
		};

	const cerrarCaja = async () => {
		try {
			setLoading(true);
			const id = fechaHoyId();
			const ref = doc(db, 'CAJAS', id);
			const movRef = doc(db, 'MOVIMIENTOS', id);

			const { details: denomDetails, total: totalDenoms } = computeDenomTotals();
			const foundTotal = computeFoundTotal();

			const cierrePayload = {
				CIERRE: {
					denominaciones: denomDetails,
					total_denominaciones: totalDenoms,
					metodos_totales: metodosTotales,
					found_metodos: {
						EFECTIVO: Number(computeDenomTotals().total || 0),
						NEQUI: Number(foundMetodos.NEQUI || 0),
						BANCOLOMBIA: Number(foundMetodos.BANCOLOMBIA || 0)
					},
					total_found: foundTotal,
					closedAt: serverTimestamp(),
					status: 'CERRADA'
				},
				CIERRE_ACTIVE: 1,
				APERTURA_ACTIVE: 0
			};

			await setDoc(ref, cierrePayload, { merge: true });

			// Sumar el total encontrado a PAYMENT
			const paymentSnap = await getDocs(collection(db, 'PAYMENT'));
			const metodosMap = {};
			paymentSnap.forEach(doc => {
				metodosMap[doc.data().name] = doc.id;
			});

			if (metodosMap['EFECTIVO']) {
				const efectivoRef = doc(db, 'PAYMENT', metodosMap['EFECTIVO']);
				const efectivoSnap = await getDoc(efectivoRef);
				const currentBalance = Number(efectivoSnap.data().balance || 0);
				await setDoc(efectivoRef, {
					balance: currentBalance + computeDenomTotals().total
				}, { merge: true });
			}

			if (metodosMap['NEQUI']) {
				const nequiRef = doc(db, 'PAYMENT', metodosMap['NEQUI']);
				const nequiSnap = await getDoc(nequiRef);
				const currentBalance = Number(nequiSnap.data().balance || 0);
				await setDoc(nequiRef, {
					balance: currentBalance + Number(foundMetodos.NEQUI || 0)
				}, { merge: true });
			}

			if (metodosMap['BANCOLOMBIA']) {
				const bancoRef = doc(db, 'PAYMENT', metodosMap['BANCOLOMBIA']);
				const bancoSnap = await getDoc(bancoRef);
				const currentBalance = Number(bancoSnap.data().balance || 0);
				await setDoc(bancoRef, {
					balance: currentBalance + Number(foundMetodos.BANCOLOMBIA || 0)
				}, { merge: true });
			}

			// --- MOVIMIENTOS CIERRE ---
			const empleadoNombre = await obtenerNombreEmpleado();
			const movId = String(Date.now());

			const diferencias = {
				EFECTIVO: computeDenomTotals().total - metodosTotales.EFECTIVO,
				NEQUI: Number(foundMetodos.NEQUI || 0) - metodosTotales.NEQUI,
				BANCOLOMBIA: Number(foundMetodos.BANCOLOMBIA || 0) - metodosTotales.BANCOLOMBIA
			};

			const detalleMetodos = ['EFECTIVO', 'NEQUI', 'BANCOLOMBIA']
				.map(m => {
					const encontrado = m === 'EFECTIVO' ? computeDenomTotals().total : Number(foundMetodos[m] || 0);
					return `${m}: esperado $${formatNumber(metodosTotales[m])}, encontrado $${formatNumber(encontrado)}${diferencias[m] !== 0 ? ` (diferencia: ${diferencias[m] > 0 ? '+' : ''}$${formatNumber(Math.abs(diferencias[m]))})` : ''}`;
				})
				.join('; ');

			const descripcion = `El empleado ${empleadoNombre} cerró la caja. Total efectivo contado: $${formatNumber(totalDenoms)}. Métodos de pago: ${detalleMetodos}. Total encontrado: $${formatNumber(foundTotal)}.`;
			
			const movObj = {
				momento: new Date().toISOString(),
				descripcion
			};
			await setDoc(movRef, { [movId]: movObj }, { merge: true });

			toast.success('✓ Caja cerrada correctamente', { position: 'top-center', autoClose: 2000 });
			if (typeof onClosed === 'function') onClosed();
			setTimeout(() => {
				setLoading(false);
				onClose();
			}, 900);
		} catch (e) {
			toast.error('✗ Error cerrando la caja', { position: 'top-center', autoClose: 2000 });
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<div className="overlay">
				<div className="modal-caja">
					<p>Cargando...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="overlay">
			<div className="modal-caja">
				<h3>{mode === 'open' ? `Apertura de Caja - ${new Date().toLocaleDateString()}` : `Cierre de Caja - ${new Date().toLocaleDateString()}`}</h3>

				{mode === 'open' && (
					<>
						<div className="apertura-section">
							<h4>Base Inicial por Método</h4>
							<div className="base-inputs">
								<div className="base-input-group">
									<label>Base Efectivo</label>
									<input
										type="text"
										value={efectivo !== '' ? formatNumber(efectivo) : ''}
										onChange={e => setEfectivo(e.target.value.replace(/\D/g, ''))}
										placeholder="0"
									/>
								</div>

								<div className="base-input-group">
									<label>Base Nequi</label>
									<input
										type="text"
										value={nequi !== '' ? formatNumber(nequi) : ''}
										onChange={e => setNequi(e.target.value.replace(/\D/g, ''))}
										placeholder="0"
									/>
								</div>

								<div className="base-input-group">
									<label>Base Bancolombia</label>
									<input
										type="text"
										value={bancolombia !== '' ? formatNumber(bancolombia) : ''}
										onChange={e => setBancolombia(e.target.value.replace(/\D/g, ''))}
										placeholder="0"
									/>
								</div>
							</div>
						</div>

						<div className="modal-buttons">
							<button className="btn-cancelar" onClick={onClose} disabled={loading}>Cancelar</button>
							<button className="btn-abrir" onClick={abrirCaja} disabled={loading}>{loading ? 'Guardando...' : 'Abrir Caja'}</button>
						</div>
					</>
				)}

				{mode === 'close' && (
					<>
						<div className="denom-section">
							<h4>Conteo de monedas / billetes</h4>
							<div className="denom-list">
								{denominaciones.map(d => (
									<div className="denom-row" key={d}>
										<div className="denom-label">${formatNumber(d)}</div>
										<input
											className="denom-count"
											type="text"
											inputMode="numeric"
											value={denomCounts[d] || ''}
											onChange={e => setDenomCount(d, e.target.value)}
											placeholder="0"
										/>
										<div className="denom-subtotal">${formatNumber((Number(denomCounts[d] || 0) * d))}</div>
									</div>
								))}
							</div>
							<div className="denom-total">
								<strong>Total efectivo contado: </strong>
								<span>${formatNumber(computeDenomTotals().total)}</span>
							</div>
						</div>

						<div className="metodos-section">
							<h4>Totales en caja (según CAJAS)</h4>
							{['EFECTIVO','NEQUI','BANCOLOMBIA'].map(m => (
								<div className="metodo-row" key={m}>
									<div className="metodo-label">{m}</div>
									<div className="metodo-total">${formatNumber(metodosTotales[m] || 0)}</div>
									<input
										className="metodo-found"
										type="text"
										inputMode="numeric"
										value={m === 'EFECTIVO' ? formatNumber(computeDenomTotals().total) : formatNumber(foundMetodos[m] || 0)}
										onChange={e => m !== 'EFECTIVO' && setFoundMetodos(prev => ({ ...prev, [m]: e.target.value.replace(/\D/g, '') }))}
										placeholder="0"
										readOnly={m === 'EFECTIVO'}
									/>
								</div>
							))}

							<div className="metodo-total-sum">
								<strong>Total en cuentas ingresado: </strong>
								<span>${formatNumber(computeFoundTotal())}</span>
							</div>
						</div>

						<div className="modal-buttons">
							<button className="btn-cancelar" onClick={onClose} disabled={loading}>Cancelar</button>
							<button className="btn-abrir" onClick={cerrarCaja} disabled={loading}>{loading ? 'Guardando...' : 'Cerrar Caja'}</button>
						</div>
					</>
				)}
			</div>
		</div>
	);}

