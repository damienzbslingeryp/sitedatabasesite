#!/bin/bash

echo "🧹 Очистка проекта Site Manager..."

# Создаем папку для резервных копий
mkdir -p backup_files

# Перемещаем ненужные файлы в резервную папку
echo "📦 Перемещение ненужных файлов в backup_files..."

# Файлы импорта
mv import-*.js backup_files/ 2>/dev/null
mv analyze-file.js backup_files/ 2>/dev/null
mv manual-parse.js backup_files/ 2>/dev/null
mv parsed-institutions.json backup_files/ 2>/dev/null

# Резервные копии
mv public/index.html.backup backup_files/ 2>/dev/null

# Ошибочные файлы
mv "tart ecosystem.config.js" backup_files/ 2>/dev/null

# Файл с данными (если уже импортирован)
if [ -f "paste.txt" ]; then
    echo "⚠️  Найден paste.txt. Переместить в резервную копию? (y/n)"
    read -r response
    if [[ "$response" == "y" ]]; then
        mv paste.txt backup_files/
        echo "✅ paste.txt перемещен в backup_files/"
    fi
fi

# Обновляем index.html
echo "📝 Обновление index.html..."
cp public/index.html public/index.html.old 2>/dev/null

# Создаем .gitignore если его нет
if [ ! -f ".gitignore" ]; then
    echo "📝 Создание .gitignore..."
    cat > .gitignore << EOF
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log

# OS files
.DS_Store
Thumbs.db

# Editor files
.vscode/
.idea/
*.swp
*.swo
*~

# Backup files
backup_files/
*.backup
*.old

# Data files
paste.txt
data-to-import.txt
imported-*.txt

# PM2
.pm2/
EOF
    echo "✅ .gitignore создан"
fi

# Проверяем наличие необходимых файлов
echo ""
echo "🔍 Проверка структуры проекта..."

required_files=(
    "server.js"
    "package.json"
    "public/index.html"
    "ecosystem.config.js"
)

missing_files=()
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -eq 0 ]; then
    echo "✅ Все необходимые файлы на месте"
else
    echo "❌ Отсутствуют файлы:"
    for file in "${missing_files[@]}"; do
        echo "   - $file"
    done
fi

# Проверяем MongoDB
echo ""
echo "🔍 Проверка MongoDB..."
if systemctl is-active --quiet mongod; then
    echo "✅ MongoDB запущен"
    
    # Проверяем количество записей
    mongo_count=$(mongo site-manager --quiet --eval "db.sites.count()")
    echo "📊 Записей в базе данных: $mongo_count"
else
    echo "❌ MongoDB не запущен"
    echo "   Запустите: sudo systemctl start mongod"
fi

# Создаем README если его нет
if [ ! -f "README.md" ]; then
    echo ""
    echo "📝 Создание README.md..."
    cat > README.md << 'EOF'
# Site Manager

Система управления базой данных финансовых учреждений с веб-интерфейсом.

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Убедитесь, что MongoDB запущен:
```bash
sudo systemctl start mongod
```

3. Запустите сервер:
```bash
# Для разработки
npm run dev

# Для production с PM2
pm2 start ecosystem.config.js
```

4. Откройте в браузере: http://localhost:3000

## Структура проекта

```
.
├── server.js           # Основной сервер
├── public/            
│   └── index.html     # Веб-интерфейс
├── ecosystem.config.js # Конфигурация PM2
├── package.json       # Зависимости
└── logs/             # Логи приложения
```

## Функции

- 📊 Управление базой данных сайтов
- 🔍 Поиск и фильтрация
- 📑 Пагинация для больших объемов данных
- 🏷️ Система префиксов и категорий
- 💬 Комментарии и заметки
- 🔐 Хранение тестовых учетных данных
- 🔄 Real-time обновления через Socket.IO

## API Endpoints

- `GET /api/sites` - Получить все сайты
- `GET /api/sites/by-status/:status` - Получить сайты по статусу
- `PUT /api/sites/:id/move` - Переместить сайт
- `PUT /api/sites/:id/comment` - Добавить комментарий
- `GET /api/stats` - Получить статистику
EOF
    echo "✅ README.md создан"
fi

echo ""
echo "✅ Очистка завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Замените public/index.html на оптимизированную версию"
echo "2. Перезапустите сервер: pm2 restart site-manager"
echo "3. Проверьте работу на http://localhost:3000"
echo ""
echo "💡 Совет: Резервные копии файлов находятся в backup_files/"