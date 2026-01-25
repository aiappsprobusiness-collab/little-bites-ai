from pathlib import Path

CONTENT = """# Пакеты / зависимости
node_modules/
bower_components/
.venv/
venv/
.env/
.env.local
.env.*.local

# Сборка и кеши
dist/
build/
out/
.next/
.cache/
.tmp/
temp/
coverage/
.storybook-out/

# Логи и временные файлы
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
*.tmp
*.swp
.DS_Store
Thumbs.db

# Тестовые и вспомогательные артефакты
coverage/
cypress/videos/
cypress/screenshots/
playwright-report/
test-results/

# Документация/экспорт (если не хочешь тащить)
docs-build/
*.pdf

# Конфиги IDE/редактора
.vscode/
.idea/
*.iml

# Артефакты фронта
*.map
*.min.js
*.min.css

# Бандлы/артефакты мобилок/десктопа
android/app/build/
ios/build/
*.apk
*.aab
*.ipa

# Прочее тяжелое
public/uploads/
public/static/
media/
assets/
"""

def main() -> None:
    target = Path(".cursorignore")
    if target.exists():
        print(".cursorignore уже существует, пропускаю создание.")
        return

    target.write_text(CONTENT.strip() + "\n", encoding="utf-8")
    print(".cursorignore создан.")

if __name__ == "__main__":
    main()
