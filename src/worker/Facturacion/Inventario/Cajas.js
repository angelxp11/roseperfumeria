import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { doc, setDoc, serverTimestamp, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../server/firebase';
import { getAuth } from 'firebase/auth';
import './Cajas.css';

export default function Cajas({ onClose, onOpened, onClosed, mode = 'open' }) {
	const [efectivo, setEfectivo] = useState('');
	const [transferencia, setTransferencia] = useState('');
	// Métodos relevantes (type EFECTIVO | TRANSFERENCIA) y inputs por método (apertura)
	const [paymentMethodsCaja, setPaymentMethodsCaja] = useState([]); // array de métodos {id,name,type,balance,...}
	const [aperturaInputs, setAperturaInputs] = useState({}); // { [methodName]: '12345' }
	const [loading, setLoading] = useState(false);

	const denominaciones = [100,200,500,1000,2000,5000,10000,20000,50000,100000];
	const [denomCounts, setDenomCounts] = useState(() => ({}));
	const [metodosTotales, setMetodosTotales] = useState({ EFECTIVO: 0, TRANSFERENCIA: 0 });
	const [foundMetodos, setFoundMetodos] = useState({ EFECTIVO: '', TRANSFERENCIA: '' });

	const fechaHoyId = () => {
		const d = new Date();
		const dd = String(d.getDate()).padStart(2, '0');
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const yyyy = d.getFullYear();
		return `${dd}_${mm}_${yyyy}`;
	};

	const formatNumber = val =>
		new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(val) || 0);

	// Obtener métodos de pago y filtrar por type (EFECTIVO / TRANSFERENCIA)
	const fetchPaymentMethodsByType = async () => {
		const snap = await getDocs(collection(db, 'PAYMENT'));
		const map = {};
		snap.forEach(d => {
			const data = d.data();
			const t = (data.type || '').toString().trim().toUpperCase();
			if (t === 'EFECTIVO' || t === 'TRANSFERENCIA') {
				// Guardamos el primer método por tipo (si hay varios, se toma el primero)
				if (!map[t]) {
					map[t] = { id: d.id, balance: Number(data.balance || 0), name: data.name || '' };
				}
			}
		});
		return map;
	};

	// Obtiene array de métodos de pago cuyo campo type sea EFECTIVO o TRANSFERENCIA
	const fetchPaymentMethodsArray = async () => {
		const snap = await getDocs(collection(db, 'PAYMENT'));
		const arr = [];
		snap.forEach(d => {
			const data = d.data();
			const t = (data.type || '').toString().trim().toUpperCase();
			if (t === 'EFECTIVO' || t === 'TRANSFERENCIA') {
				arr.push({ id: d.id, name: data.name, type: t, balance: Number(data.balance || 0), number: data.number || '', titular: data.titular || '' });
			}
		});
		return arr;
	};

	// load existing CAJAS doc
	useEffect(() => {
		const cargarCaja = async () => {
			const id = fechaHoyId();
			const ref = doc(db, 'CAJAS', id);
			const snap = await getDoc(ref);
			// cargar métodos de pago relevantes
			const pagos = await fetchPaymentMethodsArray();
			setPaymentMethodsCaja(pagos);

			if (snap.exists()) {
				const data = snap.data();
				// prefill open-mode inputs from APERTURA object
				if (mode === 'open' && data.APERTURA) {
					// Si APERTURA tiene keys por método name, úsalas. Si hay legacy EFECTIVO/TRANSFERENCIA, mapear a los métodos detectados.
					const aperturaObj = data.APERTURA || {};
					const inputs = {};
					for (const m of pagos) {
						// prioridad: aperturaObj[method.name] -> aperturaObj[type legacy] -> 0
						const val = (typeof aperturaObj[m.name] !== 'undefined') ? aperturaObj[m.name]
							: (m.type === 'EFECTIVO' && typeof aperturaObj.EFECTIVO !== 'undefined' ? aperturaObj.EFECTIVO
							: (m.type === 'TRANSFERENCIA' && typeof aperturaObj.TRANSFERENCIA !== 'undefined' ? aperturaObj.TRANSFERENCIA : 0));
						inputs[m.name] = String(val || 0);
					}
					setAperturaInputs(inputs);
				}
				// set method totals for close mode display: map por método
				const metTotals = {};
				for (const m of pagos) {
					metTotals[m.name] = Number(
						(snap.data().APERTURA && typeof snap.data().APERTURA[m.name] !== 'undefined') ? snap.data().APERTURA[m.name]
						: (m.type === 'EFECTIVO' && typeof snap.data().APERTURA?.EFECTIVO !== 'undefined' ? snap.data().APERTURA.EFECTIVO
						: (m.type === 'TRANSFERENCIA' && typeof snap.data().APERTURA?.TRANSFERENCIA !== 'undefined' ? snap.data().APERTURA.TRANSFERENCIA : m.balance || 0))
					);
				}
				setMetodosTotales(metTotals);
				// llenar foundMetodos desde CIERRE encontrado o dejar vacíos
				const founds = {};
				for (const m of pagos) {
					founds[m.name] = Number(snap.data().CIERRE?.found_metodos?.[m.name] || 0);
				}
				setFoundMetodos(prev => ({ ...prev, ...founds }));
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

			// Apertura por método: usar aperturaInputs (clave = method.name). Guardar APERTURA con keys por método.
			const aperturaData = { openedAt: serverTimestamp() };
			for (const m of paymentMethodsCaja) {
				const v = Number(aperturaInputs[m.name] || 0);
				aperturaData[m.name] = v;
			}

			// Restar de PAYMENT por documento (si el usuario ingresó un monto para ese método)
			for (const m of paymentMethodsCaja) {
				const v = Number(aperturaInputs[m.name] || 0);
				if (!v) continue;
				const payRef = doc(db, 'PAYMENT', m.id);
				const paySnap = await getDoc(payRef);
				const currentBalance = Number(paySnap.data().balance || 0);
				await setDoc(payRef, { balance: currentBalance - v }, { merge: true });
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
			// Construir descripción con los métodos detectados
			const cambios = [];
			for (const m of paymentMethodsCaja) {
				const prevVal = Number(prevApertura?.[m.name] || 0);
				const newVal = Number(aperturaData[m.name] || 0);
				if (!prevSnap.exists() || prevVal === 0 && newVal > 0) {
					cambios.push(`${m.name}: $${formatNumber(newVal)}`);
				} else if (prevVal !== newVal) {
					cambios.push(`${m.name}: de $${formatNumber(prevVal)} a $${formatNumber(newVal)}`);
				}
			}
			descripcion = cambios.length > 0 ? `El empleado ${empleadoNombre} abrió/modificó la apertura de caja. ${cambios.join(', ')}.` : `El empleado ${empleadoNombre} abrió la caja.`;
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
		const efectivoExists = paymentMethodsCaja.some(m => (m.type || '').toUpperCase() === 'EFECTIVO');
		let total = efectivoExists ? computeDenomTotals().total : 0;
		for (const m of paymentMethodsCaja) {
			if ((m.type || '').toUpperCase() === 'EFECTIVO') continue;
			total += Number(foundMetodos[m.name] || 0);
		}
		return total;
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
					found_metodos: (() => {
						const fm = {};
						for (const m of paymentMethodsCaja) {
							fm[m.name] = (m.type === 'EFECTIVO') ? Number(computeDenomTotals().total || 0) : Number(foundMetodos[m.name] || 0);
						}
						return fm;
					})(),
					total_found: foundTotal,
					closedAt: serverTimestamp(),
					status: 'CERRADA'
				},
				CIERRE_ACTIVE: 1,
				APERTURA_ACTIVE: 0
			};

			await setDoc(ref, cierrePayload, { merge: true });

			// Sumar el total encontrado a PAYMENT por documento (según métodos detectados)
			for (const m of paymentMethodsCaja) {
				const toAdd = (m.type === 'EFECTIVO') ? Number(computeDenomTotals().total || 0) : Number(foundMetodos[m.name] || 0);
				if (!toAdd) continue;
				const refPay = doc(db, 'PAYMENT', m.id);
				const snapPay = await getDoc(refPay);
				const currentBalance = Number(snapPay.data().balance || 0);
				await setDoc(refPay, { balance: currentBalance + toAdd }, { merge: true });
			}

			// --- MOVIMIENTOS CIERRE ---
			const empleadoNombre = await obtenerNombreEmpleado();
			const movId = String(Date.now());

			// diferencias por método detectado
			const diffs = [];
			for (const m of paymentMethodsCaja) {
				const esperado = Number(metodosTotales[m.name] || 0);
				const encontrado = (m.type === 'EFECTIVO') ? Number(computeDenomTotals().total || 0) : Number(foundMetodos[m.name] || 0);
				const diff = encontrado - esperado;
				diffs.push(`${m.name}: esperado $${formatNumber(esperado)}, encontrado $${formatNumber(encontrado)}${diff !== 0 ? ` (diferencia: ${diff > 0 ? '+' : ''}$${formatNumber(Math.abs(diff))})` : ''}`);
			}
			const detalleMetodos = diffs.join('; ');

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
								{paymentMethodsCaja.length > 0 ? paymentMethodsCaja.map(m => (
									<div className="base-input-group" key={m.id}>
										<label>{m.name} ({m.type})</label>
										<input
											type="text"
											value={aperturaInputs[m.name] !== undefined ? formatNumber(aperturaInputs[m.name]) : ''}
											onChange={(e) => setAperturaInputs(prev => ({ ...prev, [m.name]: e.target.value.replace(/\D/g, '') }))}
											placeholder="0"
										/>
									</div>
								)) : (
									<>
									<div className="base-input-group">
										<label>Base Efectivo</label>
										<input type="text" value={efectivo !== '' ? formatNumber(efectivo) : ''} onChange={e => setEfectivo(e.target.value.replace(/\D/g, ''))} placeholder="0" />
									</div>
									<div className="base-input-group">
										<label>Base Transferencia</label>
										<input type="text" value={transferencia !== '' ? formatNumber(transferencia) : ''} onChange={e => setTransferencia(e.target.value.replace(/\D/g, ''))} placeholder="0" />
									</div>
									</>
								)}
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
							{(paymentMethodsCaja.length > 0 ? paymentMethodsCaja : [{ name: 'EFECTIVO', type: 'EFECTIVO' }, { name: 'TRANSFERENCIA', type: 'TRANSFERENCIA' }]).map(m => (
								<div className="metodo-row" key={m.name}>
									<div className="metodo-label">{m.name}</div>
									<div className="metodo-total">${formatNumber(metodosTotales[m.name] || 0)}</div>
									<input
										className="metodo-found"
										type="text"
										inputMode="numeric"
										value={m.type === 'EFECTIVO' ? formatNumber(computeDenomTotals().total) : formatNumber(foundMetodos[m.name] || 0)}
										onChange={e => m.type !== 'EFECTIVO' && setFoundMetodos(prev => ({ ...prev, [m.name]: e.target.value.replace(/\D/g, '') }))}
										placeholder="0"
										readOnly={m.type === 'EFECTIVO'}
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
	);
}

