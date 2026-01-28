import jsPDF from 'jspdf';
import { db } from '../../../server/firebase';
import { doc, getDoc } from 'firebase/firestore';

class ReportePDFBankStatement {

  static formatDate(date) {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  static formatMoney(value) {
    return `$ ${Number(value || 0).toLocaleString('es-CO')}`;
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

  static async getMovimientosPago(metodo, startDate, endDate) {
    const data = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      const ref = doc(db, 'MOVIMIENTOSPAYMENT', this.formatDateToDocId(current));
      const snap = await getDoc(ref);

      if (snap.exists()) {
        Object.values(snap.data()).forEach(m => {
          if (metodo === null || m?.metodo === metodo || m?.desde === metodo || m?.hacia === metodo) {
            data.push(m);
          }
        });
      }
      current.setDate(current.getDate() + 1);
    }

    return data.sort((a, b) => new Date(b.momento) - new Date(a.momento));
  }

  static async generateBankStatement(metodo, startDate, endDate) {

  // 🔒 FECHAS CORRECTAS - Normalizar a medianoche en zona horaria local
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Asegurar que end sea después de start (incluye todo el día final)
  if (end < start) {
    end.setTime(start.getTime());
  }

  const movimientos = await this.getMovimientosPago(metodo, start, end);

  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = 20;

  /* ===== HEADER ===== */
  pdf.setFontSize(18);
  pdf.setFont(undefined, 'bold');
  pdf.text('Estado de Cuenta', pageWidth / 2, y, { align: 'center' });

  y += 8;
  pdf.setFontSize(11);
  pdf.text(`Método: ${metodo || 'Todos'}`, pageWidth / 2, y, { align: 'center' });

  y += 6;
  pdf.setFontSize(9);
  pdf.setFont(undefined, 'normal');
  pdf.text(
    `Período: ${this.formatDate(start)} - ${this.formatDate(end)}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  y += 14;

  if (!movimientos.length) {
    pdf.text('No hay movimientos en este período', 15, y);
    pdf.save(
      `Estado_Cuenta_${metodo || 'General'}_${this.formatDate(start)}_a_${this.formatDate(end)}.pdf`
    );
    return;
  }

  const cols = [15, 32, 45, 60, 78, 98, 118];
  const tableWidth = 180;

  const lineHeight = 4;
  const paddingTop = 4;
  const paddingBottom = 3;
  const minRowHeight = 12;

  /* ===== HEADER TABLA ===== */
  pdf.setFillColor(45, 45, 45);
  pdf.setTextColor(255);
  pdf.rect(15, y - 7, tableWidth, 9, 'F');

  pdf.setFontSize(7);
  pdf.setFont(undefined, 'bold');

  ['Fecha', 'Hora', 'Tipo', 'Monto', 'Saldo Ant.', 'Saldo Post.', 'Descripción']
    .forEach((t, i) => {
      pdf.text(t, cols[i] + 1, y);
    });

  y += 5;
  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(6.8);

  movimientos.forEach((m, idx) => {

    if (y > 270) {
      pdf.addPage();
      y = 20;
    }

    const { fecha, hora } = this.splitISO(m.momento);
    const tipo = m.tipo || 'N/A';

    let saldoAnterior = '';
    let saldoPosterior = '';

    if (tipo === 'TRANSFERENCIA') {
      if (m.desde === metodo || metodo === null) {
        saldoAnterior = this.formatMoney(m.saldoAnteriorDesde);
        saldoPosterior = this.formatMoney(m.saldoPosteriorDesde);
      } else {
        saldoAnterior = this.formatMoney(m.saldoAnteriorHacia);
        saldoPosterior = this.formatMoney(m.saldoPosteriorHacia);
      }
    } else {
      saldoAnterior = this.formatMoney(m.saldoAnterior);
      saldoPosterior = this.formatMoney(m.saldoPosterior);
    }

    // 🎨 COLORES
    if (tipo === 'INGRESO') pdf.setFillColor(232, 245, 236);
    else if (tipo === 'RETIRO') pdf.setFillColor(255, 228, 228);
    else if (tipo === 'TRANSFERENCIA') pdf.setFillColor(232, 236, 250);
    else pdf.setFillColor(idx % 2 ? 245 : 255);

    const descMaxWidth = pageWidth - cols[6] - 18;
    const descLines = pdf.splitTextToSize(m.descripcion || 'N/A', descMaxWidth);

    const textHeight = descLines.length * lineHeight;
    const rowHeight = Math.max(
      minRowHeight,
      textHeight + paddingTop + paddingBottom
    );

    // 🔲 FILA CON BORDE COMPLETO
    pdf.setDrawColor(200);
    pdf.rect(15, y, tableWidth, rowHeight, 'FD');

    // Líneas verticales
    pdf.setDrawColor(220);
    cols.slice(1).forEach(x => {
      pdf.line(x, y, x, y + rowHeight);
    });

    pdf.setTextColor(40);

    const textY = y + paddingTop;

    pdf.text(fecha, cols[0] + 1, textY, { maxWidth: cols[1] - cols[0] - 2 });
    pdf.text(hora, cols[1] + 1, textY, { maxWidth: cols[2] - cols[1] - 2 });
    pdf.text(tipo, cols[2] + 1, textY, { maxWidth: cols[3] - cols[2] - 2 });
    pdf.text(this.formatMoney(m.monto), cols[3] + 1, textY, { maxWidth: cols[4] - cols[3] - 2 });
    pdf.text(saldoAnterior, cols[4] + 1, textY, { maxWidth: cols[5] - cols[4] - 2 });
    pdf.text(saldoPosterior, cols[5] + 1, textY, { maxWidth: cols[6] - cols[5] - 2 });

    pdf.setFontSize(6);
    descLines.forEach((line, i) => {
      pdf.text(
        line,
        cols[6] + 2,
        textY + i * lineHeight,
        { maxWidth: descMaxWidth }
      );
    });
    pdf.setFontSize(6.8);

    y += rowHeight;
  });

  pdf.save(
    `Estado_Cuenta_${metodo || 'General'}_${this.formatDate(start)}_a_${this.formatDate(end)}.pdf`
  );
}


}

export default ReportePDFBankStatement;
