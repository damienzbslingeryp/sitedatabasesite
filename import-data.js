const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

// MongoDB подключение
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/site-manager';

// Схема сайта (та же, что в server.js)
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

// Функция импорта
async function importFromFile(filePath) {
    try {
        console.log('📂 Читаю файл:', filePath);
        const content = await fs.readFile(filePath, 'utf8');
        
        console.log('🔍 Анализирую содержимое...');
        const lines = content.split('\n');
        const results = { added: 0, duplicates: 0, errors: 0 };
        const newSites = [];

        for (const line of lines) {
            try {
                // Ищем JSON объекты в строке
                const jsonMatches = line.match(/\{[^{}]*\{[^{}]*\}[^{}]*\}/g) || line.match(/\{[^}]+\}/g);
                
                if (jsonMatches) {
                    for (const jsonStr of jsonMatches) {
                        try {
                            // Пробуем исправить JSON если он некорректный
                            let fixedJson = jsonStr
                                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
                                .replace(/:\s*'([^']*)'/g, ':"$1"')
                                .replace(/,\s*}/g, '}')
                                .replace(/,\s*]/g, ']');
                            
                            const obj = JSON.parse(fixedJson);
                            
                            // Проверяем разные форматы данных
                            let siteData = null;
                            
                            // Формат 1: {institution: {id: ..., name: ...}}
                            if (obj.institution && obj.institution.id) {
                                siteData = {
                                    id: obj.institution.id,
                                    name: obj.institution.name || 'Без названия',
                                    url: obj.institution.urlLogonApp || obj.institution.urlHomeApp || ''
                                };
                            }
                            // Формат 2: {id: ..., name: ...}
                            else if (obj.id) {
                                siteData = {
                                    id: obj.id,
                                    name: obj.name || 'Без названия',
                                    url: obj.url || obj.urlLogonApp || obj.urlHomeApp || ''
                                };
                            }
                            
                            if (siteData) {
                                // Проверка на существование
                                const exists = await Site.findOne({ siteId: siteData.id });
                                if (!exists) {
                                    const newSite = new Site({
                                        siteId: siteData.id,
                                        name: siteData.name,
                                        url: siteData.url,
                                        status: 'general'
                                    });
                                    await newSite.save();
                                    newSites.push(newSite);
                                    results.added++;
                                    console.log(`✅ Добавлен: ${siteData.name} (ID: ${siteData.id})`);
                                } else {
                                    results.duplicates++;
                                }
                            }
                        } catch (e) {
                            // Пробуем найти отдельные поля
                            const idMatch = jsonStr.match(/"id"\s*:\s*(\d+)/);
                            const nameMatch = jsonStr.match(/"name"\s*:\s*"([^"]+)"/);
                            const urlMatch = jsonStr.match(/"url(?:LogonApp|HomeApp)?"\s*:\s*"([^"]+)"/);
                            
                            if (idMatch && nameMatch) {
                                const siteData = {
                                    id: parseInt(idMatch[1]),
                                    name: nameMatch[1],
                                    url: urlMatch ? urlMatch[1] : ''
                                };
                                
                                const exists = await Site.findOne({ siteId: siteData.id });
                                if (!exists) {
                                    const newSite = new Site({
                                        siteId: siteData.id,
                                        name: siteData.name,
                                        url: siteData.url,
                                        status: 'general'
                                    });
                                    await newSite.save();
                                    newSites.push(newSite);
                                    results.added++;
                                    console.log(`✅ Добавлен: ${siteData.name} (ID: ${siteData.id})`);
                                } else {
                                    results.duplicates++;
                                }
                            } else {
                                results.errors++;
                            }
                        }
                    }
                }
            } catch (e) {
                results.errors++;
            }
        }

        console.log('\n📊 Результаты импорта:');
        console.log(`✅ Добавлено новых: ${results.added}`);
        console.log(`⚠️  Дубликатов: ${results.duplicates}`);
        console.log(`❌ Ошибок: ${results.errors}`);
        
        return results;
    } catch (error) {
        console.error('❌ Ошибка импорта:', error);
        throw error;
    }
}

// Автоматический импорт при запуске
async function autoImport() {
    try {
        // Подключение к MongoDB
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Подключено к MongoDB');

        // Путь к файлу для импорта
        const importFile = path.join(__dirname, 'data-to-import.txt');
        
        // Проверяем существование файла
        try {
            await fs.access(importFile);
            console.log('📄 Найден файл для импорта:', importFile);
            
            // Импортируем данные
            await importFromFile(importFile);
            
            // Переименовываем файл после импорта
            const processedFile = path.join(__dirname, `imported-${Date.now()}.txt`);
            await fs.rename(importFile, processedFile);
            console.log('📁 Файл обработан и переименован в:', processedFile);
            
        } catch (e) {
            console.log('ℹ️  Файл data-to-import.txt не найден, пропускаем импорт');
        }

        // Закрываем соединение
        await mongoose.connection.close();
        console.log('✅ Импорт завершен');
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }
}

// Запуск импорта
if (require.main === module) {
    autoImport();
}

module.exports = { importFromFile };
