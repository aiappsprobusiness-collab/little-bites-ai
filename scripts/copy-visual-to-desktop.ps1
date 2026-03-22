# Копирует фронт/визуал на *реальный* рабочий стол Windows (в т.ч. OneDrive).
$ErrorActionPreference = 'Stop'
$proj = 'c:\Projects\little-bites-ai'
$desk = [Environment]::GetFolderPath('Desktop')
$folderName = [char]0x0412 + [char]0x0438 + [char]0x0437 + [char]0x0443 + [char]0x0430 + [char]0x043B # Визуал
$dest = [System.IO.Path]::Combine($desk, $folderName)

if (Test-Path $dest) {
  Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null

if (Test-Path (Join-Path $proj 'src')) {
  Copy-Item -Recurse -Force (Join-Path $proj 'src') (Join-Path $dest 'src')
}
if (Test-Path (Join-Path $proj 'public')) {
  Copy-Item -Recurse -Force (Join-Path $proj 'public') (Join-Path $dest 'public')
}
foreach ($f in @('index.html', 'tailwind.config.ts', 'postcss.config.js', 'components.json', 'vite.config.ts')) {
  $p = Join-Path $proj $f
  if (Test-Path $p) { Copy-Item -Force $p $dest }
}

$manifest = Join-Path $dest 'FILE_LIST.txt'
Get-ChildItem -Path $dest -Recurse -File | ForEach-Object { $_.FullName.Substring($dest.Length + 1) } | Sort-Object | Set-Content -Path $manifest -Encoding UTF8

Write-Output "OK: $dest"
Write-Output "Files: $((Get-ChildItem -Path $dest -Recurse -File).Count)"
Start-Process explorer.exe -ArgumentList $dest
