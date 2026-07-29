@echo off
title DAWOS - Servidor Local
color 0A
echo.
echo  ============================================
echo   DAWOS Embalagens - Servidor Local
echo  ============================================
echo.
echo  Servidor iniciando em http://localhost:8787
echo  Deixe esta janela aberta enquanto usar o app!
echo.
echo  Pressione Ctrl+C para parar o servidor.
echo.

powershell -NoExit -Command ^
"$listener = New-Object System.Net.HttpListener; ^
$listener.Prefixes.Add('http://localhost:8787/'); ^
$listener.Start(); ^
$root = 'C:\Users\User\.gemini\antigravity\scratch\pricing-app'; ^
Write-Host '  [OK] Servidor rodando! Acesse http://localhost:8787' -ForegroundColor Green; ^
Write-Host ''; ^
while ($listener.IsListening) { ^
  try { ^
    $ctx = $listener.GetContext(); ^
    $path = $ctx.Request.Url.LocalPath.TrimStart('/'); ^
    if ($path -eq '' -or $path -eq '/') { $path = 'index.html' }; ^
    $path = $path -replace '\?.*',''; ^
    $path = $path.Replace('/','\'); ^
    $file = Join-Path $root $path; ^
    if (Test-Path $file -PathType Leaf) { ^
      $bytes = [System.IO.File]::ReadAllBytes($file); ^
      $ext = [System.IO.Path]::GetExtension($file); ^
      $ct = if ($ext -eq '.html') {'text/html; charset=utf-8'} elseif ($ext -eq '.js') {'application/javascript; charset=utf-8'} elseif ($ext -eq '.css') {'text/css; charset=utf-8'} else {'application/octet-stream'}; ^
      $ctx.Response.ContentType = $ct; ^
      $ctx.Response.Headers.Add('Cache-Control','no-cache'); ^
      $ctx.Response.ContentLength64 = $bytes.Length; ^
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) ^
    } else { $ctx.Response.StatusCode = 404 }; ^
    $ctx.Response.Close() ^
  } catch { } ^
}"
