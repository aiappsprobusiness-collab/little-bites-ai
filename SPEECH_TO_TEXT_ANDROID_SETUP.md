# Настройка Speech-to-Text для Android

## Обзор

Приложение теперь поддерживает улучшенное распознавание речи с:
- ✅ Проверкой разрешений микрофона
- ✅ Fallback на альтернативные методы
- ✅ Поддержкой русского языка (ru-RU)
- ✅ Интеграцией с Android через нативный SpeechRecognizer (работает офлайн)
- ⚠️ **Web Speech API**: почти всегда требует интернет-соединение (офлайн режим экспериментальный и не гарантируется)

## Что было сделано

### 1. Создан улучшенный сервис (`speechToTextEnhanced.ts`)

Сервис включает:
- Автоматическую проверку разрешений
- Поддержку нескольких методов распознавания (Web Speech API, Android Native)
- Обработку ошибок с понятными сообщениями
- Поддержку русского языка

### 2. Обновлен ChatInputPanel

Компонент теперь:
- Использует новый улучшенный сервис
- Автоматически запрашивает разрешения
- Показывает статус инициализации
- Обрабатывает ошибки с понятными сообщениями

### 3. Создан нативный Android плагин

Создан файл `SpeechRecognitionPlugin.java` для интеграции с Android SpeechRecognizer.

## Инструкция по интеграции Android плагина

### Шаг 1: Добавьте разрешения в AndroidManifest.xml

Откройте файл `android/app/src/main/AndroidManifest.xml` и добавьте:

```xml
<manifest>
  <!-- Разрешение на запись аудио -->
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  
  <!-- ... остальные разрешения ... -->
</manifest>
```

### Шаг 2: Зарегистрируйте плагин

Откройте файл `android/app/src/main/java/com/momrecipes/app/MainActivity.java` и добавьте:

```java
import com.momrecipes.app.SpeechRecognitionPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Регистрируем плагин
        registerPlugin(SpeechRecognitionPlugin.class);
    }
}
```

### Шаг 3: Синхронизируйте Capacitor

```bash
npm run cap:sync
```

### Шаг 4: Обновите TypeScript определения (опционально)

Создайте файл `src/capacitor.d.ts`:

```typescript
import '@capacitor/core';

declare module '@capacitor/core' {
  interface PluginRegistry {
    SpeechRecognition: {
      start(options: { language?: string; maxResults?: number; partialResults?: boolean }): Promise<{ matches: string[]; language: string }>;
      stop(): Promise<void>;
      checkPermission(): Promise<{ granted: boolean }>;
      requestPermission(): Promise<{ granted: boolean }>;
    };
  }
}
```

## Тестирование

### На веб-платформе

1. Откройте приложение в Chrome/Edge
2. Перейдите на страницу чата
3. Нажмите кнопку микрофона
4. Разрешите доступ к микрофону
5. Говорите на русском языке

### На Android устройстве

1. Соберите APK:
   ```bash
   npm run build:android
   ```

2. Установите на устройство через Android Studio

3. Откройте приложение и перейдите в чат

4. Нажмите кнопку микрофона

5. Разрешите доступ к микрофону (если запрошено)

6. Говорите на русском языке

## Отладка

### Проверка разрешений

В консоли браузера или через Android Studio Logcat проверьте:
- Разрешения запрашиваются автоматически
- Сообщения об ошибках понятны

### Проблемы с Web Speech API

Если Web Speech API не работает:
- **Web Speech API почти всегда требует интернет-соединение** - офлайн режим возможен только в очень узких сценариях и не гарантируется
- На Android Chrome Web Speech API сильно зависит от установленного сервиса распознавания (Google/производитель), при его отсутствии или блокировках часто не работает вообще
- Убедитесь, что используете HTTPS или localhost
- Проверьте, что браузер поддерживает Web Speech API (Chrome, Edge, Safari)
- Проверьте доступ к серверам Google (для Web Speech API требуется интернет почти всегда)
- Используйте VPN если доступ к Google заблокирован
- Или используйте Android Native для офлайн режима

### Проблемы с Android Native

Если Android Native не работает:
- Проверьте, что разрешение RECORD_AUDIO добавлено в AndroidManifest.xml
- Убедитесь, что плагин зарегистрирован в MainActivity
- Проверьте логи в Android Studio Logcat

## Альтернативные решения (для офлайн режима)

### Vosk (офлайн распознавание)

Для полностью офлайн распознавания можно интегрировать Vosk:

1. Добавьте Vosk библиотеку в `android/app/build.gradle`:
   ```gradle
   dependencies {
       implementation 'com.alphacephei:vosk-android:0.3.45'
   }
   ```

2. Создайте плагин для Vosk (аналогично SpeechRecognitionPlugin)

3. Обновите `speechToTextEnhanced.ts` для поддержки Vosk

### Whisper (локальное распознавание)

Для локального Whisper можно использовать:
- Whisper.cpp для Android
- Или интеграцию через Edge Functions

## Текущие ограничения

1. **Web Speech API почти всегда требует интернет** - для работы нужен доступ к серверам Google. Офлайн режим возможен только в очень узких сценариях (часть Chrome на Android с предзагруженными языковыми пакетами), но поведение нестабильно, особенно для русского языка. **Не рекомендуется полагаться на офлайн режим Web Speech API.**
2. **На Android Chrome Web Speech API** - сильно зависит от установленного сервиса распознавания (Google/производитель), при его отсутствии или блокировках часто не работает вообще
3. **Android Native** - работает офлайн, но требует настройки плагина и зависит от установленного сервиса распознавания
4. **Vosk/Whisper** - требуют дополнительной интеграции для полностью офлайн режима

## Следующие шаги

1. ✅ Проверка разрешений - реализовано
2. ✅ Fallback механизмы - реализовано
3. ✅ Русский язык - реализовано
4. ⏳ Android Native интеграция - требует настройки плагина
5. ⏳ Vosk/Whisper интеграция - опционально для офлайн режима

## Полезные ссылки

- [Android SpeechRecognizer документация](https://developer.android.com/reference/android/speech/SpeechRecognizer)
- [Web Speech API документация](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Vosk Speech Recognition](https://alphacephei.com/vosk/)
- [Capacitor Plugin Development](https://capacitorjs.com/docs/plugins)
