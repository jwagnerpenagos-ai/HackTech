// Generación de reportes en el panel administrativo.
// Todo ocurre en el navegador (sin red). `xlsx` y `jspdf` se cargan con
// import() dinámico para no engordar el chunk inicial del sitio.

export type Fila = Record<string, string | number>;

export type HojaExcel = {
  nombre: string;
  filas: Fila[];
};

const HOY = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

export function nombreArchivo(base: string) {
  return `fisio-li_${base}_${HOY()}`;
}

function fechaLegible() {
  return new Date().toLocaleString("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

// Paleta de marca (RGB) para el PDF.
const BRAND_900: [number, number, number] = [11, 66, 114];
const BRAND_700: [number, number, number] = [1, 93, 167];
const BRAND_200: [number, number, number] = [186, 224, 253];
const BRAND_50: [number, number, number] = [240, 247, 255];
const GRIS: [number, number, number] = [110, 110, 110];

// Logo de la clienta para la cabecera y la marca de agua. Se descarga
// una vez, se reescala en un canvas (el PNG original pesa ~600 KB) y se
// cachea como data URL para no rehacerlo en cada exportación.
let logoPromesa: Promise<{ dataUrl: string; ratio: number } | null> | undefined;

function cargarLogo() {
  if (!logoPromesa) {
    logoPromesa = new Promise((resolve) => {
      if (typeof Image === "undefined") return resolve(null);
      const img = new Image();
      img.onload = () => {
        try {
          const maxW = 680;
          const escala = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
          const w = Math.max(1, Math.round(img.naturalWidth * escala));
          const h = Math.max(1, Math.round(img.naturalHeight * escala));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, w, h);
          resolve({
            dataUrl: canvas.toDataURL("image/png"),
            ratio: img.naturalWidth / img.naturalHeight,
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = "/images/Logo.png";
    });
  }
  return logoPromesa;
}

/**
 * Descarga un .xlsx con una o varias hojas. Las columnas se deducen de
 * las claves de la primera fila de cada hoja.
 */
export async function exportarExcel(base: string, hojas: HojaExcel[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  for (const hoja of hojas) {
    const ws = XLSX.utils.json_to_sheet(hoja.filas);
    // Ancho de columna aproximado según el contenido más largo.
    const claves = hoja.filas[0] ? Object.keys(hoja.filas[0]) : [];
    ws["!cols"] = claves.map((k) => {
      const largo = Math.max(
        k.length,
        ...hoja.filas.map((f) => String(f[k] ?? "").length)
      );
      return { wch: Math.min(48, Math.max(10, largo + 2)) };
    });
    const nombreHoja = hoja.nombre.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  }

  XLSX.writeFile(wb, `${nombreArchivo(base)}.xlsx`, { compression: true });
}

type OpcionesPDF = {
  base: string;
  titulo: string;
  subtitulo?: string;
  columnas: string[];
  filas: (string | number)[][];
  /** líneas extra bajo el título (filtros aplicados, totales, etc.) */
  meta?: string[];
};

/**
 * Descarga un PDF con papel membretado (logo + banda de marca), marca de
 * agua en cada página, tabla (jspdf-autotable) y pie con numeración.
 */
export async function exportarPDF({
  base,
  titulo,
  subtitulo,
  columnas,
  filas,
  meta = [],
}: OpcionesPDF) {
  const [{ jsPDF }, autoTableMod, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    cargarLogo(),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40; // margen lateral
  const HEADER_H = 74;
  const fecha = fechaLegible();
  const totalExp = "{tot_pag}";
  const anyDoc = doc as unknown as {
    setGState: (g: unknown) => void;
    GState: new (o: { opacity: number }) => unknown;
  };

  // Alto del bloque de título (sólo va en la página 1).
  const tituloBloqueAlto = 30 + (subtitulo ? 14 : 0) + meta.length * 12;

  const marcaDeAgua = () => {
    doc.saveGraphicsState();
    anyDoc.setGState(new anyDoc.GState({ opacity: 0.06 }));
    if (logo) {
      const w = W * 0.52;
      const h = w / logo.ratio;
      doc.addImage(
        logo.dataUrl,
        "PNG",
        (W - w) / 2,
        (H - h) / 2,
        w,
        h,
        "lfl-logo",
        "FAST"
      );
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(60);
      doc.setTextColor(...BRAND_900);
      doc.text("La Fisioterapeuta Li", W / 2, H / 2, {
        align: "center",
        angle: 22,
      });
    }
    doc.restoreGraphicsState();
  };

  const cabecera = (pagina: number) => {
    doc.setFillColor(...BRAND_50);
    doc.rect(0, 0, W, HEADER_H, "F");
    doc.setDrawColor(...BRAND_200);
    doc.setLineWidth(0.8);
    doc.line(0, HEADER_H, W, HEADER_H);

    let textoX = M;
    if (logo) {
      const h = 42;
      const w = h * logo.ratio;
      doc.addImage(
        logo.dataUrl,
        "PNG",
        M,
        (HEADER_H - h) / 2,
        w,
        h,
        "lfl-logo",
        "FAST"
      );
      textoX = M + w + 14;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_900);
    doc.text("La Fisioterapeuta Li", textoX, 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(
      "Fisioterapia & Neurorrehabilitación · Boyacá, Colombia",
      textoX,
      45
    );

    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text("REPORTE", W - M, 26, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(fecha, W - M, 40, { align: "right" });

    if (pagina === 1) {
      let y = HEADER_H + 24;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20, 20, 20);
      doc.text(titulo, M, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GRIS);
      if (subtitulo) {
        doc.text(subtitulo, M, y);
        y += 13;
      }
      for (const l of meta) {
        doc.text(l, M, y);
        y += 12;
      }
    }
  };

  const pie = (pagina: number) => {
    doc.setDrawColor(...BRAND_200);
    doc.setLineWidth(0.5);
    doc.line(M, H - 30, W - M, H - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text("La Fisioterapeuta Li", M, H - 18);
    const txt =
      typeof doc.putTotalPages === "function"
        ? `Página ${pagina} de ${totalExp}`
        : `Página ${pagina}`;
    doc.text(txt, W - M, H - 18, { align: "right" });
  };

  autoTable(doc, {
    head: [columnas],
    body: filas.map((f) => f.map((c) => String(c ?? ""))),
    startY: HEADER_H + tituloBloqueAlto,
    margin: { top: HEADER_H + 14, bottom: 44, left: M, right: M },
    theme: "striped",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 6,
      overflow: "linebreak",
      textColor: [45, 45, 45],
      lineColor: [223, 236, 250],
      lineWidth: 0.25,
      valign: "middle",
    },
    headStyles: {
      fillColor: BRAND_700,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 7,
    },
    alternateRowStyles: { fillColor: BRAND_50 },
    willDrawPage: (data) => {
      marcaDeAgua();
      cabecera(data.pageNumber);
    },
    didDrawPage: (data) => {
      pie(data.pageNumber);
    },
  });

  if (typeof doc.putTotalPages === "function") doc.putTotalPages(totalExp);
  doc.save(`${nombreArchivo(base)}.pdf`);
}
