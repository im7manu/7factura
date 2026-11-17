// El cálculo fiscal vive en shared/fiscal.mjs para que servidor e interfaz usen exactamente el mismo.
export { r2, baseLinea, calcularTotales, impuestosLinea, OPERACIONES, RECARGO_POR_IVA, componerCodigo } from '../../shared/fiscal.mjs';
