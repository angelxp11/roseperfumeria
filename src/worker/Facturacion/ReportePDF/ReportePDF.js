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
    if (typeof range === 'number') {
      return this.getDateRange(range);
    }
    if (range && range.startDate && range.endDate) {
      const s = new Date(range.startDate);
      const e = new Date(range.endDate);
      s.setHours(0,0,0,0);
      e.setHours(23,59,59,999);
      return { startDate: s, endDate: e };
    }
    // por defecto: hoy
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
    const data = [];
    const current = new Date(startDate);
    current.setHours(0,0,0,0);

    while (current <= endDate) {
      const docId = this.formatDateToDocId(current);
      const ref = doc(db, 'FACTURAS', docId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        Object.values(snap.data()).forEach(f => {
          f?.productos?.forEach(p => {
            data.push(p);
          });
        });
      }
      current.setDate(current.getDate() + 1);
    }
    return data;
  }

  static agruparProductos(productos) {
    const map = {};
    productos.forEach(p => {
      if (!map[p.id]) map[p.id] = { ...p };
      else map[p.id].cantidad += p.cantidad;
    });
    return Object.values(map);
  }

  /* ================= PDF ================= */

  static async generateReport(range) {

    const { startDate, endDate } = this.parseRange(range);
    const rangeLabel = (typeof range === 'number')
      ? this.getRangeLabel(range)
      : this.getRangeLabelFromDates(startDate, endDate);

    const movimientos = await this.getMovimientos(startDate, endDate);
    let productos = await this.getFacturas(startDate, endDate);
    productos = this.agruparProductos(productos);

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

    /* ===== PRODUCTOS ===== */
    if (productos.length) {
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.text('Productos Vendidos', 15, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFillColor(230);
      pdf.rect(15, y - 5, 180, 7, 'F');

      const cols = [15, 85, 120, 155];
      pdf.text('Producto', cols[0], y);
      pdf.text('Precio', cols[1], y);
      pdf.text('Cant.', cols[2], y);
      pdf.text('Total', cols[3], y);
      y += 3;

      pdf.setFont(undefined, 'normal');

      const rowHeight = 8;

      productos.forEach(p => {
        if (y + rowHeight > 280) {
          pdf.addPage();
          y = 20;
        }

        const total = p.precio_unitario * p.cantidad;

        // Texto centrado verticalmente en la fila
        const textY = y + 5;

        pdf.text(p.nombre, cols[0], textY);
        pdf.text(this.formatMoney(p.precio_unitario), cols[1], textY);
        pdf.text(String(p.cantidad), cols[2], textY);
        pdf.text(this.formatMoney(total), cols[3], textY);

        // Línea divisora centrada
        pdf.setDrawColor(200);
        pdf.line(15, y + rowHeight, 195, y + rowHeight);

        y += rowHeight;
      });



      y += 10;
    }

    /* ===== MOVIMIENTOS ===== */
    if (movimientos.length) {
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
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
          // corregido: texto (string, x, y)
          pdf.text(line, cols[2], textY + i * 4);
        });

        const totalHeight = Math.max(rowHeightMov, descLines.length * 4 + 3);

        pdf.setDrawColor(210);
        pdf.line(15, y + totalHeight, 195, y + totalHeight);

        y += totalHeight;
      });

    }

    // antes: pdf.save(`Informe_Cierre_${rangeLabel}.pdf`);
    const fileName = `Informe_Cierre_${rangeLabel} (${this.formatDate(new Date())}).pdf`;
    pdf.save(fileName);
  }
}

export default ReportePDF;
