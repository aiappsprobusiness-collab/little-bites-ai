# Настройка iOS для MomRecipes

## ⚠️ Важно

**iOS разработка возможна ТОЛЬКО на macOS!** 
Вы не можете разрабатывать iOS приложения на Windows или Linux.

## Требования

1. **macOS** (любая современная версия)
2. **Xcode** (установите из App Store)
3. **CocoaPods** (менеджер зависимостей для iOS)

## Пошаговая установка

### 1. Установите Xcode

1. Откройте App Store на Mac
2. Найдите "Xcode"
3. Нажмите "Установить" (это может занять время, Xcode весит ~10GB)

### 2. Установите CocoaPods

Откройте Terminal и выполните:

```bash
sudo gem install cocoapods
```

Введите пароль администратора, когда будет запрошен.

### 3. Соберите веб-приложение

```bash
npm run build
```

### 4. Добавьте iOS платформу

```bash
npx cap add ios
```

Это создаст папку `ios/` с нативным iOS проектом.

### 5. Установите iOS зависимости

```bash
cd ios/App
pod install
cd ../..
```

### 6. Синхронизируйте Capacitor

```bash
npm run cap:sync
```

### 7. Откройте Xcode

```bash
npm run cap:open:ios
```

Или:
```bash
npx cap open ios
```

## В Xcode

1. Выберите симулятор iPhone или подключите реальное устройство
2. Нажмите кнопку Run (▶️) для запуска приложения
3. Для первого запуска на реальном устройстве нужно настроить подпись кода (Code Signing)

## Настройка подписи кода (Code Signing)

1. В Xcode выберите проект в навигаторе
2. Выберите target "App"
3. Перейдите на вкладку "Signing & Capabilities"
4. Выберите вашу команду разработчика (Team)
5. Xcode автоматически создаст профиль подписи

**Примечание:** Для тестирования на реальном устройстве нужен бесплатный Apple Developer Account. Для публикации в App Store нужен платный аккаунт ($99/год).

## Публикация в App Store

1. В Xcode: Product → Archive
2. После архивации откроется Organizer
3. Нажмите "Distribute App"
4. Следуйте инструкциям для загрузки в App Store Connect

## Полезные команды

```bash
# Обновить CocoaPods зависимости
cd ios/App && pod update && cd ../..

# Очистить и переустановить pods
cd ios/App && rm -rf Pods Podfile.lock && pod install && cd ../..

# Синхронизировать изменения
npm run build && npm run cap:sync
```

## Решение проблем

### Ошибка "Command PhaseScriptExecution failed"

```bash
cd ios/App
pod deintegrate
pod install
cd ../..
```

### Ошибка с подписью кода

- Убедитесь, что выбран правильный Team в Xcode
- Проверьте Bundle Identifier в Xcode (должен быть `com.momrecipes.app`)
- Очистите проект: Product → Clean Build Folder (Shift+Cmd+K)

### Pod install не работает

```bash
sudo gem install cocoapods
pod repo update
cd ios/App
pod install
```

## Дополнительная информация

- [Capacitor iOS документация](https://capacitorjs.com/docs/ios)
- [Xcode документация](https://developer.apple.com/documentation/xcode)
- [App Store Connect](https://appstoreconnect.apple.com/)
