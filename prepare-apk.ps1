# Скрипт для подготовки проекта к сборке APK
# Запуск: .\prepare-apk.ps1

Write-Host "🚀 Подготовка проекта к сборке APK..." -ForegroundColor Cyan
Write-Host ""

# Шаг 1: Сборка веб-приложения
Write-Host "📦 Шаг 1: Сборка веб-приложения..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка при сборке веб-приложения!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Веб-приложение собрано успешно" -ForegroundColor Green
Write-Host ""

# Шаг 2: Синхронизация с Capacitor
Write-Host "🔄 Шаг 2: Синхронизация с Capacitor..." -ForegroundColor Yellow
npm run cap:sync
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка при синхронизации с Capacitor!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Синхронизация завершена успешно" -ForegroundColor Green
Write-Host ""

# Шаг 3: Проверка Android проекта
Write-Host "📱 Шаг 3: Проверка Android проекта..." -ForegroundColor Yellow
if (Test-Path "android") {
    Write-Host "✅ Android проект найден" -ForegroundColor Green
} else {
    Write-Host "❌ Android проект не найден! Запустите: npx cap add android" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Итоговая информация
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "✅ ПРОЕКТ ГОТОВ К СБОРКЕ APK!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Следующие шаги:" -ForegroundColor Yellow
Write-Host "1. Откройте Android Studio:" -ForegroundColor White
Write-Host "   npm run cap:open:android" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Дождитесь синхронизации Gradle" -ForegroundColor White
Write-Host ""
Write-Host "3. Соберите APK:" -ForegroundColor White
Write-Host "   Build → Build Bundle(s) / APK(s) → Build APK(s)" -ForegroundColor Gray
Write-Host ""
Write-Host "📁 APK будет находиться в:" -ForegroundColor Yellow
Write-Host "   android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 Подробная инструкция: PREPARE_APK.md" -ForegroundColor Cyan
Write-Host ""
