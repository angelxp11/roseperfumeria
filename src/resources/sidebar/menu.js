import './menu.css';
import icono from '../Images/logo512.png';

import { FaShoppingBag, FaBoxes, FaSignOutAlt, FaUsers, FaWallet, FaMoneyBillWave, FaFileInvoice, FaFlask, FaLeaf } from 'react-icons/fa';

export default function Menu({ onSelect, onLogout, loading, rol }) {
  return (
    <aside className="menu">
      <div className="menu-logo">
        <img src={icono} alt="Rose Perfumería" />
      </div>

      <div className="menu-menu">
        <button onClick={() => onSelect('factura')} title="Ventas">
          <FaShoppingBag className="icon" />
          <span className="label">Ventas</span>
        </button>

        <button onClick={() => onSelect('flujo')} title="Flujo">
          <FaMoneyBillWave className="icon" />
          <span className="label">Flujo</span>
        </button>

        {rol === 'ADMINISTRADOR' && (
          <>
            <button onClick={() => onSelect('facturas')} title="Facturas">
              <FaFileInvoice className="icon" />
              <span className="label">Facturas</span>
            </button>

            <button onClick={() => onSelect('inventario')} title="Inventario">
              <FaBoxes className="icon" />
              <span className="label">Inventario</span>
            </button>

            <button onClick={() => onSelect('formulas')} title="Fórmulas">
              <FaFlask className="icon" />
              <span className="label">Fórmulas</span>
            </button>

            <button onClick={() => onSelect('esencias')} title="Esencias">
              <FaLeaf className="icon" />
              <span className="label">Esencias</span>
            </button>

            <button onClick={() => onSelect('empleados')} title="Empleados">
              <FaUsers className="icon" />
              <span className="label">Empleados</span>
            </button>

            <button onClick={() => onSelect('wallet')} title="Wallet">
              <FaWallet className="icon" />
              <span className="label">Wallet</span>
            </button>
          </>
        )}

        <button onClick={onLogout} title="Cerrar sesión" disabled={loading} className="logout-button">
          <FaSignOutAlt className="icon" />
          <span className="label">{loading ? 'Borrando...' : 'Cerrar sesión'}</span>
        </button>
      </div>
    </aside>
  );
}
