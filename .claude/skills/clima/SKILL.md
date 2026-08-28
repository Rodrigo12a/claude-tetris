---
name: clima
description: Consulta el clima actual y el pronostico de los proximos dias. Detecta la ubicacion local automaticamente por IP, o acepta el nombre de una ciudad. Usar cuando el usuario pregunte por el clima, el tiempo, la temperatura, si va a llover, el pronostico, o escriba /clima.
---

# Clima

Obtiene el clima usando dos APIs publicas **sin API key ni registro**:

- **Ubicacion** — `ip-api.com` (por IP) o el geocodificador de Open-Meteo (por nombre de ciudad).
- **Clima** — `api.open-meteo.com`.

## Uso

Ejecuta el script con la herramienta PowerShell. Siempre desde la raiz del proyecto:

```powershell
pwsh -NoProfile -File .claude/skills/clima/scripts/clima.ps1
```

### Parametros

| Parametro | Descripcion | Por defecto |
|---|---|---|
| `-Ciudad <nombre>` | Consulta esa ciudad en vez de la ubicacion por IP | detectar por IP |
| `-Dias <1-16>` | Cuantos dias de pronostico mostrar | `3` |
| `-Json` | Devuelve el JSON crudo en vez del reporte formateado | desactivado |

### Ejemplos

```powershell
# Clima local (ubicacion detectada por IP)
pwsh -NoProfile -File .claude/skills/clima/scripts/clima.ps1

# Otra ciudad, una semana de pronostico
pwsh -NoProfile -File .claude/skills/clima/scripts/clima.ps1 -Ciudad "Santiago de Chile" -Dias 7

# JSON crudo, para procesarlo despues
pwsh -NoProfile -File .claude/skills/clima/scripts/clima.ps1 -Ciudad "Puebla" -Json
```

## Como responder

1. Ejecuta el script **una sola vez** con los parametros que correspondan a la pregunta.
2. Muestra la salida del script tal cual (ya viene formateada y en espanol).
3. Agrega debajo una o dos frases de interpretacion, solo si aportan algo:
   - Si el usuario pregunto algo concreto ("¿llevo paraguas?", "¿hace frio?"), responde eso primero y de forma directa.
   - Menciona lluvia probable (>40%), viento fuerte (>30 km/h) o temperaturas extremas cuando aparezcan.
4. No inventes datos: si el script falla, di que fallo y muestra el error.

## Notas

- La ubicacion por IP es aproximada (nivel ciudad) y puede equivocarse si hay VPN. Si el resultado no cuadra con donde esta el usuario, sugierele usar `-Ciudad`.
- La temperatura viene en °C y el viento en km/h (unidades por defecto de Open-Meteo). Para Fahrenheit hay que agregar `&temperature_unit=fahrenheit` a la query del script.
- Requiere conexion a internet. Sin red, ambas llamadas fallan con un mensaje explicito.
- Ambos servicios son gratuitos para uso no comercial y tienen limites de peticiones (ip-api.com: 45/min). No lo ejecutes en bucle.
