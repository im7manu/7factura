import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/** Firma del receptor dibujada con el dedo o el ratón, más su nombre y DNI. */
export function FirmaDialog({ open, onOpenChange, onFirmar, enviando }: {
  open: boolean; onOpenChange: (v: boolean) => void; enviando?: boolean;
  onFirmar: (d: { nombre: string; dni: string; imagen: string | null }) => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacio, setVacio] = useState(true);
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");

  useEffect(() => {
    if (!open) return;
    setNombre(""); setDni(""); setVacio(true);
    // El lienzo se monta dentro del diálogo: esperamos al siguiente fotograma para medirlo
    const id = requestAnimationFrame(() => {
      const c = lienzo.current;
      if (!c) return;
      const escala = window.devicePixelRatio || 1;
      c.width = c.clientWidth * escala;
      c.height = c.clientHeight * escala;
      const ctx = c.getContext("2d")!;
      ctx.scale(escala, escala);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = punto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = punto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setVacio(false);
  };
  const borrar = () => {
    const c = lienzo.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setVacio(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Firma del receptor" description="Quien recibe la mercancía firma aquí con el dedo o el ratón."
      footer={<>
        <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant="primary" disabled={!nombre.trim() || enviando}
          onClick={() => onFirmar({ nombre, dni, imagen: vacio ? null : lienzo.current!.toDataURL("image/png") })}>Guardar firma</Button>
      </>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de quien recibe *"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></Field>
          <Field label="DNI"><Input value={dni} onChange={(e) => setDni(e.target.value)} className="uppercase" /></Field>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="field-label mb-0">Firma</span>
            <Button size="sm" variant="subtle" onClick={borrar}><Eraser size={14} /> Borrar</Button>
          </div>
          <canvas ref={lienzo} className="h-44 w-full touch-none rounded border border-stroke bg-white"
            onPointerDown={empezar} onPointerMove={mover} onPointerUp={() => { dibujando.current = false; }} onPointerLeave={() => { dibujando.current = false; }} />
          <p className="mt-1 text-xs text-muted">Si no firma en pantalla, puedes subir una foto del albarán firmado en papel como adjunto.</p>
        </div>
      </div>
    </Dialog>
  );
}
