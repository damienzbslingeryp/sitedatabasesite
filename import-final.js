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
        
        console.log('🔍 Извлекаю данные институтов...');
        
        // Используем проверенный метод для извлечения ID и названий
        const idPattern = /"id":(\d+),"name":"([^"]+)"/g;
        const institutions = new Map(); // Используем Map для уникальности по ID
        let match;
        
        // Сначала собираем все ID и названия
        while ((match = idPattern.exec(content)) !== null) {
            const id = parseInt(match[1]);
            const name = match[2];
            
            // Сохраняем только если еще нет такого ID
            if (!institutions.has(id)) {
                institutions.set(id, { id, name, url: '' });
            }
        }
        
        console.log(`📊 Найдено уникальных институтов: ${institutions.size}`);
        
        // Теперь пытаемся найти URL для каждого института
        // Создаем паттерн для поиска URL после конкретного ID
        institutions.forEach((inst, id) => {
            // Ищем первое вхождение этого ID
            const idIndex = content.indexOf(`"id":${id},`);
            if (idIndex !== -1) {
                // Ищем URL в пределах следующих 2000 символов после ID
                const searchArea = content.substring(idIndex, Math.min(idIndex + 2000, content.length));
                
                // Ищем urlLogonApp
                const urlLogonMatch = searchArea.match(/"urlLogonApp":"([^"]+)"/);
                if (urlLogonMatch) {
                    inst.url = urlLogonMatch[1];
                } else {
                    // Если не нашли urlLogonApp, ищем urlHomeApp
                    const urlHomeMatch = searchArea.match(/"urlHomeApp":"([^"]+)"/);
                    if (urlHomeMatch) {
                        inst.url = urlHomeMatch[1];
                    }
                }
            }
        });
        
        // Конвертируем Map в массив для импорта
        const institutionsArray = Array.from(institutions.values());
        
        console.log(`\n🚀 Начинаю импорт ${institutionsArray.length} институтов...`);
        console.log('⏳ Это может занять несколько минут...\n');
        
        const results = {
            added: 0,
            duplicates: 0,
            errors: 0
        };
        
        // Показываем прогресс каждые 100 записей
        let processed = 0;
        const startTime = Date.now();
        
        for (const inst of institutionsArray) {
            try {
                processed++;
                
                // Показываем прогресс
                if (processed % 100 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const rate = processed / elapsed;
                    const remaining = (institutionsArray.length - processed) / rate;
                    console.log(`⏳ Обработано: ${processed}/${institutionsArray.length} (${Math.round(processed/institutionsArray.length*100)}%) - Осталось примерно ${Math.round(remaining)} сек`);
                }
                
                // Проверяем, существует ли уже такой сайт
                const exists = await Site.findOne({ siteId: inst.id });
                
                if (!exists) {
                    const newSite = new Site({
                        siteId: inst.id,
                        name: inst.name,
                        url: inst.url || ''
                    });
                    
                    await newSite.save();
                    results.added++;
                    
                    // Показываем первые несколько добавленных для проверки
                    if (results.added <= 5) {
                        console.log(`✅ Добавлен: ${newSite.name} (ID: ${newSite.siteId})`);
                    }
                } else {
                    results.duplicates++;
                }
            } catch (error) {
                results.errors++;
                if (results.errors <= 5) {
                    console.error(`❌ Ошибка при добавлении ID ${inst.id}: ${error.message}`);
                }
            }
        }
        
        const totalTime = (Date.now() - startTime) / 1000;
        
        // Итоговые результаты
        console.log('\n' + '='.repeat(50));
        console.log('📊 ИТОГОВЫЕ РЕЗУЛЬТАТЫ ИМПОРТА:');
        console.log('='.repeat(50));
        console.log(`✅ Успешно добавлено: ${results.added} сайтов`);
        console.log(`⚠️  Пропущено дубликатов: ${results.duplicates}`);
        console.log(`❌ Ошибок при импорте: ${results.errors}`);
        console.log(`⏱️  Общее время: ${Math.round(totalTime)} секунд`);
        console.log(`📈 Скорость: ${Math.round(processed/totalTime)} записей/сек`);
        console.log('='.repeat(50));
        
        // Показываем несколько примеров добавленных сайтов
        if (results.added > 0) {
            console.log('\n📋 Примеры добавленных сайтов:');
            const samples = await Site.find().sort({ dateAdded: -1 }).limit(10);
            samples.forEach((site, i) => {
                console.log(`${i + 1}. ${site.name} (ID: ${site.siteId})`);
                if (site.url) console.log(`   URL: ${site.url}`);
            });
        }
        
        console.log('\n✅ Импорт завершен успешно!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    }
}

// Запускаем импорт
console.log('🚀 Запуск импорта институтов из paste.txt\n');
importData();
