import jsPDF from 'jspdf';
import { db } from '../../../server/firebase';
import { doc, getDoc } from 'firebase/firestore';

class ReportePDF {

  /* ================= UTILIDADES ================= */

  static formatDate(date) {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  static formatMoney(value) {
    return `$ ${Number(value).toLocaleString('es-CO')}`;
  }

  static getDateRange(days) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);
    // normalizar horas
    startDate.setHours(0,0,0,0);
    endDate.setHours(23,59,59,999);
    return { startDate, endDate };
  }

  static getRangeLabel(days) {
    const map = {
      1: 'Hoy',
      7: 'Últimos 7 días',
      15: 'Últimos 15 días',
      30: 'Últimos 30 días',
      90: 'Últimos 90 días',
      180: 'Últimos 180 días',
      365: 'Últimos 365 días'
    };
    return map[days] || `Últimos ${days} días`;
  }

  // nuevo: etiqueta desde/hasta para rangos custom
  static getRangeLabelFromDates(startDate, endDate) {
    const s = this.formatDate(startDate);
    const e = this.formatDate(endDate);
    if (s === e) return `Día: ${s}`;
    return `Desde ${s} hasta ${e}`;
  }

  // nuevo: parsear entrada (number o {startDate,endDate})
  static parseRange(range) {
    // Si ya viene con startDate y endDate normalizados, úsalos directamente
    if (range && range.startDate && range.endDate) {
      return {
        startDate: range.startDate,
        endDate: range.endDate,
      };
    }
    // fallback: hoy
    return this.getDateRange(1);
  }

  static formatDateToDocId(date) {
    return `${String(date.getDate()).padStart(2, '0')}_${String(date.getMonth() + 1).padStart(2, '0')}_${date.getFullYear()}`;
  }

  static splitISO(iso) {
    const d = new Date(iso);
    return {
      fecha: d.toLocaleDateString('es-ES'),
      hora: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    };
  }

  /* ================= DATA ================= */

  static async getMovimientos(startDate, endDate) {
    const data = [];
    const current = new Date(startDate);
    current.setHours(0,0,0,0);

    while (current <= endDate) {
      const docId = this.formatDateToDocId(current);
      const ref = doc(db, 'MOVIMIENTOS', docId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        Object.values(snap.data()).forEach(m => {
          if (m?.descripcion && m?.momento) {
            // Reemplazar la palabra "PAYMENT" (cualquier mayúsc/minúsc) por "Wallet"
            const descripcion = String(m.descripcion).replace(/\bpayment\b/gi, 'Wallet');
            data.push({ ...m, descripcion });
          }
        });
      }
      current.setDate(current.getDate() + 1);
    }

    // 🔥 MÁS NUEVO A MÁS ANTIGUO
    return data.sort((a, b) => new Date(b.momento) - new Date(a.momento));
  }

  static async getFacturas(startDate, endDate) {
    // Devuelve un array de facturas completas (igual que cargarFacturas en admin/facturas/facturas.js)
    const facturas = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      const docId = this.formatDateToDocId(current);
      const ref = doc(db, 'FACTURAS', docId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        for (const [facturaId, facturaData] of Object.entries(data)) {
          facturas.push({
            documentId: docId,
            facturaId,
            fecha: facturaData.fecha || new Date().toISOString(),
            ...facturaData
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }

    // ordenar por fecha mas reciente primero
    facturas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return facturas;
  }

  static agruparProductos(productos) {
    const map = {};
    productos.forEach(p => {
      if (!map[p.id]) map[p.id] = { ...p };
      else map[p.id].cantidad += p.cantidad;
    });
    return Object.values(map);
  }

  static parseMovimientos(movimientos) {
    const gastos = [];
    
    movimientos.forEach(m => {
      const desc = m.descripcion || '';
      
      if (desc.includes('Ingreso de dinero')) {
        const montoMatch = desc.match(/Ingreso de dinero: \$([0-9.,]+)\s+a\s+([^.]+)\./);
        if (montoMatch) {
          const monto = montoMatch[1].replace(/\./g, '').replace(/,/g, '');
          const metodo = montoMatch[2].trim();
          const motivoMatch = desc.match(/Motivo:\s+([^.]+)\./);
          const motivo = motivoMatch ? motivoMatch[1].trim() : '';
          gastos.push({
            tipo: 'Ingreso',
            metodo,
            monto: Number(monto),
            motivo,
            momento: m.momento
          });
        }
      } else if (desc.includes('Retiro de dinero')) {
        const montoMatch = desc.match(/Retiro de dinero: \$([0-9.,]+)\s+de\s+([^.]+)\./);
        if (montoMatch) {
          const monto = montoMatch[1].replace(/\./g, '').replace(/,/g, '');
          const metodo = montoMatch[2].trim();
          const motivoMatch = desc.match(/Motivo:\s+([^.]+)\./);
          const motivo = motivoMatch ? motivoMatch[1].trim() : '';
          gastos.push({
            tipo: 'Retiro',
            metodo,
            monto: Number(monto),
            motivo,
            momento: m.momento
          });
        }
      } else if (desc.includes('Transferencia de')) {
        const montoMatch = desc.match(/Transferencia de \$([0-9.,]+)\s+de\s+([^a]+)\s+a\s+([^.]+)\./);
        if (montoMatch) {
          const monto = montoMatch[1].replace(/\./g, '').replace(/,/g, '');
          const desde = montoMatch[2].trim();
          const hacia = montoMatch[3].trim();
          const motivoMatch = desc.match(/Motivo:\s+([^.]+)\./);
          const motivo = motivoMatch ? motivoMatch[1].trim() : '';
          gastos.push({
            tipo: 'Transferencia',
            metodo: `${desde} --> ${hacia}`,
            monto: Number(monto),
            motivo,
            momento: m.momento
          });
        }
      }
    });
    
    return gastos;
  }

  static async getCajasData(date) {
    const docId = this.formatDateToDocId(date);
    const ref = doc(db, 'CAJAS', docId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  static async getTotalesMetodos(startDate, endDate, isSingleDay = false) {
    const totales = { 
      EFECTIVO: { contado: 0, esperado: 0 }, 
      NEQUI: { contado: 0, esperado: 0 }, 
      BANCOLOMBIA: { contado: 0, esperado: 0 } 
    };

    // Si es un reporte de un día, buscar en movimientos el cierre de caja
    if (isSingleDay) {
      const movimientos = await this.getMovimientos(startDate, endDate);
      const cierreCaja = movimientos.find(m => 
        m.descripcion && m.descripcion.includes('cerró la caja')
      );
      if (cierreCaja) {
        return this.parseCierreCaja(cierreCaja.descripcion);
      }
    }

    // Fallback: usar datos de CAJAS (para rangos multiday o si no hay cierre)
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      // Buscar cierre de caja para este día
      const movimientos = await this.getMovimientos(current, current);
      const cierreCaja = movimientos.find(m => 
        m.descripcion && m.descripcion.includes('cerró la caja')
      );

      if (cierreCaja) {
        // Si existe cierre, usar sus valores
        const cierreData = this.parseCierreCaja(cierreCaja.descripcion);
        totales.EFECTIVO.esperado += cierreData.EFECTIVO.esperado;
        totales.EFECTIVO.contado += cierreData.EFECTIVO.contado;
        totales.NEQUI.esperado += cierreData.NEQUI.esperado;
        totales.NEQUI.contado += cierreData.NEQUI.contado;
        totales.BANCOLOMBIA.esperado += cierreData.BANCOLOMBIA.esperado;
        totales.BANCOLOMBIA.contado += cierreData.BANCOLOMBIA.contado;
      } else {
        // Fallback: apertura + ventas del día
        const cajaData = await this.getCajasData(current);
        
        if (cajaData?.APERTURA) {
          totales.EFECTIVO.esperado += Number(cajaData.APERTURA.EFECTIVO || 0);
          totales.NEQUI.esperado += Number(cajaData.APERTURA.NEQUI || 0);
          totales.BANCOLOMBIA.esperado += Number(cajaData.APERTURA.BANCOLOMBIA || 0);
        }

        // Sumar ventas del dia
        const facturasDelDia = await this.getFacturas(current, current);
        facturasDelDia.forEach(f => {
          if (f?.estado !== 'CANCELADA') {
            // Si tiene metodo_pago en array
            if (Array.isArray(f.metodo_pago)) {
              f.metodo_pago.forEach(m => {
                const metodo = m.metodo || 'EFECTIVO';
                if (metodo === 'EFECTIVO') totales.EFECTIVO.esperado += Number(m.monto || 0);
                if (metodo === 'NEQUI') totales.NEQUI.esperado += Number(m.monto || 0);
                if (metodo === 'BANCOLOMBIA') totales.BANCOLOMBIA.esperado += Number(m.monto || 0);
              });
            } else if (typeof f.metodo_pago === 'object' && f.metodo_pago?.metodo) {
              const metodo = f.metodo_pago.metodo || 'EFECTIVO';
              if (metodo === 'EFECTIVO') totales.EFECTIVO.esperado += Number(f.metodo_pago.monto || 0);
              if (metodo === 'NEQUI') totales.NEQUI.esperado += Number(f.metodo_pago.monto || 0);
              if (metodo === 'BANCOLOMBIA') totales.BANCOLOMBIA.esperado += Number(f.metodo_pago.monto || 0);
            } else {
              // Si es string, lo consideramos EFECTIVO
              totales.EFECTIVO.esperado += Number(f.total || 0);
            }
          }
        });
      }

      current.setDate(current.getDate() + 1);
    }
    return totales;
  }

  static parseCierreCaja(descripcion) {
    // Extrae los datos del cierre de caja de la descripción
    const resultado = {
      EFECTIVO: { esperado: 0, contado: 0 },
      NEQUI: { esperado: 0, contado: 0 },
      BANCOLOMBIA: { esperado: 0, contado: 0 }
    };

    // Buscar "Total encontrado: $X"
    const totalMatch = descripcion.match(/Total encontrado:\s+\$([0-9.,]+)/);
    if (totalMatch) {
      const total = totalMatch[1].replace(/\./g, '').replace(/,/g, '');
      // Este es el total contado general
    }

    // Buscar cada método: "METODO: esperado $X, encontrado $Y"
    const metodos = ['EFECTIVO', 'NEQUI', 'BANCOLOMBIA'];
    metodos.forEach(metodo => {
      const regex = new RegExp(
        `${metodo}:\\s+esperado\\s+\\$([0-9.,]+),?\\s+encontrado\\s+\\$([0-9.,]+)`,
        'i'
      );
      const match = descripcion.match(regex);
      if (match) {
        const esperado = match[1].replace(/\./g, '').replace(/,/g, '');
        const contado = match[2].replace(/\./g, '').replace(/,/g, '');
        resultado[metodo] = {
          esperado: Number(esperado),
          contado: Number(contado)
        };
      }
    });

    return resultado;
  }

  static async getDenominaciones(date) {
    const cajaData = await this.getCajasData(date);
    if (cajaData?.CIERRE?.denominaciones) {
      return cajaData.CIERRE.denominaciones;
    }
    return {};
  }

  /* ================= PDF ================= */

  static async generateReport(range) {

    const { startDate, endDate } = this.parseRange(range);
    const rangeLabel = this.getRangeLabelFromDates(startDate, endDate);
    const isSingleDay = this.formatDate(startDate) === this.formatDate(endDate);

    const movimientos = await this.getMovimientos(startDate, endDate);
    const facturas = await this.getFacturas(startDate, endDate);
    // Filtrar solo facturas vendidas (no canceladas)
    const facturasVendidas = facturas.filter(f => f.estado !== 'CANCELADA');

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    let y = 20;

    /* ===== HEADER ===== */
    pdf.setFontSize(16);
    pdf.text('Informe de Cierre de Caja', pageWidth / 2, y, { align: 'center' });
    y += 7;

    pdf.setFontSize(10);
    pdf.text(rangeLabel, pageWidth / 2, y, { align: 'center' });
    y += 6;

    pdf.setFontSize(9);
    pdf.text(
      `Período: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 12;

    /* ===== PRODUCTOS VENDIDOS (POR FACTURA) ===== */
    if (facturasVendidas.length) {
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.text('Productos Vendidos', 15, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      pdf.text(`Total facturas vendidas: ${facturasVendidas.length}`, 15, y);
      y += 8;

      // Para cada factura, imprimir su tabla de productos y total de factura
      facturasVendidas.forEach(f => {
        if (y > 260) {
          pdf.addPage();
          y = 20;
        }

        const { fecha, hora } = this.splitISO(f.fecha);
        pdf.setFont(undefined, 'bold');
        pdf.setFontSize(10);
        pdf.text(`Factura #${f.facturaId} - ${fecha} ${hora}`, 15, y);
        pdf.setFont(undefined, 'normal');
        y += 6;

        // Encabezado de tabla
        pdf.setFillColor(230);
        pdf.rect(15, y - 5, 180, 7, 'F');

        const cols = [15, 85, 120, 155];
        pdf.setFontSize(9);
        pdf.text('Producto', cols[0], y);
        pdf.text('Cantidad', cols[1], y);
        pdf.text('Precio Unit.', cols[2], y);
        pdf.text('Subtotal', cols[3], y);
        y += 3;

        pdf.setFont(undefined, 'normal');
        const rowHeight = 8;

        const productosFactura = Array.isArray(f.productos) ? f.productos : [];

        // Filas de productos
        productosFactura.forEach(p => {
          const nameLines = pdf.splitTextToSize(p.nombre || '-', cols[1] - cols[0] - 2);
          const rowHeightAdjusted = Math.max(rowHeight, nameLines.length * 4 + 3);

          if (y + rowHeightAdjusted > 280) {
            pdf.addPage();
            y = 20;
          }

          const textY = y + 5;
          nameLines.forEach((line, i) => {
            pdf.text(line, cols[0] + 1, textY + i * 4);
          });

          pdf.text(String(p.cantidad || 0), cols[1], textY);
          pdf.text(this.formatMoney(p.precio_unitario || 0), cols[2], textY);
          pdf.text(this.formatMoney(p.subtotal || (Number(p.precio_unitario || 0) * Number(p.cantidad || 0))), cols[3], textY);

          pdf.setDrawColor(200);
          pdf.line(15, y + rowHeightAdjusted, 195, y + rowHeightAdjusted);

          y += rowHeightAdjusted;
        });

        // Total de la factura
        pdf.setFillColor(220);
        pdf.rect(15, y, 180, 7, 'F');
        pdf.setFont(undefined, 'bold');
        pdf.setFontSize(9);
        pdf.text('TOTAL FACTURA:', 15 + 2, y + 5);
        pdf.text(this.formatMoney(f.total || 0), cols[3], y + 5);
        pdf.setDrawColor(200);
        pdf.rect(15, y, 180, 7);
        y += 10;

        y += 4;
      });

      // Venta total del día
      if (y > 260) {
        pdf.addPage();
        y = 20;
      }

      y += 8;

      const ventaTotalDelDia = facturasVendidas.reduce((sum, f) => sum + (Number(f.total) || 0), 0);

      pdf.setFillColor(200, 220, 255);
      pdf.rect(15, y, 180, 10, 'F');
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(0);
      pdf.text('VENTA TOTAL DEL DÍA:', 15 + 2, y + 7);
      pdf.text(this.formatMoney(ventaTotalDelDia), 155, y + 7);
      pdf.setDrawColor(0);
      pdf.rect(15, y, 180, 10);
      y += 15;
    }

    /* ===== GASTOS (Ingresos, Retiros, Transferencias) ===== */
    const gastos = this.parseMovimientos(movimientos);
    const retiros = gastos.filter(g => g.tipo === 'Retiro');
    if (retiros.length) {
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.text('Retiros', 15, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFillColor(230);
      pdf.rect(15, y - 5, 180, 7, 'F');

      const colsGastos = [15, 35, 60, 90, 125];
      pdf.text('Tipo', colsGastos[0], y);
      pdf.text('Fecha', colsGastos[1], y);
      pdf.text('Hora', colsGastos[2], y);
      pdf.text('Monto', colsGastos[3], y);
      pdf.text('Método', colsGastos[4], y);
      y += 3;

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(8);

      const rowHeightGastos = 10;

      retiros.forEach(g => {
        if (y + rowHeightGastos > 280) {
          pdf.addPage();
          y = 20;
        }

        const { fecha, hora } = this.splitISO(g.momento);
        
        pdf.setFillColor(255, 228, 228);

        pdf.rect(15, y, 180, rowHeightGastos, 'F');
        pdf.setDrawColor(200);
        pdf.rect(15, y, 180, rowHeightGastos);

        const textY = y + 4;

        pdf.setTextColor(40);
        pdf.text(g.tipo, colsGastos[0], textY);
        pdf.text(fecha, colsGastos[1], textY);
        pdf.text(hora, colsGastos[2], textY);
        pdf.text(this.formatMoney(g.monto), colsGastos[3], textY);
        
        const metodoWidth = 195 - colsGastos[4];
        const metodoLines = pdf.splitTextToSize(g.metodo || '-', metodoWidth - 5);
        metodoLines.forEach((line, i) => {
          pdf.text(line, colsGastos[4] + 1, textY + i * 3);
        });

        y += rowHeightGastos;
      });

      // Calcular total de retiros
      const totalRetiros = gastos
        .filter(g => g.tipo === 'Retiro')
        .reduce((sum, g) => sum + g.monto, 0);

      // Fila de total
      pdf.setFillColor(220);
      pdf.rect(15, y, 180, 8, 'F');
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(9);
      pdf.text('GASTO TOTAL:', 15 + 2, y + 5);
      pdf.text(this.formatMoney(totalRetiros), colsGastos[3], y + 5);
      pdf.setDrawColor(200);
      pdf.rect(15, y, 180, 8);

      y += 10;
    }
    /* ===== TOTALES POR MÉTODO ===== */
    const totalesMetodos = await this.getTotalesMetodos(startDate, endDate, isSingleDay);

    if (Object.values(totalesMetodos).some(v => v.contado > 0 || v.esperado > 0)) {
      if (y > 230) {
        pdf.addPage();
        y = 20;
      }

      y += 3;

      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(40);
      pdf.text('Totales por Método de Pago', 15, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFillColor(230);
      pdf.rect(15, y - 5, 180, 7, 'F');

      let colsTotales;
      if (isSingleDay) {
        colsTotales = [15, 75, 130, 165];
        pdf.text('Método', colsTotales[0], y);
        pdf.text('Total Esperado', colsTotales[1], y);
        pdf.text('Total Contado', colsTotales[2], y);
        pdf.text('Diferencia', colsTotales[3], y);
      } else {
        colsTotales = [15, 75];
        pdf.text('Método', colsTotales[0], y);
        pdf.text('Total Esperado', colsTotales[1], y);
      }
      y += 3;

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);

      ['EFECTIVO', 'NEQUI', 'BANCOLOMBIA'].forEach(m => {
        if (y > 275) {
          pdf.addPage();
          y = 20;
        }

        pdf.setFillColor(245);
        pdf.rect(15, y, 180, 7, 'F');
        pdf.setDrawColor(200);
        pdf.rect(15, y, 180, 7);

        const contado = totalesMetodos[m]?.contado || 0;
        const esperado = totalesMetodos[m]?.esperado || 0;
        const diferencia = esperado - contado;

        pdf.text(m, colsTotales[0] + 2, y + 5);
        pdf.text(this.formatMoney(esperado), colsTotales[1] + 2, y + 5);
        
        if (isSingleDay) {
          pdf.text(this.formatMoney(contado), colsTotales[2] + 2, y + 5);
          pdf.text(this.formatMoney(diferencia), colsTotales[3] + 2, y + 5);
        }

        y += 7;
      });

      y += 5;
    }

    /* ===== DENOMINACIONES ===== */
    /* ===== DENOMINACIONES (SOLO HOY) ===== */
if (isSingleDay) {
  const denominaciones = await this.getDenominaciones(endDate);

  if (Object.keys(denominaciones).length > 0) {
    if (y > 240) {
      pdf.addPage();
      y = 20;
    }

    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(40);
    pdf.text('Denominaciones de Efectivo', 15, y);
    y += 7;

    pdf.setFontSize(9);
    pdf.setFillColor(230);
    pdf.rect(15, y - 5, 180, 7, 'F');

    const colsDenom = [15, 85, 135];
    pdf.text('Denominación', colsDenom[0], y);
    pdf.text('Cantidad', colsDenom[1], y);
    pdf.text('Subtotal', colsDenom[2], y);
    y += 3;

    pdf.setFont(undefined, 'normal');

    Object.entries(denominaciones).forEach(([denom, data]) => {
      if (y > 275) {
        pdf.addPage();
        y = 20;
      }

      pdf.setFillColor(245);
      pdf.rect(15, y, 180, 7, 'F');
      pdf.setDrawColor(200);
      pdf.rect(15, y, 180, 7);

      pdf.text(this.formatMoney(Number(denom)), colsDenom[0] + 2, y + 5);
      pdf.text(String(data.count || 0), colsDenom[1] + 2, y + 5);
      pdf.text(this.formatMoney(data.total || 0), colsDenom[2] + 2, y + 5);

      y += 7;
    });

    y += 5;
  }
}

    if (movimientos.length) {
      if (y > 240) {
        pdf.addPage();
        y = 20;
      }

      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(40);
      pdf.text('Movimientos', 15, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFillColor(230);
      pdf.rect(15, y - 5, 180, 7, 'F');

      const cols = [15, 55, 90];
      pdf.text('Fecha', cols[0], y);
      pdf.text('Hora', cols[1], y);
      pdf.text('Descripción', cols[2], y);
      y += 2;

      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(40);

      const rowHeightMov = 8;

      movimientos.forEach(m => {
        if (y + rowHeightMov > 280) {
          pdf.addPage();
          y = 20;
        }

        const { fecha, hora } = this.splitISO(m.momento);
        const textY = y + 5;

        pdf.text(fecha, cols[0], textY);
        pdf.text(hora, cols[1], textY);

        const descLines = pdf.splitTextToSize(m.descripcion, 95);
        descLines.forEach((line, i) => {
          pdf.text(line, cols[2], textY + i * 4);
        });

        const totalHeight = Math.max(rowHeightMov, descLines.length * 4 + 3);

        pdf.setDrawColor(210);
        pdf.line(15, y + totalHeight, 195, y + totalHeight);

        y += totalHeight;
      });

    }

    const fileName = `Informe_Cierre_${rangeLabel} (${this.formatDate(new Date())}).pdf`;
    pdf.save(fileName);
  }
}

export default ReportePDF;
