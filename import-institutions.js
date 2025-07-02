const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// MongoDB подключение
const MONGODB_URI = 'mongodb://localhost:27017/site-manager';

// Схема сайта
const siteSchema = new mongoose.Schema({
    siteId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    url: { type: String, default: '' },
    status: { 
        type: String, 
        enum: ['general', '2fa', 'good', 'archive'],
        default: 'general' 
    },
    comment: { type: String, default: '' },
    prefix: { type: String, default: '' },
    credentials: {
        login: { type: String, default: '' },
        password: { type: String, default: '' }
    },
    dateAdded: { type: Date, default: Date.now },
    lastModified: { type: Date, default: Date.now },
    modifiedBy: { type: String, default: 'system' }
});

const Site = mongoose.model('Site', siteSchema);

// Функция для извлечения JSON объектов
function extractJsonObjects(content) {
    const objects = [];
    let currentPos = 0;
    
    while (currentPos < content.length) {
        // Ищем начало объекта
        const startIndex = content.indexOf('{"institution":', currentPos);
        if (startIndex === -1) break;
        
        // Находим конец объекта, считая фигурные скобки
        let depth = 0;
        let inString = false;
        let escape = false;
        let endIndex = -1;
        
        for (let i = startIndex; i < content.length; i++) {
            const char = content[i];
            
            if (!escape) {
                if (char === '"') inString = !inString;
                else if (!inString) {
                    if (char === '{') depth++;
                    else if (char === '}') {
                        depth--;
                        if (depth === 0) {
                            endIndex = i;
                            break;
                        }
                    }
                }
                escape = (char === '\\');
            } else {
                escape = false;
            }
        }
        
        if (endIndex !== -1) {
            const jsonStr = content.substring(startIndex, endIndex + 1);
            objects.push(jsonStr);
            currentPos = endIndex + 1;
        } else {
            break;
        }
    }
    
    return objects;
}

// Функция для безопасного парсинга JSON
function safeJsonParse(jsonStr) {
    try {
        // Очищаем строку от возможных проблем
        let cleaned = jsonStr;
        
        // Заменяем проблемные последовательности
        cleaned = cleaned.replace(/\{"institution":\s*false/g, '{"institution":null');
        cleaned = cleaned.replace(/:\s*false/g, ':null');
        cleaned = cleaned.replace(/:\s*true/g, ':true');
        
        // Убираем незавершенные объекты в конце
        const lastComplete = cleaned.lastIndexOf('}}');
        if (lastComplete !== -1) {
            cleaned = cleaned.substring(0, lastComplete + 2);
        }
        
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('Ошибка парсинга JSON:', e.message);
        return null;
    }
}

async function importData() {
    try {
        // Подключение к MongoDB
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Подключено к MongoDB');

        // Читаем файл
        const filePath = path.join(__dirname, 'paste.txt');
        console.log(`📂 Читаю файл: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        
        console.log('🔍 Извлекаю JSON объекты...');
        const jsonObjects = extractJsonObjects(content);
        console.log(`📊 Найдено JSON объектов: ${jsonObjects.length}`);
        
        const results = {
            added: 0,
            duplicates: 0,
            errors: 0,
            institutions: []
        };

        // Обрабатываем каждый JSON объект
        for (let i = 0; i < jsonObjects.length; i++) {
            console.log(`\n🔄 Обработка объекта ${i + 1}/${jsonObjects.length}`);
            
            const parsed = safeJsonParse(jsonObjects[i]);
            if (!parsed || !parsed.institution) {
                console.log('❌ Не удалось распарсить объект');
                results.errors++;
                continue;
            }
            
            const inst = parsed.institution;
            
            // Проверяем наличие обязательных полей
            if (!inst.id || !inst.name) {
                console.log('❌ Отсутствуют обязательные поля (id или name)');
                results.errors++;
                continue;
            }
            
            try {
                // Проверяем, существует ли уже такой сайт
                const exists = await Site.findOne({ siteId: inst.id });
                
                if (!exists) {
                    const newSite = new Site({
                        siteId: inst.id,
                        name: inst.name,
                        url: inst.urlLogonApp || inst.urlHomeApp || ''
                    });
                    
                    await newSite.save();
                    console.log(`✅ Добавлен: ${newSite.name} (ID: ${newSite.siteId})`);
                    results.added++;
                    results.institutions.push({
                        id: inst.id,
                        name: inst.name,
                        url: newSite.url
                    });
                } else {
                    console.log(`⚠️  Дубликат: ${inst.name} (ID: ${inst.id})`);
                    results.duplicates++;
                }
            } catch (error) {
                console.error(`❌ Ошибка при сохранении: ${error.message}`);
                results.errors++;
            }
        }

        // Выводим результаты
        console.log('\n📊 ИТОГОВЫЕ РЕЗУЛЬТАТЫ:');
        console.log(`✅ Добавлено новых сайтов: ${results.added}`);
        console.log(`⚠️  Пропущено дубликатов: ${results.duplicates}`);
        console.log(`❌ Ошибок обработки: ${results.errors}`);
        
        if (results.institutions.length > 0) {
            console.log('\n📋 Добавленные институты:');
            results.institutions.forEach(inst => {
                console.log(`   - ${inst.name} (ID: ${inst.id})`);
                if (inst.url) console.log(`     URL: ${inst.url}`);
            });
        }

        console.log('\n✅ Импорт завершен!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    }
}

// Запускаем импорт
importData();
