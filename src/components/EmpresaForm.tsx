import { CampoDireccion } from "@/components/CampoDireccion";
import type { Empresa } from "@/lib/api";
import { Field, Input, Textarea } from "@/components/ui/input";
import { nifValido } from "@/lib/utils";

export const EMPRESA_VACIA: Empresa = {
  razon_social: "", nif: "", direccion: "", cp: "", ciudad: "", provincia: "", telefono: "", email: "", iban: "", pie_factura: "",
};

export function EmpresaForm({ valor, onChange, disabled }: { valor: Empresa; onChange: (e: Empresa) => void; disabled?: boolean }) {
  const set = (k: keyof Empresa) => (e: { target: { value: string } }) => onChange({ ...valor, [k]: e.target.value });
  const nifMal = valor.nif.length >= 9 && !nifValido(valor.nif);
  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-6">
      <Field label="Razón social o nombre completo *" className="sm:col-span-4">
        <Input value={valor.razon_social} onChange={set("razon_social")} required />
      </Field>
      <Field label="NIF *" className="sm:col-span-2" error={nifMal ? "NIF no válido" : null}>
        <Input value={valor.nif} onChange={set("nif")} required className="uppercase" />
      </Field>
      <Field label="Dirección" className="sm:col-span-6"><CampoDireccion value={valor.direccion} onChange={(v) => onChange({ ...valor, direccion: v })} onElegir={(r) => onChange({ ...valor, direccion: r.calle || valor.direccion, cp: r.cp || valor.cp, ciudad: r.ciudad || valor.ciudad, provincia: r.provincia || valor.provincia })} /></Field>
      <Field label="C.P." className="sm:col-span-1"><Input value={valor.cp} onChange={set("cp")} inputMode="numeric" /></Field>
      <Field label="Ciudad" className="sm:col-span-3"><Input value={valor.ciudad} onChange={set("ciudad")} /></Field>
      <Field label="Provincia" className="sm:col-span-2"><Input value={valor.provincia} onChange={set("provincia")} /></Field>
      <Field label="Teléfono" className="sm:col-span-2"><Input value={valor.telefono} onChange={set("telefono")} type="tel" /></Field>
      <Field label="Email" className="sm:col-span-4"><Input value={valor.email} onChange={set("email")} type="email" /></Field>
      <Field label="IBAN (aparece en facturas por transferencia)" className="sm:col-span-6">
        <Input value={valor.iban} onChange={set("iban")} className="uppercase tnum" placeholder="ES00 0000 0000 0000 0000 0000" />
      </Field>
      <Field label="Texto al pie de las facturas" hint="Por ejemplo, el aviso de protección de datos." className="sm:col-span-6">
        <Textarea value={valor.pie_factura} onChange={set("pie_factura")} rows={3} />
      </Field>
    </fieldset>
  );
}
