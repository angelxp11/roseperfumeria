import { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import ReportePDF from '../ReportePDF/ReportePDF';
import './ReporteModal.css';

export default function ReporteModal({ onClose }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [includeInventory, setIncludeInventory] = useState(false);

  const handleGenerateReport = async () => {
    if (!startDate) {
      alert('Debes seleccionar una fecha inicial');
      return;
    }

    setGeneratingReport(true);
    try {
      // 🔒 PARSEAR CORRECTAMENTE - El input devuelve YYYY-MM-DD sin zona horaria
      const [yearStart, monthStart, dayStart] = startDate.split('-');
      const start = new Date(Number(yearStart), Number(monthStart) - 1, Number(dayStart));
      start.setHours(0, 0, 0, 0);

      const [yearEnd, monthEnd, dayEnd] = (endDate || startDate).split('-');
      const end = new Date(Number(yearEnd), Number(monthEnd) - 1, Number(dayEnd));
      end.setHours(23, 59, 59, 999);

      const range = {
        startDate: start,
        endDate: end,
        includeInventory: Boolean(includeInventory),
      };
      await ReportePDF.generateReport(range);
    } catch (error) {
      console.error('Error generando reporte:', error);
    } finally {
      setGeneratingReport(false);
      onClose();
    }
  };

  return (
    <div className="reporte-modal-overlay">
      <div className="reporte-modal">
        <div className="reporte-modal-header">
          <h3>Informe de Cierre de Caja</h3>
          <button
            className="close-btn"
            onClick={onClose}
            disabled={generatingReport}
          >
            <FaTimes />
          </button>
        </div>

        <div className="reporte-modal-content">
          <p>Selecciona el período para el informe:</p>

          <div className="toggle-row" style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6 }}>Opciones de Reporte</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label className="switch">
                <input type="checkbox" checked={includeInventory} onChange={(e) => setIncludeInventory(e.target.checked)} disabled={generatingReport} />
                <span className="slider" />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="toggle-label">Incluir inventario gastado</span>
                <small style={{ color: 'var(--color-text-soft)' }}>Apagado = Informe estándar. Encendido = añade inventario gastado.</small>
              </div>
            </div>
          </div>

          <div className="date-inputs">
            <div className="date-group">
              <label>Fecha Inicial (Requerida)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={generatingReport}
              />
            </div>

            <div className="date-group">
              <label>Fecha Final (Opcional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={generatingReport}
                min={startDate}
              />
            </div>
          </div>

          <p style={{ fontSize: '0.85em', color: '#666', marginTop: '10px' }}>
            💡 Si dejas la fecha final vacía, se genera el informe solo para la fecha inicial
            (con denominaciones de efectivo).
          </p>
        </div>

        <div className="reporte-modal-footer">
          <button
            className="btn-cancel"
            onClick={onClose}
            disabled={generatingReport}
          >
            Cancelar
          </button>

          <button
            className="btn-generate"
            onClick={handleGenerateReport}
            disabled={generatingReport}
          >
            {generatingReport ? 'Generando...' : 'Generar Informe'}
          </button>
        </div>
      </div>
    </div>
  );
}
