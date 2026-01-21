# Скрипт для перемещения проекта в папку без кириллицы

# Текущий путь (с кириллицей)
$sourcePath = "C:\Users\alesa\OneDrive\Рабочий стол\Repositories\little-bites-ai"

# Новый путь (без кириллицы) - ВЫБЕРИТЕ ОДИН ИЗ ВАРИАНТОВ:
$destinationPath = "C:\Projects\little-bites-ai"  # Вариант 1 (рекомендуется)
# $destinationPath = "C:\Dev\little-bites-ai"     # Вариант 2
# $destinationPath = "C:\Users\alesa\Projects\little-bites-ai"  # Вариант 3

Write-Host "Перемещение проекта..." -ForegroundColor Yellow
Write-Host "Откуда: $sourcePath" -ForegroundColor Cyan
Write-Host "Куда:   $destinationPath" -ForegroundColor Cyan
Write-Host ""

# Проверка существования исходной папки
if (-not (Test-Path $sourcePath)) {
    Write-Host "ОШИБКА: Исходная папка не найдена!" -ForegroundColor Red
    exit 1
}

# Создание целевой папки
$parentDir = Split-Path -Parent $destinationPath
if (-not (Test-Path $parentDir)) {
    Write-Host "Создание папки: $parentDir" -ForegroundColor Green
    New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
}

# Проверка существования целевой папки
if (Test-Path $destinationPath) {
    Write-Host "ВНИМАНИЕ: Целевая папка уже существует!" -ForegroundColor Yellow
    $response = Read-Host "Перезаписать? (y/n)"
    if ($response -ne "y") {
        Write-Host "Отменено." -ForegroundColor Red
        exit 0
    }
    Remove-Item -Path $destinationPath -Recurse -Force
}

# Копирование проекта
Write-Host "Копирование файлов..." -ForegroundColor Yellow
Copy-Item -Path $sourcePath -Destination $destinationPath -Recurse -Force

Write-Host ""
Write-Host "✅ Проект успешно скопирован!" -ForegroundColor Green
Write-Host ""
Write-Host "Следующие шаги:" -ForegroundColor Yellow
Write-Host "1. Откройте Android Studio" -ForegroundColor White
Write-Host "2. File → Open → выберите: $destinationPath" -ForegroundColor White
Write-Host "3. File → Sync Project with Gradle Files" -ForegroundColor White
Write-Host "4. После проверки можно удалить старую папку" -ForegroundColor White
Write-Host ""
