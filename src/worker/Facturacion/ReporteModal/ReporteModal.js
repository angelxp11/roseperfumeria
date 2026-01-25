import { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import ReportePDF from '../ReportePDF/ReportePDF';
import './ReporteModal.css';

export default function ReporteModal({ onClose }) {
  const [selectedRange, setSelectedRange] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const ranges = [
    { value: 1, label: 'Hoy' },
    { value: 7, label: 'Últimos 7 días' },
    { value: 15, label: 'Últimos 15 días' },
    { value: 30, label: 'Últimos 30 días' },
    { value: 90, label: 'Últimos 90 días' },
    { value: 180, label: 'Últimos 180 días' },
    { value: 365, label: 'Últimos 365 días' },
  ];

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      // El PDF ahora es vacío, el rango es opcional
      await ReportePDF.generateReport(selectedRange);
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

          <div className="range-buttons">
            {ranges.map((range) => (
              <button
                key={range.value}
                className={`range-btn ${
                  selectedRange === range.value ? 'active' : ''
                }`}
                onClick={() => setSelectedRange(range.value)}
                disabled={generatingReport}
              >
                {range.label}
              </button>
            ))}
          </div>
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
