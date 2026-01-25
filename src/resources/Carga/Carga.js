import './Carga.css';

export default function Carga() {
  return (
    <div className="carga-fullscreen">
      <div className="carga-container">
        <div className="carga-content">
          <div className="spinner"></div>
          <p className="carga-text">Cargando...</p>
        </div>
      </div>
    </div>
  );
}