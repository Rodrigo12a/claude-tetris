<#
.SYNOPSIS
    Consulta el clima actual y el pronostico usando APIs publicas sin API key.

.DESCRIPTION
    Ubicacion: por IP (ip-api.com) o por nombre de ciudad (geocoding de Open-Meteo).
    Clima: api.open-meteo.com (gratuito, sin registro).

.EXAMPLE
    pwsh -File clima.ps1
    pwsh -File clima.ps1 -Ciudad "Puebla" -Dias 5
    pwsh -File clima.ps1 -Json
#>
[CmdletBinding()]
param(
    # Nombre de la ciudad. Si se omite, se detecta la ubicacion por IP.
    [string]$Ciudad,

    # Dias de pronostico (1-16).
    [ValidateRange(1, 16)]
    [int]$Dias = 3,

    # Devuelve JSON crudo en lugar del reporte formateado.
    [switch]$Json
)

$ErrorActionPreference = 'Stop'

# Codigos WMO -> descripcion en espanol
$WMO = @{
    0  = 'Despejado';                     1  = 'Mayormente despejado'
    2  = 'Parcialmente nublado';          3  = 'Nublado'
    45 = 'Niebla';                        48 = 'Niebla con escarcha'
    51 = 'Llovizna ligera';               53 = 'Llovizna moderada'
    55 = 'Llovizna intensa';              56 = 'Llovizna helada ligera'
    57 = 'Llovizna helada intensa'
    61 = 'Lluvia ligera';                 63 = 'Lluvia moderada'
    65 = 'Lluvia fuerte';                 66 = 'Lluvia helada ligera'
    67 = 'Lluvia helada fuerte'
    71 = 'Nevada ligera';                 73 = 'Nevada moderada'
    75 = 'Nevada fuerte';                 77 = 'Granos de nieve'
    80 = 'Chubascos ligeros';             81 = 'Chubascos moderados'
    82 = 'Chubascos violentos';           85 = 'Chubascos de nieve ligeros'
    86 = 'Chubascos de nieve fuertes'
    95 = 'Tormenta electrica';            96 = 'Tormenta con granizo ligero'
    99 = 'Tormenta con granizo fuerte'
}

function Get-Wmo([int]$code) {
    if ($WMO.ContainsKey($code)) { return $WMO[$code] }
    return "Codigo WMO $code"
}

function Get-Rumbo([double]$grados) {
    $r = @('N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO')
    return $r[[int](([math]::Round($grados / 22.5)) % 16)]
}

# --- 1. Resolver ubicacion --------------------------------------------------
if ($Ciudad) {
    $url = 'https://geocoding-api.open-meteo.com/v1/search?name={0}&count=1&language=es&format=json' -f [uri]::EscapeDataString($Ciudad)
    try { $geo = Invoke-RestMethod -Uri $url -TimeoutSec 20 }
    catch { Write-Error "No se pudo consultar el geocodificador: $($_.Exception.Message)"; exit 1 }

    if (-not $geo.results) { Write-Error "No se encontro la ciudad '$Ciudad'."; exit 1 }
    $m = $geo.results[0]
    $lat = $m.latitude
    $lon = $m.longitude
    $etiqueta = (@($m.name, $m.admin1, $m.country) | Where-Object { $_ } | Select-Object -Unique) -join ', '
    $origen = 'ciudad indicada'
}
else {
    $url = 'http://ip-api.com/json/?fields=status,message,country,regionName,city,lat,lon,timezone'
    try { $geo = Invoke-RestMethod -Uri $url -TimeoutSec 20 }
    catch { Write-Error "No se pudo detectar la ubicacion por IP: $($_.Exception.Message). Usa -Ciudad <nombre>."; exit 1 }

    if ($geo.status -ne 'success') { Write-Error "Geolocalizacion fallida: $($geo.message). Usa -Ciudad <nombre>."; exit 1 }
    $lat = $geo.lat
    $lon = $geo.lon
    $etiqueta = (@($geo.city, $geo.regionName, $geo.country) | Where-Object { $_ } | Select-Object -Unique) -join ', '
    $origen = 'IP local'
}

# --- 2. Consultar clima -----------------------------------------------------
$qs = @(
    "latitude=$lat"
    "longitude=$lon"
    'current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day'
    'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
    'timezone=auto'
    "forecast_days=$Dias"
) -join '&'

try { $wx = Invoke-RestMethod -Uri "https://api.open-meteo.com/v1/forecast?$qs" -TimeoutSec 20 }
catch { Write-Error "No se pudo consultar Open-Meteo: $($_.Exception.Message)"; exit 1 }

if ($Json) {
    [pscustomobject]@{
        ubicacion = $etiqueta
        origen    = $origen
        latitud   = $lat
        longitud  = $lon
        clima     = $wx
    } | ConvertTo-Json -Depth 8
    exit 0
}

# --- 3. Reporte -------------------------------------------------------------
$c = $wx.current
$u = $wx.current_units
$momento = if ($c.is_day -eq 0) { ' (de noche)' } else { '' }

$sep = '-' * 52
Write-Output ''
Write-Output "  CLIMA EN $($etiqueta.ToUpper())"
Write-Output "  $sep"
Write-Output ("  {0,-15} {1}{2}" -f 'Estado:', (Get-Wmo ([int]$c.weather_code)), $momento)
Write-Output ("  {0,-15} {1}{2} (sensacion {3}{2})" -f 'Temperatura:', $c.temperature_2m, $u.temperature_2m, $c.apparent_temperature)
Write-Output ("  {0,-15} {1}{2}" -f 'Humedad:', $c.relative_humidity_2m, $u.relative_humidity_2m)
Write-Output ("  {0,-15} {1} {2} del {3}" -f 'Viento:', $c.wind_speed_10m, $u.wind_speed_10m, (Get-Rumbo $c.wind_direction_10m))
Write-Output ("  {0,-15} {1} {2}" -f 'Precipitacion:', $c.precipitation, $u.precipitation)
Write-Output ("  {0,-15} {1} ({2})" -f 'Actualizado:', $c.time.Replace('T', ' '), $wx.timezone)

$nombresDia = @('domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado')
Write-Output ''
Write-Output "  PRONOSTICO ($Dias dias)"
Write-Output "  $sep"
for ($i = 0; $i -lt $wx.daily.time.Count; $i++) {
    $fecha = [datetime]::Parse($wx.daily.time[$i], [cultureinfo]::InvariantCulture)
    Write-Output ("  {0,-13} {1,5} / {2,-5} {3}   {4,3}% lluvia   {5}" -f `
        ($nombresDia[[int]$fecha.DayOfWeek] + ' ' + $fecha.ToString('dd/MM')),
        $wx.daily.temperature_2m_max[$i],
        $wx.daily.temperature_2m_min[$i],
        $wx.daily_units.temperature_2m_max,
        $wx.daily.precipitation_probability_max[$i],
        (Get-Wmo ([int]$wx.daily.weather_code[$i])))
}

Write-Output ''
Write-Output ("  Amanecer {0} / Atardecer {1}   |   Fuente: Open-Meteo ({2})" -f `
        $wx.daily.sunrise[0].Split('T')[1], $wx.daily.sunset[0].Split('T')[1], $origen)
Write-Output ''
