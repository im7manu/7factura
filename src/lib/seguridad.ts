// Passkeys (WebAuthn) en el navegador y utilidades de las pantallas de seguridad.
import { api } from "@/lib/api";

const aBuf = (s: string) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u.buffer;
};
const deBuf = (buf: ArrayBuffer) => {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const navegadorAdmitePasskeys = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);

function mensajeError(e: unknown) {
  const n = (e as Error)?.name;
  if (n === "NotAllowedError") return "Se ha cancelado o ha caducado la solicitud de passkey.";
  if (n === "InvalidStateError") return "Este dispositivo ya tiene una passkey de tu cuenta.";
  if (n === "SecurityError") return "Las passkeys solo funcionan desde la dirección oficial de la aplicación (HTTPS).";
  return (e as Error)?.message || "No se pudo usar la passkey.";
}

export interface Passkey { id: string; nombre: string; creada: string; ultimo_uso: string | null; sincronizada: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function crearPasskey(): Promise<Passkey[]> {
  const o = await api.post<any>("/passkeys/registro/opciones");
  let c: PublicKeyCredential;
  try {
    c = (await navigator.credentials.create({ publicKey: {
      ...o, challenge: aBuf(o.challenge), user: { ...o.user, id: aBuf(o.user.id) },
      excludeCredentials: (o.excludeCredentials || []).map((x: any) => ({ ...x, id: aBuf(x.id) })),
    } })) as PublicKeyCredential;
  } catch (e) { throw new Error(mensajeError(e)); }
  const r = c.response as AuthenticatorAttestationResponse;
  const respuesta = {
    id: c.id, rawId: deBuf(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults?.() || {},
    authenticatorAttachment: c.authenticatorAttachment || undefined,
    response: { clientDataJSON: deBuf(r.clientDataJSON), attestationObject: deBuf(r.attestationObject), transports: r.getTransports?.() || [] },
  };
  return (await api.post<{ passkeys: Passkey[] }>("/passkeys/registro/verificar", { respuesta })).passkeys;
}

export async function entrarConPasskey() {
  const { id, opciones: o } = await api.post<any>("/passkeys/acceso/opciones");
  let c: PublicKeyCredential;
  try {
    c = (await navigator.credentials.get({ publicKey: { ...o, challenge: aBuf(o.challenge), allowCredentials: [] } })) as PublicKeyCredential;
  } catch (e) { throw new Error(mensajeError(e)); }
  const r = c.response as AuthenticatorAssertionResponse;
  const respuesta = {
    id: c.id, rawId: deBuf(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults?.() || {},
    authenticatorAttachment: c.authenticatorAttachment || undefined,
    response: { clientDataJSON: deBuf(r.clientDataJSON), authenticatorData: deBuf(r.authenticatorData), signature: deBuf(r.signature),
      userHandle: r.userHandle ? deBuf(r.userHandle) : undefined },
  };
  await api.post("/passkeys/acceso/verificar", { id, respuesta });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const limpiaCodigo = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export const REQUISITOS_CLAVE: [(v: string) => boolean, string][] = [
  [(v) => v.length >= 10, "Mínimo 10 caracteres"],
  [(v) => /[A-Z]/.test(v), "Una mayúscula"],
  [(v) => /[a-z]/.test(v), "Una minúscula"],
  [(v) => /\d/.test(v), "Un número"],
  [(v) => /[^A-Za-z0-9]/.test(v), "Un símbolo"],
];
export const claveValida = (v: string) => REQUISITOS_CLAVE.every(([f]) => f(v));
