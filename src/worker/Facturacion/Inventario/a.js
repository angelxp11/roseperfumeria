import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../../server/firebase';
import './Cajas.css'; // optional: create styles or reuse existing

export default function Cajas({ onClose, onOpened, onClosed, mode = 'open' }) {
    const [efectivo, setEfectivo] = useState('');
    const [nequi, setNequi] = useState('');
    const [bancolombia, setBancolombia] = useState('');
    const [loading, setLoading] = useState(false);

    // NEW flags locally
    const [aperturaActive, setAperturaActive] = useState(false);
    const [cierreActive, setCierreActive] = useState(false);

    // NEW - close mode state
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

    // load existing CAJAS doc (for both open to prefill and close to show totals and flags)
    useEffect(() => {
        const cargarCaja = async () => {
            const id = fechaHoyId();
            const ref = doc(db, 'CAJAS', id);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const data = snap.data();
                // flags
                if (data.APERTURA_ACTIVE === 1) setAperturaActive(true);
                if (data.CIERRE_ACTIVE === 1) setCierreActive(true);
                // prefill open-mode inputs if present
                if (mode === 'open') {
                    if (typeof data.EFECTIVO !== 'undefined') setEfectivo(String(data.EFECTIVO));
                    if (typeof data.NEQUI !== 'undefined') setNequi(String(data.NEQUI));
                    if (typeof data.BANCOLOMBIA !== 'undefined') setBancolombia(String(data.BANCOLOMBIA));
                }
                // set method totals for close mode display
                setMetodosTotales({
                    EFECTIVO: Number(data.EFECTIVO || 0),
                    NEQUI: Number(data.NEQUI || 0),
                    BANCOLOMBIA: Number(data.BANCOLOMBIA || 0),
                    TRANSFERENCIA: Number(data.TRANSFERENCIA || 0)
                });
            }
        };
        cargarCaja();
    }, [mode]);

    const abrirCaja = async () => {
        try {
            // prevent opening if apertura already active
            if (aperturaActive) {
                toast.info('La caja ya está abierta hoy');
                return;
            }
            setLoading(true);
            const id = fechaHoyId();
            const ref = doc(db, 'CAJAS', id);
            // APERTURA object + flags
            await setDoc(
                ref,
                {
                    APERTURA: {
                        EFECTIVO: Number(efectivo) || 0,
                        NEQUI: Number(nequi) || 0,
                        BANCOLOMBIA: Number(bancolombia) || 0,
                        openedAt: serverTimestamp()
                    },
                    EFECTIVO: Number(efectivo) || 0,
                    NEQUI: Number(nequi) || 0,
                    BANCOLOMBIA: Number(bancolombia) || 0,
                    APERTURA_ACTIVE: 1,
                    CIERRE_ACTIVE: 0,
                    createdAt: serverTimestamp()
                },
                { merge: true }
            );
            toast.success('✓ Caja abierta correctamente', { position: 'top-center', autoClose: 2000 });
            setAperturaActive(true);
            // notify parent
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

    // NEW - helper: update denom counts
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
        return ['EFECTIVO','NEQUI','BANCOLOMBIA'].reduce((s,k) => s + Number(foundMetodos[k] || 0), 0);
    };

    const cerrarCaja = async () => {
        try {
            // guard: don't allow closing if already closed
            const id = fechaHoyId();
            const refCheck = doc(db, 'CAJAS', id);
            const snapCheck = await getDoc(refCheck);
            if (snapCheck.exists() && snapCheck.data().CIERRE_ACTIVE === 1) {
                toast.info('La caja ya fue cerrada');
                return;
            }

            setLoading(true);
            const ref = doc(db, 'CAJAS', id);

            const { details: denomDetails, total: totalDenoms } = computeDenomTotals();
            const foundTotal = computeFoundTotal();

            const cierrePayload = {
                CIERRE: {
                    denominaciones: denomDetails,
                    total_denominaciones: totalDenoms,
                    metodos_totales: metodosTotales,
                    found_metodos: {
                        EFECTIVO: Number(foundMetodos.EFECTIVO || 0),
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

            toast.success('✓ Caja cerrada correctamente', { position: 'top-center', autoClose: 2000 });
            setCierreActive(true);
            // notify parent
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
                <ToastContainer />
            </div>
        );
    }

    // UI: different render for open / close
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
                                        value={foundMetodos[m] || ''}
                                        onChange={e => setFoundMetodos(prev => ({ ...prev, [m]: e.target.value.replace(/\D/g, '') }))
                                        }
                                        placeholder="0"
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
            <ToastContainer position="top-center" autoClose={2000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover />
        </div>
    );
}
