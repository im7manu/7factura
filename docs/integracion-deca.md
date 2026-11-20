# Datos compartidos con 7DeCA

7Factura y 7DeCA los usa la misma empresa. Para que en el futuro compartan clientes, proveedores, vehículos y conductores, 7Factura ya guarda estos datos con la misma forma que 7DeCA y con un identificador estable.

## Entidades

| Entidad | Clave natural (para emparejar) | Campos comunes con 7DeCA |
|---|---|---|
| Clientes | NIF | nombre, nif, direccion, cp, ciudad, email, telefono (`tel` en DeCA) |
| Proveedores | NIF | igual que clientes (en DeCA son «empresas» con otro `tipo`) |
| Vehículos | Matrícula | matricula, tipo (Tractora, Rígido, Remolque, Semirremolque…), modelo, estado (Disponible, En ruta, Taller…), itv |
| Conductores | DNI/NIE | nombre, dni, telefono, email, activo |

Cada registro tiene además:

- `uid`: identificador universal (UUID v4) que no cambia nunca, aunque cambien el NIF o la matrícula.
- `actualizado`: fecha y hora de la última modificación (UTC, `AAAA-MM-DD HH:MM:SS`).

## Exportación (ya disponible)

```
GET /api/compartido/{clientes|proveedores|vehiculos|conductores}?desde=AAAA-MM-DD HH:MM:SS
```

Solo para administradores con sesión. Devuelve:

```json
{
  "entidad": "vehiculos",
  "clave": "matricula",
  "version": 1,
  "generado": "2026-11-17T01:10:00.000Z",
  "registros": [
    { "uid": "…", "matricula": "1234ABC", "tipo": "Tractora", "modelo": "Volvo FH", "estado": "Disponible", "itv": "2027-02-10", "activo": 1, "actualizado": "2026-11-17 01:05:12" }
  ]
}
```

Con `desde` solo llegan los registros modificados después de esa fecha, lo que permite una sincronización incremental.

## Plan para la conexión

Por decidir con el usuario. La idea:

1. 7DeCA añade `uid` y `actualizado` a sus tablas (`empresas`, `vehiculos`, `conductores`).
2. Las dos aplicaciones se conectan con una clave de API (no con la sesión de un usuario).
3. Al sincronizar, cada registro se empareja por `uid` y, si no existe, por su clave natural. Si hay conflicto, gana el `actualizado` más reciente.
4. Se podrá elegir qué entidades se comparten y en qué dirección.
