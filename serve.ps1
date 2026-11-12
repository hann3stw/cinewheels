# Minimaler statischer Webserver für Windows ohne Node/Python.
# Aufruf:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080] [-Lan]
# -Lan lauscht auf allen Netzwerkadressen (für Tests auf dem Handy); braucht ggf. Admin-Rechte
# oder einmalig: netsh http add urlacl url=http://+:8080/ user=Jeder
param([int]$Port = 8080, [switch]$Lan)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'
}

# Ist der Port per "netsh http add urlacl" fuer das Netzwerk reserviert, scheitert der reine
# localhost-Start mit "Access is denied". Dann wird automatisch die Netzwerk-Variante benutzt.
$prefixes = if ($Lan) { @("http://+:$Port/") } else { @("http://localhost:$Port/", "http://+:$Port/") }
$listener = $null
foreach ($prefix in $prefixes) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add($prefix)
  try { $l.Start(); $listener = $l; break } catch { }
}
if (-not $listener) { Write-Host "Port $Port konnte nicht geoeffnet werden. Anderen Port probieren: -Port 8090"; exit 1 }
Write-Host "CineWheels läuft auf http://localhost:$Port/  (Strg+C zum Beenden)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      if (-not $full.StartsWith($root) -or -not (Test-Path $full -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('404')
      } else {
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-cache')
        $bytes = [System.IO.File]::ReadAllBytes($full)
      }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
